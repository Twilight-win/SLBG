/**
 * 能力中心 —— 整个网站"能玩什么"的唯一真相来源。
 *
 * 旧版的 bug：游戏直接对全部 17 个词条随机出题，而 YOLO 只有 1 个类，
 * 于是界面会喊"请比出：八"，模型却只会输出 gesture_6，判定永远失败。
 *
 * 现在：
 *   playable()  = YOLO 认识的类 ∪ 端侧模型已训练的类（并集，去重）
 *   knowledge() = 全部词条（不需要摄像头识别的游戏用）
 * 任何 AI 判定类游戏，题池只能来自 playable()。playable() 为空时，
 * 游戏页会明确提示"先去端侧训练营解锁"，而不是假装能玩。
 */

import { activeSigns, signById } from '../data/signs.js';

export class Capability {
  /**
   * @param {import('./yolo.js').YoloEngine} yolo
   * @param {import('./tinymlp.js').PersonalModel} personal
   */
  constructor(yolo, personal) {
    this.yolo = yolo;
    this.personal = personal;
  }

  /** YOLO 认识的词条（来自 manifest.classes 的 signId 映射） */
  yoloSignIds() {
    const ids = new Set();
    for (const c of this.yolo.classes || []) {
      if (c.signId && signById[c.signId]) ids.add(c.signId);
    }
    return [...ids];
  }

  /** 端侧个性化模型已训练的词条 */
  personalSignIds() {
    const ids = [];
    for (const id of this.personal.classes()) {
      if (signById[id]) ids.push(id);
    }
    return ids;
  }

  /** 可以进 AI 判定题池的词条对象 */
  playable() {
    const ids = new Set([...this.yoloSignIds(), ...this.personalSignIds()]);
    return activeSigns.filter((s) => ids.has(s.id));
  }

  /** 每个可玩词条的判定来源，用于 UI 上标注徽标 */
  sourceOf(signId) {
    if (this.yoloSignIds().includes(signId) && this.personalSignIds().includes(signId)) return 'fused';
    if (this.yoloSignIds().includes(signId)) return 'yolo';
    if (this.personalSignIds().includes(signId)) return 'personal';
    return null;
  }

  /** 不需要识别的游戏用：全部非筹备中词条 */
  knowledge() {
    return activeSigns;
  }

  /** 可以在端侧训练营里解锁的词条（静态手型才稳定） */
  trainable() {
    return activeSigns.filter((s) => s.trainable);
  }

  /**
   * 融合判定：把一帧的 YOLO 检测与端侧模型预测合成一个结果。
   * @returns {{signId:string|null, score:number, source:string, conflict:boolean, yolo:object|null, personal:object|null}}
   */
  classify({ detections = [], features = null } = {}) {
    const thr = this.yolo.thresholds?.score ?? 0.35;
    let yoloTop = null;
    for (const d of detections) {
      if (d.signId && (!yoloTop || d.score > yoloTop.score)) yoloTop = { signId: d.signId, score: d.score, box: d };
    }
    let personalTop = null;
    if (features && this.personal.info().hasModel) {
      const p = this.personal.predict(features);
      if (p?.length) personalTop = { signId: p[0].signId, score: p[0].score, all: p };
    }

    if (yoloTop && personalTop) {
      if (yoloTop.signId === personalTop.signId) {
        // 两个模型意见一致：置信度取加权，明显高于单模型
        const score = Math.min(0.999, 0.65 * yoloTop.score + 0.35 * personalTop.score + 0.08);
        return { signId: yoloTop.signId, score, source: 'fused', conflict: false, yolo: yoloTop, personal: personalTop };
      }
      const winner = yoloTop.score >= personalTop.score ? yoloTop : personalTop;
      return {
        signId: winner.signId,
        score: winner.score * 0.9,
        source: winner === yoloTop ? 'yolo' : 'personal',
        conflict: true,
        yolo: yoloTop,
        personal: personalTop,
      };
    }
    if (yoloTop) return { signId: yoloTop.signId, score: yoloTop.score, source: 'yolo', conflict: false, yolo: yoloTop, personal: null };
    if (personalTop) return { signId: personalTop.signId, score: personalTop.score, source: 'personal', conflict: false, yolo: null, personal: personalTop };
    return { signId: null, score: 0, source: 'none', conflict: false, yolo: null, personal: null };
  }

  statusText() {
    const y = this.yoloSignIds().length;
    const p = this.personalSignIds().length;
    if (y + p === 0) return '暂无可识别词条';
    return `YOLO ${y} 类 · 端侧 ${p} 类`;
  }
}

/**
 * 保持判定器：目标手势必须连续稳定保持 holdMs 才算通过。
 * 防止"手一晃闪过 0.4 秒就算对"。
 */
export class HoldTracker {
  constructor({ holdMs = 1200, threshold = 0.35 } = {}) {
    this.holdMs = holdMs;
    this.threshold = threshold;
    this.target = null;
    this.start = 0;
    this.progress = 0;
    this.best = 0;
  }

  reset(target = null) {
    this.target = target;
    this.start = 0;
    this.progress = 0;
    this.best = 0;
  }

  /**
   * @returns {{holding:boolean, done:boolean, progress:number, score:number, matched:boolean}}
   */
  update(result, now = performance.now()) {
    const matched = !!result?.signId && result.signId === this.target && result.score >= this.threshold;
    if (!matched) {
      this.start = 0;
      this.progress = 0;
      return { holding: false, done: false, progress: 0, score: result?.score || 0, matched: false };
    }
    if (!this.start) this.start = now;
    const elapsed = now - this.start;
    this.progress = Math.min(1, elapsed / this.holdMs);
    this.best = Math.max(this.best, result.score);
    return {
      holding: true,
      done: elapsed >= this.holdMs,
      progress: this.progress,
      score: result.score,
      matched: true,
    };
  }
}
