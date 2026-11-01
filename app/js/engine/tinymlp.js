/* 浏览器内小样本个性化模型
 * 输入：21 个手部关键点归一化后的 63 维特征
 * 结构：63 → 64 (ReLU) → 32 (ReLU) → N (Softmax)
 * 训练：Adam + 交叉熵 + L2，几十个样本即可在 1–2 秒内完成。
 * 说明：这不是“替代 YOLO 的通用模型”，而是端侧个性化校准，
 *       用于解决不同人手型、拍摄角度带来的域偏移。
 */

const SAMPLE_KEY = 'slbg.gesture.samples.v1';
const MODEL_KEY = 'slbg.gesture.mlp.v1';

function zeros(n) { return new Float32Array(n); }
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function softmax(z) {
  const max = Math.max(...z);
  const e = z.map(v => Math.exp(v - max));
  const s = e.reduce((a, b) => a + b, 0) || 1;
  return e.map(v => v / s);
}

export class FeatureScaler {
  constructor(mean = null, std = null) { this.mean = mean; this.std = std; }
  fit(X) {
    const d = X[0].length;
    this.mean = new Float32Array(d);
    this.std = new Float32Array(d);
    for (const x of X) for (let i = 0; i < d; i++) this.mean[i] += x[i];
    for (let i = 0; i < d; i++) this.mean[i] /= X.length;
    for (const x of X) for (let i = 0; i < d; i++) this.std[i] += (x[i] - this.mean[i]) ** 2;
    for (let i = 0; i < d; i++) this.std[i] = Math.sqrt(this.std[i] / X.length) || 1;
    return this;
  }
  transform(x) {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = (x[i] - this.mean[i]) / this.std[i];
    return out;
  }
  toJSON() { return { mean: [...this.mean], std: [...this.std] }; }
  static fromJSON(o) { return new FeatureScaler(new Float32Array(o.mean), new Float32Array(o.std)); }
}

