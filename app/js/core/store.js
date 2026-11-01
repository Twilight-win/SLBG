/**
 * 本地进度存储（仅 localStorage，数据不出设备）
 * 记录 XP / 等级 / 连续天数 / 练习历史 / 每种游戏成绩 / 词条掌握度（SM-2 式复习队列）
 */

const KEY = 'slbg.progress.v1';

const DEFAULT = {
  xp: 0,
  streak: 0,
  lastDay: '',
  history: [], // { t, signId, ok, score, source, game }
  games: {}, // { gameId: { plays, best, lastAt } }
  captures: 0,
  trainRuns: 0,
  mastery: {}, // signId -> { ease, interval, due, reps, lapses, ok, fail }
  badges: [],
  customSigns: [], // 用户自建词条，结构同 data/signs.js 的词条；随进度一起导出/导入
  settings: { holdMs: 1200, mirror: true, showLandmarks: true, captureEndpoint: '' },
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export const store = {
  state: structuredClone(DEFAULT),

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw) this.state = { ...structuredClone(DEFAULT), ...raw, settings: { ...DEFAULT.settings, ...(raw.settings || {}) } };
    } catch {
      this.state = structuredClone(DEFAULT);
    }
    this._touchDay();
    return this.state;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch { /* 隐私模式下可能失败，忽略 */ }
  },

  _touchDay() {
    const t = today();
    if (!this.state.lastDay) {
      this.state.lastDay = t;
      this.state.streak = 1;
    } else if (this.state.lastDay !== t) {
      const gap = daysBetween(this.state.lastDay, t);
      this.state.streak = gap === 1 ? this.state.streak + 1 : 1;
      this.state.lastDay = t;
    }
    this.save();
  },

  get xp() { return this.state.xp; },
  get level() { return Math.floor(Math.sqrt(this.state.xp / 50)) + 1; },
  levelProgress() {
    const lvl = this.level;
    const base = (lvl - 1) ** 2 * 50;
    const next = lvl ** 2 * 50;
    return { lvl, cur: this.state.xp - base, need: next - base, pct: Math.min(1, (this.state.xp - base) / (next - base)) };
  },

  addXP(n, reason = '') {
    this.state.xp += n;
    this.save();
    return { xp: this.state.xp, reason };
  },

  /** 记录一次练习/判定结果，并更新 SM-2 掌握度 */
  record({ signId, ok, score = 0, source = 'none', game = '' }) {
    this.state.history.unshift({ t: Date.now(), signId, ok, score: Number(score.toFixed(3)), source, game });
    if (this.state.history.length > 500) this.state.history.length = 500;

    const m = (this.state.mastery[signId] ||= { ease: 2.5, interval: 0, due: today(), reps: 0, lapses: 0, ok: 0, fail: 0 });
    if (ok) {
      m.ok += 1;
      m.reps += 1;
      m.ease = Math.max(1.3, m.ease + 0.1 - (score < 0.6 ? 0.08 : 0));
      m.interval = m.reps === 1 ? 1 : m.reps === 2 ? 3 : Math.round(m.interval * m.ease) || 1;
      this.addXP(8 + Math.round(score * 12));
    } else {
      m.fail += 1;
      m.lapses += 1;
      m.ease = Math.max(1.3, m.ease - 0.2);
      m.interval = 1;
      m.reps = 0;
    }
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, m.interval));
    m.due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.save();
    return m;
  },

  /** 记录一局游戏 */
  gameResult(gameId, score, extra = {}) {
    const g = (this.state.games[gameId] ||= { plays: 0, best: 0, lastAt: 0 });
    g.plays += 1;
    g.best = Math.max(g.best, score);
    g.lastAt = Date.now();
    Object.assign(g, extra);
    this.addXP(score);
    this.save();
    return g;
  },

  bumpCapture(n = 1) {
    this.state.captures += n;
    this.save();
  },

  bumpTrain() {
    this.state.trainRuns += 1;
    this.save();
  },

  /** 今日复习队列：到期的词条 */
  reviewQueue() {
    const t = today();
    return Object.entries(this.state.mastery)
      .filter(([, m]) => m.due <= t)
      .map(([signId, m]) => ({ signId, ...m }))
      .sort((a, b) => (a.due < b.due ? -1 : 1));
  },

  masteryOf(signId) {
    return this.state.mastery[signId] || null;
  },

  /** 近 n 天练习曲线 */
  trend(days = 14) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const n = this.state.history.filter((h) => {
        const hd = new Date(h.t);
        const hk = `${hd.getFullYear()}-${String(hd.getMonth() + 1).padStart(2, '0')}-${String(hd.getDate()).padStart(2, '0')}`;
        return hk === key;
      }).length;
      out.push({ day: key, count: n });
    }
    return out;
  },

  /** 检查并解锁徽章，返回新解锁列表 */
  syncBadges(badges) {
    const got = [];
    for (const b of badges) {
      if (this.state.badges.includes(b.id)) continue;
      if (b.check(this.state)) {
        this.state.badges.push(b.id);
        got.push(b);
      }
    }
    if (got.length) this.save();
    return got;
  },

  reset() {
    this.state = structuredClone(DEFAULT);
    this.save();
  },

  // ── 自建词条（词工坊产出的东西，随进度一起备份） ────────────────
  customSignList() {
    return this.state.customSigns || [];
  },

  addCustomSign(sign) {
    this.state.customSigns ||= [];
    const i = this.state.customSigns.findIndex((s) => s.id === sign.id);
    if (i >= 0) this.state.customSigns[i] = sign;
    else this.state.customSigns.push(sign);
    this.save();
    return sign;
  },

  removeCustomSign(id) {
    this.state.customSigns = (this.state.customSigns || []).filter((s) => s.id !== id);
    this.save();
  },

  updateSettings(patch = {}) {
    this.state.settings = { ...(this.state.settings || {}), ...patch };
    this.save();
    return this.state.settings;
  },

  /**
   * 导入备份：默认整体覆盖，也可传 { merge:'custom' } 只合并自建词条。
   * 返回 { ok, mode, customSigns }
   */
  importJSON(payload, { mode = 'replace' } = {}) {
    if (!payload || typeof payload !== 'object') throw new Error('备份文件格式不正确');
    if (payload.schema && !String(payload.schema).startsWith('slbg.')) {
      throw new Error('这不是 SLBG 的备份文件');
    }
    if (mode === 'merge-custom') {
      const incoming = Array.isArray(payload.customSigns) ? payload.customSigns : [];
      for (const s of incoming) this.addCustomSign(s);
      return { ok: true, mode, customSigns: this.state.customSigns.length };
    }
    const clean = { ...structuredClone(DEFAULT), ...payload };
    clean.settings = { ...DEFAULT.settings, ...(payload.settings || {}) };
    clean.customSigns = Array.isArray(payload.customSigns) ? payload.customSigns : [];
    this.state = clean;
    this.save();
    this._touchDay();
    return { ok: true, mode, customSigns: clean.customSigns.length };
  },

  /** 打包一份"完整备份"：进度 + 自建词条 + 端侧模型（可选） */
  exportBackup(personalJSON = null) {
    const out = this.exportJSON();
    out.customSigns = this.customSignList();
    if (personalJSON) out.personalModel = personalJSON;
    return out;
  },

  exportJSON() {
    return { schema: 'slbg.gesture.progress/1', exportedAt: new Date().toISOString(), ...this.state };
  },
};
