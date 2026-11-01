/**
 * 图片拼图 —— 知识类游戏，不需要摄像头。
 * 用社团示范图切成 3×3，点击两块交换还原。还原过程顺便记住手型细节。
 */

import { el, esc, toast, ring } from '../core/ui.js';
import { illustrated } from '../data/signs.js';

const N = 3;

export default {
  id: 'puzzle',
  name: '手型拼图',
  icon: '🧩',
  kind: 'knowledge',
  tagline: '边拼边记手型细节',
  desc: '把社团示范图打乱后还原。拼图过程中会不断看到手指的位置关系，比看整张图更容易记住细节。',
  requires: [],

  mount(root, ctx) {
    if (!illustrated.length) {
      root.append(el('div', { class: 'empty-state', text: '还没有带示范图的词条' }));
      return () => {};
    }
    const pick = illustrated[Math.floor(Math.random() * illustrated.length)];
    const src = pick.media.find((m) => m.type === 'image').src;

    let order = [...Array(N * N).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.every((v, i) => v === i)) [order[0], order[1]] = [order[1], order[0]];

    let sel = -1;
    let steps = 0;
    const startedAt = Date.now();

    const hud = el('div', { class: 'game-hud' });
    const wrap = el('div', { class: 'puzzle-wrap' }, [el('div', { class: 'puzzle-board' })]);
    const board = wrap.querySelector('.puzzle-board');
    const side = el('div', { class: 'game-side' }, [
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-head' }, [el('h3', { text: '目标手型' })]),
        el('div', { class: 'target-word', text: pick.word }),
        el('div', { class: 'target-desc', text: pick.desc }),
        el('ul', { class: 'tip-list', html: pick.tips.map((t) => `<li>${esc(t)}</li>`).join('') }),
        el('img', { class: 'target-img', src: esc(src), alt: esc(pick.word) }),
      ]),
      el('div', { class: 'game-ctrl' }, [
        el('button', { class: 'btn btn-primary', text: '换一张', onclick: () => ctx.go('play/puzzle') }),
        el('button', { class: 'btn btn-ghost', text: '返回游戏中心', onclick: () => ctx.go('play') }),
      ]),
    ]);
    root.append(hud, el('div', { class: 'game-grid' }, [wrap, side]));

    function renderHud() {
      hud.innerHTML = `
        <div class="hud-item"><span>步数</span><b>${steps}</b></div>
        <div class="hud-item"><span>用时</span><b>${Math.round((Date.now() - startedAt) / 1000)}s</b></div>
        <div class="hud-item"><span>词条</span><b>${esc(pick.word)}</b></div>`;
    }

    function render() {
      board.innerHTML = '';
      board.style.setProperty('--n', N);
      order.forEach((piece, idx) => {
        const row = Math.floor(piece / N);
        const col = piece % N;
        const btn = el('button', {
          class: `ptile${idx === sel ? ' sel' : ''}${piece === idx ? ' ok' : ''}`,
          style: `background-image:url('${src}');background-size:${N * 100}% ${N * 100}%;background-position:${(col / (N - 1)) * 100}% ${(row / (N - 1)) * 100}%`,
          'aria-label': `第 ${idx + 1} 块`,
        });
        btn.onclick = () => {
          if (sel === -1) {
            sel = idx;
          } else if (sel === idx) {
            sel = -1;
          } else {
            [order[sel], order[idx]] = [order[idx], order[sel]];
            steps += 1;
            sel = -1;
            if (order.every((v, i) => v === i)) return win();
          }
          render();
          renderHud();
        };
        board.append(btn);
      });
    }

    function win() {
      const sec = Math.round((Date.now() - startedAt) / 1000);
      const score = Math.max(10, 160 - steps * 4 - sec);
      ctx.store.gameResult('puzzle', score, { steps, sec });
      board.innerHTML = '';
      wrap.append(el('div', { class: 'result' }, [
        el('div', { html: ring(Math.min(1, score / 160), { size: 130, label: String(score), sub: '分' }) }),
        el('div', { class: 'result-line', text: `${steps} 步 · ${sec} 秒` }),
      ]));
      toast(`拼好了！${score} 分`, { type: 'ok' });
      ctx.refresh?.();
    }

    render();
    renderHud();
    return () => {};
  },
};