export class TinyMLP {
  constructor(labels, inDim = 63, hidden = [64, 32], seed = 42) {
    this.labels = labels;
    this.sizes = [inDim, ...hidden, labels.length];
    this.params = [];
    let s = seed >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let l = 0; l < this.sizes.length - 1; l++) {
      const fanIn = this.sizes[l], fanOut = this.sizes[l + 1];
      const scale = Math.sqrt(2 / fanIn);
      const W = new Float32Array(fanIn * fanOut);
      for (let i = 0; i < W.length; i++) W[i] = (rnd() * 2 - 1) * scale * 1.7 + randn() * scale * .1;
      this.params.push({ W, b: zeros(fanOut), mW: zeros(fanIn * fanOut), vW: zeros(fanIn * fanOut), mb: zeros(fanOut), vb: zeros(fanOut) });
    }
    this.t = 0;
  }

  forward(x) {
    const acts = [x];
    let a = x;
    for (let l = 0; l < this.params.length; l++) {
      const { W, b } = this.params[l];
      const nIn = this.sizes[l], nOut = this.sizes[l + 1];
      const z = new Float32Array(nOut);
      for (let o = 0; o < nOut; o++) {
        let sum = b[o];
        for (let i = 0; i < nIn; i++) sum += W[i * nOut + o] * a[i];
        z[o] = sum;
      }
      const last = l === this.params.length - 1;
      a = last ? z : z.map(v => Math.max(0, v));
      acts.push(a);
    }
    return { acts, probs: softmax(Array.from(a)) };
  }

  predict(x) { return this.forward(x).probs; }

  /** 单样本 SGD/Adam 更新，返回交叉熵 */
  step(x, y, lr = 0.01, l2 = 1e-4) {
    const { acts, probs } = this.forward(x);
    let loss = -Math.log(Math.max(1e-9, probs[y]));
    let delta = probs.map((p, i) => p - (i === y ? 1 : 0));
    this.t += 1;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    for (let l = this.params.length - 1; l >= 0; l--) {
      const { W, b, mW, vW, mb, vb } = this.params[l];
      const nIn = this.sizes[l], nOut = this.sizes[l + 1];
      const aPrev = acts[l];
      const dPrev = new Float32Array(nIn);
      for (let i = 0; i < nIn; i++) {
        let g = 0;
        for (let o = 0; o < nOut; o++) g += W[i * nOut + o] * delta[o];
        dPrev[i] = g;
      }
      for (let o = 0; o < nOut; o++) {
        const d = delta[o];
        mb[o] = b1 * mb[o] + (1 - b1) * d;
        vb[o] = b2 * vb[o] + (1 - b2) * d * d;
        const mh = mb[o] / (1 - Math.pow(b1, this.t));
        const vh = vb[o] / (1 - Math.pow(b2, this.t));
        b[o] -= lr * (mh / (Math.sqrt(vh) + eps));
        for (let i = 0; i < nIn; i++) {
          const gw = d * aPrev[i] + l2 * W[i * nOut + o];
          const idx = i * nOut + o;
          mW[idx] = b1 * mW[idx] + (1 - b1) * gw;
          vW[idx] = b2 * vW[idx] + (1 - b2) * gw * gw;
          const mwh = mW[idx] / (1 - Math.pow(b1, this.t));
          const vwh = vW[idx] / (1 - Math.pow(b2, this.t));
          W[idx] -= lr * (mwh / (Math.sqrt(vwh) + eps));
        }
      }
      // 隐层梯度经过 ReLU
      if (l > 0) {
        delta = Array.from(dPrev).map((g, i) => acts[l][i] > 0 ? g : 0);
      }
    }
    return loss;
  }

  toJSON() {
    return {
      labels: this.labels,
      sizes: this.sizes,
      params: this.params.map(p => ({
        W: [...p.W], b: [...p.b],
      })),
    };
  }

  static fromJSON(o) {
    const net = new TinyMLP(o.labels, o.sizes[0], o.sizes.slice(1, -1));
    o.params.forEach((p, i) => {
      net.params[i].W = new Float32Array(p.W);
      net.params[i].b = new Float32Array(p.b);
    });
    return net;
  }
}

export class PersonalModel {
  constructor() {
    this.samples = {};      // { signId: number[][] }
    this.model = null;      // TinyMLP
    this.scaler = null;
    this.centroids = null;  // 单类别 fallback
    this.accuracy = 0;
    this.trainedAt = 0;
    this.lastTrain = null;
    this.load();
  }

