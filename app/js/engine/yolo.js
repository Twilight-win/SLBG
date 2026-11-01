/**
 * YOLO 推理引擎（浏览器内 ONNX Runtime Web）
 *
 * 三条硬性约定，用来避免旧版"永远 0 检测"的三类错误：
 *   1. 输入尺寸、类别表、阈值全部来自 models/manifest.json，不读 session.inputMetadata（ORT Web 通常不暴露）；
 *   2. letterbox 等比缩放 + 灰边，不做中心裁剪；
 *   3. 解码交给纯函数 decoder.js，可单测，不夹在 DOM 代码里。
 */

import { decodeYoloOutput, letterboxMeta } from './decoder.js';

/** 引擎所在目录（app/js/engine/yolo.js → app/），保证站点入口在根目录也能正确取到模型 */
export const APP_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');

export class YoloEngine {
  constructor(baseUrl = APP_BASE) {
    this.base = baseUrl;
    this.manifest = null;
    this.session = null;
    this.inputName = 'images';
    this.size = 320;
    this.ready = false;
    this.stats = { loadMs: 0, inferMs: 0, frames: 0, lastShape: null };
    this._canvas = null;
    this._ctx = null;
    this._buf = null;
  }

  /** 加载 manifest（必须先于 loadSession，因为类别表决定解码方式）。 */
  async loadManifest(url = `${this.base}/models/manifest.json`) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest 加载失败：HTTP ${res.url && res.status ? res.status : ''}`);
    this.manifest = await res.json();
    this.size = this.manifest?.input?.width || 320;
    this.inputName = this.manifest?.input?.name || 'images';
    this.classes = this.manifest?.classes || [];
    this.thresholds = this.manifest?.thresholds || { score: 0.35, iou: 0.45 };
    return this.manifest;
  }

  async loadSession({ onProgress } = {}) {
    if (!this.manifest) await this.loadManifest();
    const ort = globalThis.ort;
    if (!ort) throw new Error('ort 未加载：请确认 app/vendor/ort/ort.wasm.min.js 已引入');
    // 绝对 URL，避免相对路径在子路由下解析出错
    ort.env.wasm.wasmPaths = new URL(`${this.base}/vendor/ort/`, location.href).href;
    // 单线程：不依赖 COOP/COEP，普通本地服务器即可运行；多线程会回退并报警告
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.simd = true;

    const t0 = performance.now();
    onProgress?.('正在下载手势模型…');
    this.session = await ort.InferenceSession.create(`${this.base}/models/${this.manifest.model}`, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    this.stats.loadMs = Math.round(performance.now() - t0);
    this.ready = true;
    return this.stats.loadMs;
  }

  /**
   * 对一帧（video / canvas / image）做推理。
   * @returns {{detections:Array, ms:number, shape:number[], meta:object}}
   */
  async detect(source, sw, sh) {
    if (!this.session) throw new Error('模型未加载，请先调用 loadSession()');
    const t0 = performance.now();
    const tensor = this._toTensor(source, sw, sh);
    const feeds = { [this.inputName]: tensor };
    const out = await this.session.run(feeds);
    const value = Object.values(out)[0];
    const dims = value.dims.map(Number);
    this.stats.lastShape = dims;

    const detections = decodeYoloOutput(Float32Array.from(value.data), dims, {
      classes: this.classes,
      thresholds: this.thresholds,
      meta: this._lastMeta,
      sw,
      sh,
    });
    const ms = performance.now() - t0;
    this.stats.inferMs = ms;
    this.stats.frames += 1;
    return { detections, ms, shape: dims, meta: this._lastMeta };
  }

  /** 图像 -> NCHW float32 张量（letterbox + RGB + 0-1） */
  _toTensor(source, sw, sh) {
    const size = this.size;
    if (!this._canvas) {
      this._canvas = document.createElement('canvas');
      this._canvas.width = size;
      this._canvas.height = size;
      this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this._ctx;
    const meta = letterboxMeta(sw, sh, size, this.manifest?.input?.pad ?? 114);
    this._lastMeta = meta;

    ctx.fillStyle = `rgb(${meta.padValue},${meta.padValue},${meta.padValue})`;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, sw, sh, meta.padX, meta.padY, meta.innerW, meta.innerH);

    const img = ctx.getImageData(0, 0, size, size).data;
    const n = size * size;
    if (!this._buf || this._buf.length !== n * 3) this._buf = new Float32Array(n * 3);
    const buf = this._buf;
    for (let i = 0, p = 0; i < img.length; i += 4, p += 1) {
      buf[p] = img[i] / 255; // R
      buf[n + p] = img[i + 1] / 255; // G
      buf[2 * n + p] = img[i + 2] / 255; // B
    }
    const ort = globalThis.ort;
    return new ort.Tensor('float32', buf, [1, 3, size, size]);
  }

  /** 模型认识的词条 id 列表（AI 判定类游戏只从这里出题） */
  knownSignIds() {
    return (this.classes || []).map((c) => c.signId).filter(Boolean);
  }

  info() {
    return {
      name: this.manifest?.name,
      version: this.manifest?.version,
      classes: this.classes?.map((c) => c.name),
      size: this.size,
      loadMs: this.stats.loadMs,
      lastShape: this.stats.lastShape,
      trainedAt: this.manifest?.trainedAt,
    };
  }
}
