/* MediaPipe HandLandmarker 封装 + 21 点归一化特征
 * 关键点比像素更抗光照/背景变化，适合做端侧个性化小模型。
 */

const MP_BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function normalizeHand(lm) {
  // 以手腕为原点、 wrist→middle MCP 为“上”方向做旋转 + 尺度归一化
  const w = lm[0], m = lm[9];
  const dx = m.x - w.x, dy = m.y - w.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const a = -Math.PI / 2 - Math.atan2(dy, dx);
  const cos = Math.cos(a), sin = Math.sin(a);
  const out = new Float32Array(lm.length * 3);
  for (let i = 0; i < lm.length; i++) {
    const px = (lm[i].x - w.x) / len;
    const py = (lm[i].y - w.y) / len;
    out[i * 3] = px * cos - py * sin;
    out[i * 3 + 1] = px * sin + py * cos;
    out[i * 3 + 2] = (lm[i].z || 0) / len;
  }
  return out;
}

export function handBBox(lm, pad = 0.12) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  let w = maxX - minX, h = maxY - minY;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  w *= 1 + pad * 2; h *= 1 + pad * 2;
  const x = Math.max(0, cx - w / 2), y = Math.max(0, cy - h / 2);
  return {
    x, y,
    w: Math.min(1 - x, w),
    h: Math.min(1 - y, h),
  };
}

export class HandLandmarker {
  constructor() {
    this.detector = null;
    this.ready = false;
    this.loading = false;
    this.error = null;
    this.lastTs = 0;
    this.smooth = null;
    this.delegate = 'GPU';
  }

  async load() {
    if (this.ready) return this;
    if (this.loading) throw new Error('手部关键点模型正在加载');
    this.loading = true;
    try {
      const mp = await import('../../vendor/mediapipe/vision_bundle.mjs');
      const fileset = await mp.FilesetResolver.forVisionTasks(MP_BASE + 'wasm');
      const options = {
        baseOptions: { modelAssetPath: MP_BASE + 'hand_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      try {
        this.detector = await mp.HandLandmarker.createFromOptions(fileset, options);
        this.delegate = 'GPU';
      } catch (gpuErr) {
        options.baseOptions.delegate = 'CPU';
        this.detector = await mp.HandLandmarker.createFromOptions(fileset, options);
        this.delegate = 'CPU';
      }
      this.ready = true;
      return this;
    } catch (err) {
      this.error = err;
      throw err;
    } finally {
      this.loading = false;
    }
  }

  detect(video, { smooth = true } = {}) {
    if (!this.ready) throw new Error('关键点模型尚未就绪');
    const now = performance.now();
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;
    this.lastTs = ts;
    const res = this.detector.detectForVideo(video, ts);
    return this.#post(res, smooth);
  }

  async detectImage(source) {
    if (!this.ready) throw new Error('关键点模型尚未就绪');
    await this.detector.setOptions({ runningMode: 'IMAGE' });
    try {
      const res = this.detector.detect(source);
      return this.#post(res, false);
    } finally {
      await this.detector.setOptions({ runningMode: 'VIDEO' });
    }
  }

  #post(res, smooth) {
    const hands = res.landmarks || [];
    if (!hands.length) {
      this.smooth = null;
      return { hands: [], handedness: [], landmarks: null, features: null, bbox: null };
    }
    const raw = hands[0];
    if (smooth) {
      if (!this.smooth) this.smooth = raw.map(p => ({ ...p }));
      else {
        const a = 0.55;
        this.smooth = raw.map((p, i) => ({
          x: this.smooth[i].x * (1 - a) + p.x * a,
          y: this.smooth[i].y * (1 - a) + p.y * a,
          z: (this.smooth[i].z || 0) * (1 - a) + (p.z || 0) * a,
        }));
      }
    }
    const lm = smooth && this.smooth ? this.smooth : raw;
    return {
      hands: hands.length,
      handedness: (res.handedness || []).map(h => h?.[0]?.categoryName || ''),
      landmarks: lm,
      features: normalizeHand(lm),
      bbox: handBBox(lm),
    };
  }

  dispose() {
    try { this.detector?.close?.(); } catch {}
    this.detector = null;
    this.ready = false;
  }
}

export function drawHand(ctx, lm, mapper, { color = '#7ff2cf', line = 'rgba(127,242,207,.75)', width = 2.5 } = {}) {
  if (!lm?.length) return;
  const pts = lm.map(p => mapper(p.x, p.y));
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  }
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}