  load() {
    try {
      this.samples = JSON.parse(localStorage.getItem(SAMPLE_KEY) || '{}');
    } catch { this.samples = {}; }
    try {
      const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || 'null');
      if (saved?.net && saved?.scaler) {
        this.model = TinyMLP.fromJSON(saved.net);
        this.scaler = FeatureScaler.fromJSON(saved.scaler);
        this.centroids = saved.centroids || null;
        this.accuracy = saved.accuracy || 0;
        this.trainedAt = saved.trainedAt || 0;
      }
    } catch { /* ignore broken model */ }
  }

  classes() { return Object.keys(this.samples).filter(k => this.samples[k]?.length); }

  sampleCount(signId) { return this.samples[signId]?.length || 0; }

  addSample(signId, features) {
    if (!features || features.length !== 63) throw new Error('特征维度应为 63');
    (this.samples[signId] ||= []).push(Array.from(features, v => Number(v.toFixed(5))));
    this.persistSamples();
    return this.sampleCount(signId);
  }

  removeSign(signId) {
    delete this.samples[signId];
    this.persistSamples();
    this.train({ silent: true }).catch(() => {});
  }

  clear() {
    this.samples = {};
    this.model = null;
    this.scaler = null;
    this.centroids = null;
    this.accuracy = 0;
    localStorage.removeItem(SAMPLE_KEY);
    localStorage.removeItem(MODEL_KEY);
  }

  persistSamples() {
    try { localStorage.setItem(SAMPLE_KEY, JSON.stringify(this.samples)); } catch {}
  }

  async train({ epochs = 90, onEpoch, silent = false } = {}) {
    const labels = this.classes();
    if (!labels.length) throw new Error('还没有校准样本');
    const X = [], y = [];
    labels.forEach((label, ci) => {
      for (const s of this.samples[label]) { X.push(s); y.push(ci); }
    });
    if (X.length < 6) throw new Error('样本太少，至少需要 6 个');

    this.scaler = new FeatureScaler().fit(X);
    const Xs = X.map(x => this.scaler.transform(x));

    // 单类别：用类内距离做“是否为目标”的检测
    if (labels.length === 1) {
      const mean = new Float32Array(63);
      for (const x of Xs) for (let i = 0; i < 63; i++) mean[i] += x[i] / Xs.length;
      let varSum = 0;
      for (const x of Xs) for (let i = 0; i < 63; i++) varSum += (x[i] - mean[i]) ** 2;
      const std = Math.sqrt(varSum / (Xs.length * 63)) || 1;
      this.centroids = { label: labels[0], mean: [...mean], std };
      this.model = null;
      this.accuracy = 1;
      this.trainedAt = Date.now();
      this.persistModel();
      return { labels, accuracy: 1, loss: 0, samples: X.length, mode: 'centroid' };
    }

    this.model = new TinyMLP(labels, 63, [64, 32]);
    const idx = Xs.map((_, i) => i);
    let lastLoss = 0;
    const bs = Math.min(16, Math.max(4, Math.floor(Xs.length / 6)));
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      let total = 0;
      for (let k = 0; k < idx.length; k += bs) {
        const batch = idx.slice(k, k + bs);
        for (const i of batch) {
          const x = this.#augment(Xs[i]);
          total += this.model.step(x, y[i], 0.012, 2e-4);
        }
      }
      lastLoss = total / idx.length;
      if (onEpoch) onEpoch(ep + 1, epochs, lastLoss);
      if ((ep + 1) % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // 训练集准确率（带增强，偏乐观；仅用于给用户一个即时反馈）
    let correct = 0;
    for (let i = 0; i < Xs.length; i++) {
      const p = this.model.predict(Xs[i]);
      if (p.indexOf(Math.max(...p)) === y[i]) correct++;
    }
    this.accuracy = correct / Xs.length;
    this.trainedAt = Date.now();
    this.lastTrain = { epochs, loss: lastLoss };
    this.persistModel();
    if (!silent) {}
    return { labels, accuracy: this.accuracy, loss: lastLoss, samples: X.length, mode: 'mlp' };
  }

  #augment(x) {
    const out = new Float32Array(x.length);
    const scale = 0.985 + Math.random() * 0.03;
    const shift = (Math.random() - 0.5) * 0.06;
    for (let i = 0; i < x.length; i++) {
      out[i] = x[i] * scale + shift + (Math.random() - 0.5) * 0.035;
    }
    return out;
  }

  persistModel() {
    try {
      const payload = {
        net: this.model?.toJSON() || null,
        scaler: this.scaler?.toJSON() || null,
        centroids: this.centroids,
        accuracy: this.accuracy,
        trainedAt: this.trainedAt,
      };
      localStorage.setItem(MODEL_KEY, JSON.stringify(payload));
    } catch {}
  }

  predict(features) {
    if (!this.scaler) return null;
    const x = this.scaler.transform(features);
    if (this.centroids && !this.model) {
      const c = this.centroids;
      let d2 = 0;
      for (let i = 0; i < x.length; i++) d2 += (x[i] - c.mean[i]) ** 2;
      d2 /= x.length; // 每维平均平方距离（单位是"训练集标准差的平方"）
      // 容忍半径取 1.5σ：训练样本自身（≈1σ）得 ~0.8 分，2σ 外降到 0.4 以下。
      // 直接用 1σ 会让"最像自己的样本"也只有 0.6 分，不利于和 YOLO 阈值统一。
      const tol = 1.5 * c.std;
      const score = Math.exp(-d2 / (2 * tol * tol));
      return [{ signId: c.label, score: Math.max(0, Math.min(1, score)) }];
    }
    if (!this.model) return null;
    const probs = this.model.predict(x);
    return this.model.labels
      .map((signId, i) => ({ signId, score: probs[i] }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 留一交叉验证（LOO-CV）：每次留 1 个样本当测试集，其余训练。
   * 比 train() 返回的"训练集准确率"诚实得多，用来给用户一个可信的可用率。
   * 样本多时较慢（n 次训练），默认只跑 25 轮。
   */
  async evaluate({ epochs = 25, onProgress } = {}) {
    const labels = this.classes();
    const flat = [];
    for (const label of labels) {
      for (const s of this.samples[label]) flat.push({ label, x: s });
    }
    if (flat.length < 4) return null;
    let correct = 0;
    const confusion = {};
    for (let i = 0; i < flat.length; i++) {
      const trainSet = flat.filter((_, j) => j !== i);
      const trainLabels = [...new Set(trainSet.map((r) => r.label))];
      if (trainLabels.length < 2) {
        // 只剩一类时留一法无意义，跳过不计入
        continue;
      }
      const scaler = new FeatureScaler().fit(trainSet.map((r) => r.x));
      const net = new TinyMLP(trainLabels, 63, [64, 32], 7);
      const Xs = trainSet.map((r) => scaler.transform(r.x));
      const y = trainSet.map((r) => trainLabels.indexOf(r.label));
      for (let ep = 0; ep < epochs; ep++) {
        for (let k = 0; k < Xs.length; k++) net.step(Xs[k], y[k], 0.02, 2e-4);
      }
      const probs = net.predict(scaler.transform(flat[i].x));
      const pred = trainLabels[probs.indexOf(Math.max(...probs))];
      const key = `${flat[i].label}→${pred}`;
      confusion[key] = (confusion[key] || 0) + 1;
      if (pred === flat[i].label) correct += 1;
      onProgress?.(i + 1, flat.length);
      if ((i + 1) % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const counted = Object.values(confusion).reduce((a, b) => a + b, 0) || 1;
    return {
      accuracy: correct / counted,
      n: counted,
      confusion,
      labels,
      honest: true,
    };
  }

  /** 导出模型与样本（JSON），便于备份或迁移到另一台设备。 */
  exportJSON() {
    return {
      schema: 'slbg.gesture.personal/1',
      exportedAt: new Date().toISOString(),
      samples: this.samples,
      net: this.model?.toJSON() || null,
      scaler: this.scaler?.toJSON() || null,
      centroids: this.centroids || null,
      accuracy: this.accuracy,
      trainedAt: this.trainedAt,
    };
  }

  importJSON(payload) {
    if (!payload || payload.schema !== 'slbg.gesture.personal/1') {
      throw new Error('这不是本项目导出的个性化模型文件');
    }
    this.samples = payload.samples || {};
    this.scaler = payload.scaler ? FeatureScaler.fromJSON(payload.scaler) : null;
    this.model = payload.net ? TinyMLP.fromJSON(payload.net) : null;
    this.centroids = payload.centroids || null;
    this.accuracy = payload.accuracy || 0;
    this.trainedAt = payload.trainedAt || 0;
    this.persistSamples();
    this.persistModel();
  }

  info() {
    return {
      classes: this.classes(),
      samples: Object.values(this.samples).reduce((a, b) => a + b.length, 0),
      accuracy: this.accuracy,
      trainedAt: this.trainedAt,
      hasModel: !!(this.model || this.centroids),
      mode: this.model ? 'mlp' : this.centroids ? 'centroid' : 'none',
    };
  }
}

export const personalModel = new PersonalModel();
