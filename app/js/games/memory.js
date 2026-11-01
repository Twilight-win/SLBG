/**
 * 记忆翻牌 —— 知识类游戏，不需要摄像头。
 * 配对规则：示范图 ↔ 手语词。用有示范图的词条，不足时用字卡补位。
 */

import { el, esc, toast, ring } from '../core/ui.js';
import { illustrated, activeSigns } from '../data/signs.js';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default {
  id: 'memory',
  name: '记忆翻牌',
  icon: '🃏',
  kind: 'knowledge',
  tagline: '把示范图和手语词对上',
  desc: '翻开卡片，把示范图与对应的手语词配对。考验的是"看形状认词"，不需要摄像头。完成时间越短、步数越少得分越高。',
  requires: [],

  mount(root, ctx) {
    const withImg = illustrated.slice(0, 6);
    const fallback = activeSigns.filter((s) => !withImg.includes(s)).slice(0, Math.max(0, 6 - withImg.length));
    const deck = [...withImg, ...fallback];
    if (deck.length < 2) {
      root.append(el('div', { class: 'empty-state', text: '词条太少，无法开局' }));
      return () => {};
    }

    const cards = shuffle([...deck.map((s) => ({ key: `${s.id}#img`, signId: s.id, type: 'img' })), ...deck.map((s) => ({ key: `${s.id}#word`, signId: s.id, type: 'word' }))]);
    let first = null;
    let lock = false;
    let matched = 0;
    let steps = 0;
    let startedAt = 0;

    const hud = el('div', { class: 'game-hud' });
    const board = el('div', { class: 'memory-board' });
    const ctrl = el('div', { class: 'game-ctrl' }, [
      el('button', { class: 'btn btn-primary', text: '重新开始', onclick: () => ctx.go('play/memory') }),
      el('button', { class: 'btn btn-ghost', text: '返回游戏中心', onclick: () => ctx.go('play') }),
    ]);
    root.append(hud, board, ctrl);

    function renderHud() {
      hud.innerHTML = `
        <div class="hud-item"><span>配对</span><b>${matched} / ${deck.length}</b></div>
        <div class="hud-item"><span>步数</span><b>${steps}</b></div>
        <div class="hud-item"><span>用时</span><b>${startedAt ? `${Math.round((Date.now() - startedAt) / 1000)}s` : '—'}</b></div>`;
    }

    for (const c of cards) {
      const sign = activeSigns.find((s) => s.id === c.signId);
      const face = c.type === 'img' && sign.media?.length
        ? `<img src="${esc(sign.media[0].src)}" alt="${esc(sign.word)}"><span class="cap">${esc(sign.word)}</span>`
        : `<span class="big">${esc(sign.word)}</span><span class="cap">${esc(sign.pinyin)}</span>`;
      const node = el('button', { class: 'mcard', html: `<div class="mcard-inner"><div class="mcard-back">✋</div><div class="mcard-face">${face}</div></div>` });
      node.onclick = () => flip(node, c);
      board.append(node);
    }

    function flip(node, c) {
      if (lock || node.classList.contains('open') || node.classList.contains('done')) return;
      if (!startedAt) startedAt = Date.now();
      node.classList.add('open');
      if (!first) {
        first = { node, c };
        return;
      }
      steps += 1;
      lock = true;
      const a = first;
      first = null;
      if (a.c.signId === c.signId && a.c.type !== c.type) {
        setTimeout(() => {
          a.node.classList.add('done');
          node.classList.add('done');
          matched += 1;
          lock = false;
          renderHud();
          if (matched === deck.length) win();
        }, 260);
      } else {
        setTimeout(() => {
          a.node.classList.remove('open');
          node.classList.remove('open');
          lock = false;
        }, 700);
      }
      renderHud();
    }

    function win() {
      const sec = Math.round((Date.now() - startedAt) / 1000);
      const score = Math.max(10, 200 - steps * 6 - sec * 2);
      ctx.store.gameResult('memory', score, { steps, sec });
      board.innerHTML = `<div class="result">${ring(Math.min(1, score / 200), { size: 130, label: String(score), sub: '分' })}
        <div class="result-line">${steps} 步 · ${sec} 秒</div></div>`;
      toast(`完成！${score} 分`, { type: 'ok' });
      ctx.refresh?.();
    }

    renderHud();
    return () => {};
  },
};
