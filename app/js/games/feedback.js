/**
 * 游戏反馈小零件：答对了要"有感觉"，答错了要"知道为什么"。
 * 所有文案都来自词条自带的 tips / mistakes，贡献者加词时自己写，代码不硬编码。
 */

import { el, esc } from '../core/ui.js';

let tipTimer = null;

/** 随机取一条动作要点；没有就给通用提示 */
export function pickTip(sign) {
  const tips = (sign?.tips || []).filter(Boolean);
  if (tips.length) return tips[Math.floor(Math.random() * tips.length)];
  return '手离镜头 40–60 cm，让整个手掌完整入镜。';
}

/** 随机取一条常见错误 */
export function pickMistake(sign) {
  const m = (sign?.mistakes || []).filter(Boolean);
  return m.length ? m[Math.floor(Math.random() * m.length)] : null;
}

/** 屏幕中央飘一个 +XP */
export function popXP(n, { ok = true } = {}) {
  const node = el('div', { class: `xp-pop${ok ? '' : ' bad'}`, text: ok ? `+${n} XP` : '再来一次' });
  document.body.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 320);
  }, 900);
}

/** 在指定容器里闪现一条 tip（不打断游戏节奏） */
export function flashTip(host, sign, ms = 2600) {
  if (!host) return;
  host.querySelector('.tip-flash')?.remove();
  clearTimeout(tipTimer);
  const node = el('div', { class: 'tip-flash' }, [
    el('span', { class: 'tip-flash-kicker', text: '小贴士' }),
    el('span', { text: pickTip(sign) }),
  ]);
  host.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  tipTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, ms);
}

/** 一轮结束的结果卡：对/错 + 一条要点或一条易错提醒 */
export function roundFeedback({ ok, sign, score = 0, extra = '' }) {
  const tip = ok ? pickTip(sign) : pickMistake(sign) || pickTip(sign);
  return el('div', { class: `round-fb${ok ? ' ok' : ' bad'}` }, [
    el('div', { class: 'round-fb-head', text: ok ? `通过！${sign?.word || ''}` : `还差一点 · ${sign?.word || ''}` }),
    el('div', { class: 'round-fb-score', text: ok ? `置信度 ${(score * 100).toFixed(0)}%${extra ? ` · ${extra}` : ''}` : '保持姿势更久一点，或换个光线再试' }),
    el('div', { class: 'round-fb-tip', html: `<b>${ok ? '要点' : '常见错误'}：</b>${esc(tip)}` }),
  ]);
}
