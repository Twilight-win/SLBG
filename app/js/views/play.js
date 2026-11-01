import { el, esc } from '../core/ui.js';
import { games, gameById, KIND_LABEL } from '../games/index.js';

export function PlayView(ctx) {
  const frag = document.createDocumentFragment();
  const playable = ctx.capability.playable();

  frag.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: '游戏中心' }),
      el('span', { class: 'muted', text: `题池：${playable.map((s) => s.word).join('、') || '空'}` }),
    ])
  );

  if (!playable.length) {
    frag.append(
      el('div', { class: 'notice' }, [
        el('b', { text: '当前 YOLO 模型只认识 1 个类，AI 判定类游戏暂时没有题。' }),
        el('p', { text: '两条路：① 去「端侧训练营」录样本训练一个浏览器内模型，立刻解锁更多手型；② 换一个训练好的多类别 YOLO 模型（见 docs/模型卡.md）。' }),
        el('button', { class: 'btn btn-primary', text: '去端侧训练营', onclick: () => ctx.go('play/trainer') }),
      ])
    );
  }

  frag.append(
    el(
      'div',
      { class: 'grid-3' },
      games.map((g) => {
        const best = ctx.store.state.games[g.id]?.best || 0;
        const plays = ctx.store.state.games[g.id]?.plays || 0;
        const blocked = g.requires.includes('playable') && !playable.length && g.kind !== 'train';
        return el('button', { class: `card game-card${blocked ? ' blocked' : ''}`, onclick: () => ctx.go(`play/${g.id}`) }, [
          el('div', { class: 'game-icon', text: g.icon }),
          el('div', { class: `tag tag-${g.kind}`, text: KIND_LABEL[g.kind] }),
          el('div', { class: 'card-title', text: g.name }),
          el('div', { class: 'card-desc', text: g.tagline }),
          el('div', { class: 'game-foot' }, [
            el('span', { class: 'muted', text: plays ? `玩过 ${plays} 次 · 最高 ${best}` : '还没玩过' }),
            blocked ? el('span', { class: 'tag tag-warn', text: '需先解锁' }) : null,
          ]),
        ]);
      })
    )
  );
  return frag;
}

export function GameView(ctx, gameId) {
  const g = gameById[gameId];
  const frag = document.createDocumentFragment();
  if (!g) {
    frag.append(el('div', { class: 'empty-state', text: '游戏不存在' }));
    return { frag };
  }

  const head = el('div', { class: 'detail-head' }, [
    el('button', { class: 'btn btn-ghost', text: '← 游戏中心', onclick: () => ctx.go('play') }),
    el('div', { class: 'detail-title' }, [
      el('h2', { html: `${g.icon} ${esc(g.name)}` }),
      el('span', { class: `tag tag-${g.kind}`, text: KIND_LABEL[g.kind] }),
    ]),
  ]);
  const body = el('div', { class: 'game-body' });
  const foot = el('p', { class: 'hint', text: g.desc });
  frag.append(head, foot, body);

  return { frag, mount: () => g.mount(body, ctx) };
}
