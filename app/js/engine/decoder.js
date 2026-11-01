/**
 * YOLO 输出解码 —— 纯函数，不依赖 DOM / ORT / 摄像头。
 * 目的：可以在 Node 里直接单测（tools/test_decoder.mjs），把"框算错"和"模型没检出"两件事分开。
 *
 * 支持的输出布局：
 *   [1, 4+C, N]   无 objectness，通道优先
 *   [1, 5+C, N]   带 objectness，通道优先   ← 当前 best.onnx 是 [1,5,2100]
 *   [1, N, 4+C] / [1, N, 5+C]   anchor 优先
 */

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** 类别感知 NMS：只有同类别之间才互相抑制，避免"手"和"数字"被误删。 */
export function nms(boxes, iouThreshold = 0.45, limit = 20) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep = [];
  for (const b of sorted) {
    if (keep.length >= limit) break;
    if (keep.every((k) => k.classId !== b.classId || iou(k, b) < iouThreshold)) keep.push(b);
  }
  return keep;
}

/**
 * 判断输出张量布局。
 * @returns {{attrs:number, count:number, channelFirst:boolean}}
 */
export function inferLayout(dims) {
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error(`无法识别的输出形状：[${(dims || []).join(', ')}]`);
  }
  const [, a, b] = dims;
  // 通道数通常很小（<= 128），anchor 数通常很大（> 128）
  if (a <= 128 && b > 128) return { attrs: a, count: b, channelFirst: true, ambiguous: false };
  if (b <= 128 && a > 128) return { attrs: b, count: a, channelFirst: false, ambiguous: false };
  // 两边都很小（例如手工构造的测试张量）：按 YOLO 惯例判为通道优先
  if (a <= 128 && b <= 128) return { attrs: a, count: b, channelFirst: true, ambiguous: true };
  throw new Error(`无法判断输出布局：[${dims.join(', ')}]`);
}

/**
 * @param {Float32Array|number[]} data 原始输出
 * @param {number[]} dims 输出形状
 * @param {object} opts
 * @param {Array} opts.classes 类别表，来自 manifest.classes
 * @param {{score:number, iou:number}} opts.thresholds
 * @param {{scale:number, padX:number, padY:number}} opts.meta letterbox 变换
 * @param {number} opts.sw 源图宽
 * @param {number} opts.sh 源图高
 */
export function decodeYoloOutput(data, dims, opts = {}) {
  const { classes = [], thresholds = {}, meta = { scale: 1, padX: 0, padY: 0 }, sw = 0, sh = 0 } = opts;
  if (!sw || !sh) throw new Error('decodeYoloOutput 需要有效的源图宽高');
  if (!meta.scale || !Number.isFinite(meta.scale)) throw new Error('letterbox scale 无效');

  const { attrs, count, channelFirst } = inferLayout(dims);
  const nc = classes.length || 1;
  // 有 objectness 时：4 box + 1 obj + C；否则 4 box + C
  const hasObj = attrs === 4 + nc + 1;
  const nCls = hasObj ? attrs - 5 : attrs - 4;
  if (nCls <= 0) throw new Error(`输出通道数异常：attrs=${attrs}, classes=${nc}`);

  const at = (i, c) => (channelFirst ? data[c * count + i] : data[i * attrs + c]);
  const scoreThreshold = thresholds.score ?? 0.35;
  const raw = [];

  for (let i = 0; i < count; i++) {
    let best = -1;
    let bestScore = 0;
    const usable = Math.min(nCls, nc);
    for (let c = 0; c < usable; c++) {
      const s = at(i, 4 + (hasObj ? 1 : 0) + c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best < 0) continue;
    const obj = hasObj ? at(i, 4) : 1;
    const score = bestScore * obj;
    if (score < scoreThreshold) continue;

    const cx = at(i, 0);
    const cy = at(i, 1);
    const w = at(i, 2);
    const h = at(i, 3);
    if (![cx, cy, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;

    // 从 letterbox 画布坐标还原到源图坐标
    const x = (cx - w / 2 - meta.padX) / meta.scale;
    const y = (cy - h / 2 - meta.padY) / meta.scale;
    const bx = clamp(x, 0, sw);
    const by = clamp(y, 0, sh);
    const bw = clamp(w / meta.scale, 1, sw - bx);
    const bh = clamp(h / meta.scale, 1, sh - by);

    const cls = classes[best] || { id: best, name: `class_${best}`, signId: null };
    raw.push({
      classId: best,
      className: cls.name,
      signId: cls.signId || null,
      label: cls.zh || cls.name,
      score,
      x: bx,
      y: by,
      w: bw,
      h: bh,
      nx: bx / sw,
      ny: by / sh,
      nw: bw / sw,
      nh: bh / sh,
      cx: bx + bw / 2,
      cy: by + bh / 2,
    });
  }
  return nms(raw, thresholds.iou ?? 0.45);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * letterbox 参数计算：等比缩放 + 灰边填充。
 * 用 letterbox 而不是中心裁剪，是因为裁剪会切掉手指尖——手势识别最怕这个。
 */
export function letterboxMeta(sw, sh, size, pad = 114) {
  const scale = Math.min(size / sw, size / sh);
  const nw = Math.max(1, Math.round(sw * scale));
  const nh = Math.max(1, Math.round(sh * scale));
  return {
    scale,
    padX: Math.floor((size - nw) / 2),
    padY: Math.floor((size - nh) / 2),
    padValue: pad,
    innerW: nw,
    innerH: nh,
    size,
  };
}

/** 源图坐标 -> 舞台（CSS 像素）坐标：cover 映射，只翻转一次。 */
export function coverMapper(srcW, srcH, stageW, stageH) {
  const scale = Math.max(stageW / srcW, stageH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (stageW - dw) / 2;
  const dy = (stageH - dh) / 2;
  return (x, y) => ({ x: x * scale + dx, y: y * scale + dy });
}
