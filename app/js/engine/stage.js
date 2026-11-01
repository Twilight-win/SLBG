/**
 * 摄像头舞台：视频 + 覆盖层 + 推理循环。
 * 所有需要摄像头的游戏复用这一个组件，避免每个游戏各自写一遍坐标映射
 * （旧版"框画错位"的根因就是三处地方各写了一套坐标变换）。
 */

import { coverMapper } from './decoder.js';
import { drawHand } from './landmarks.js';

export class Stage {
  /**
   * @param {HTMLElement} host
   * @param {{yolo:object, hands:object, capability:object}} deps
   */
  constructor(host, deps = {}) {
    this.host = host;
    this.yolo = deps.yolo;
    this.hands = deps.hands;
    this.capability = deps.capability;
    this.stream = null;
    this.running = false;
    this.mirror = true;
    this.showLandmarks = true;
    this.showBoxes = true;
    this.onFrame = null;
    this.onError = null;
    this.fps = 0;
    this._frames = 0;
    this._fpsAt = 0;
    this._raf = 0;
    this._buildDom();
  }

  _buildDom() {
    this.host.innerHTML = `
      <div class="stage">
        <video class="stage-video" playsinline muted autoplay></video>
        <canvas class="stage-canvas"></canvas>
        <div class="stage-empty" hidden></div>
      </div>`;
    this.video = this.host.querySelector('video');
    this.canvas = this.host.querySelector('canvas');
    this.empty = this.host.querySelector('.stage-empty');
    this.ctx = this.canvas.getContext('2d');
    this.video.addEventListener('loadedmetadata', () => this._resize());
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.host);
    }
  }

  _resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.stageW = r.width;
    this.stageH = r.height;
    this.dpr = dpr;
  }

  async start({ facingMode = 'user', mirror = true } = {}) {
    this.mirror = mirror;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前环境不支持摄像头：请用 http://127.0.0.1 或 https 打开，file:// 无法调用摄像头');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.video.style.transform = mirror ? 'scaleX(-1)' : 'none';
    this.running = true;
    this._resize();
    this._loop();
    this.empty.hidden = true;
    return this;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  message(text) {
    this.empty.hidden = !text;
    this.empty.textContent = text || '';
  }

  _loop = async () => {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      try {
        const sw = v.videoWidth;
        const sh = v.videoHeight;
        const t0 = performance.now();
        let detections = [];
        let features = null;
        let landmarks = null;
        let shape = null;

        if (this.yolo?.ready) {
          const r = await this.yolo.detect(v, sw, sh);
          detections = r.detections;
          shape = r.shape;
        }
        if (this.hands?.ready) {
          try {
            const h = this.hands.detect(v);
            features = h.features;
            landmarks = h.landmarks;
          } catch { /* 关键点失败不影响主流程 */ }
        }
        const result = this.capability ? this.capability.classify({ detections, features }) : null;
        const ms = performance.now() - t0;

        this._frames += 1;
        if (!this._fpsAt) this._fpsAt = t0;
        if (t0 - this._fpsAt >= 500) {
          this.fps = Math.round((this._frames * 1000) / (t0 - this._fpsAt));
          this._frames = 0;
          this._fpsAt = t0;
        }
        this._draw({ detections, landmarks, sw, sh });
        this.onFrame?.({ detections, features, landmarks, result, ms, fps: this.fps, shape });
      } catch (err) {
        this.onError?.(err);
      }
    }
    this._raf = requestAnimationFrame(this._loop);
  };

  _draw({ detections, landmarks, sw, sh }) {
    const ctx = this.ctx;
    if (!ctx || !this.stageW) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.stageW, this.stageH);
    const map = coverMapper(sw, sh, this.stageW, this.stageH);
    // 视频被 CSS 镜像过，覆盖层同步镜像一次，保证框与手重合
    if (this.mirror) {
      ctx.translate(this.stageW, 0);
      ctx.scale(-1, 1);
    }
    if (this.showBoxes) {
      for (const d of detections || []) {
        const p = map(d.x, d.y);
        const q = map(d.x + d.w, d.y + d.h);
        const w = q.x - p.x;
        const h = q.y - p.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(110,231,183,.95)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.fillStyle = 'rgba(110,231,183,.14)';
        ctx.fillRect(p.x, p.y, w, h);
        const label = `${d.label} ${(d.score * 100).toFixed(0)}%`;
        ctx.font = '600 13px system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(12,22,28,.86)';
        ctx.fillRect(p.x, Math.max(0, p.y - 22), tw + 12, 21);
        ctx.fillStyle = '#6ee7b7';
        ctx.fillText(label, p.x + 6, Math.max(14, p.y - 6));
        ctx.restore();
      }
    }
    if (this.showLandmarks && landmarks) drawHand(ctx, landmarks, (x, y) => map(x * sw, y * sh));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** 抓一帧（用于保存样本 / 生成缩略图） */
  snapshot(maxSide = 480) {
    const sw = this.video.videoWidth;
    const sh = this.video.videoHeight;
    if (!sw) return null;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    const cx = c.getContext('2d');
    if (this.mirror) {
      cx.translate(c.width, 0);
      cx.scale(-1, 1);
    }
    cx.drawImage(this.video, 0, 0, c.width, c.height);
    return c;
  }
}
