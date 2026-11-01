import { el, esc } from '../core/ui.js';
import { categories, activeSigns, signById, signsByCategory } from '../data/signs.js';

export function LibraryView(ctx) {
  const frag = document.createDocumentFragment();
  let cat = 'all';

  const head = el('div', { class: 'section-head' }, [
    el('h2', { text: '手语词典' }),
    el('div', { class: 'filter-row' }, [
      el('button', { class: 'chip active', 'data-cat': 'all', text: '全部', onclick: (e) => pick(e.currentTarget) }),
      ...categories.map((c) => el('button', { class: 'chip', 'data-cat': c.id, text: c.name, onclick: (e) => pick(e.currentTarget) })),
    ]),
  ]);
  const list = el('div', { class: 'grid-3' });
  frag.append(head, list);

  function pick(btn) {
    cat = btn.dataset.cat;
    head.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
    render();
  }

  function render() {
    list.innerHTML = '';
    for (const s of signsByCategory(cat)) {
      const src = ctx.capability.sourceOf(s.id);
      const m = ctx.store.masteryOf(s.id);
      const playable = !!src;
      list.append(
        el('button', { class: 'card sign-card', onclick: () => ctx.go(`library/${s.id}`) }, [
          s.media?.length && s.media[0].type === 'image'
            ? el('img', { class: 'sign-thumb', src: esc(s.media[0].src), alt: esc(s.word) })
            : el('div', { class: 'sign-thumb sign-thumb-empty', text: s.word[0] || '✋' }),
          el('div', { class: 'sign-word', text: s.word }),
          el('div', { class: 'sign-pinyin', text: s.pinyin }),
          el('div', { class: 'sign-meta' }, [
            el('span', { class: `tag tag-${playable ? 'ai' : 'know'}`, text: playable ? '模型可识别' : '知识学习' }),
            m ? el('span', { class: 'muted', text: `掌握 ${m.ok}/${m.ok + m.fail}` }) : null,
          ]),
          el('div', { class: 'card-desc', text: s.desc }),
        ])
      );
    }
  }

  render();
  return frag;
}

export function SignDetailView(ctx, signId) {
  const s = signById[signId];
  const frag = document.createDocumentFragment();
  if (!s) {
    frag.append(el('div', { class: 'empty-state', text: '词条不存在' }));
    return frag;
  }
  const src = ctx.capability.sourceOf(s.id);
  const m = ctx.store.masteryOf(s.id);
  const srcText = { yolo: 'YOLO 模型可直接识别', personal: '端侧个性化模型可识别', fused: 'YOLO + 端侧双模型识别' }[src] || '当前模型还不能识别，仅作知识学习';

  frag.append(
    el('div', { class: 'detail-head' }, [
      el('button', { class: 'btn btn-ghost', text: '← 返回词典', onclick: () => ctx.go('library') }),
      el('div', { class: 'detail-title' }, [
        el('h2', { text: s.word }),
        el('span', { class: 'muted', text: s.pinyin }),
        el('span', { class: `tag tag-${src ? 'ai' : 'know'}`, text: srcText }),
      ]),
    ])
  );

  frag.append(
    el('div', { class: 'detail-grid' }, [
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-head' }, [el('h3', { text: '示范' })]),
        ...(s.media?.length
          ? s.media.map((mm) =>
              mm.type === 'video'
                ? el('video', { class: 'detail-media', src: esc(mm.src), poster: mm.poster ? esc(mm.poster) : null, controls: true, playsinline: true })
                : el('div', {}, [el('img', { class: 'detail-media', src: esc(mm.src), alt: esc(mm.alt || s.word) }), el('div', { class: 'muted', text: mm.credit || '' })])
            )
          : [el('p', { class: 'hint', text: '这个词条还没有示范素材。欢迎在数据任务里贡献一张。' })]),
        el('div', { class: 'game-ctrl' }, [
          el('button', { class: 'btn btn-primary', text: src ? '去 AI 游戏里练' : '去训练营解锁它', onclick: () => ctx.go(src ? 'play/rush' : 'play/trainer') }),
          el('button', { class: 'btn btn-ghost', text: '贡献素材', onclick: () => ctx.go('play/quest') }),
        ]),
      ]),
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-head' }, [el('h3', { text: '动作要点' })]),
        el('p', { class: 'hint', text: s.desc }),
        el('ul', { class: 'tip-list', html: s.tips.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>待社团补充</li>' }),
        el('div', { class: 'panel-head' }, [el('h3', { text: '常见错误' })]),
        el('ul', { class: 'tip-list warn', html: s.mistakes?.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>暂无记录</li>' }),
        el('div', { class: 'panel-head' }, [el('h3', { text: '掌握度' })]),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>成功 / 失败</span><b>${m ? `${m.ok} / ${m.fail}` : '0 / 0'}</b>` }),
          el('li', { html: `<span>下次复习</span><b>${esc(m?.due || '未开始')}</b>` }),
          el('li', { html: `<span>记忆难度系数</span><b>${m ? m.ease.toFixed(2) : '2.50'}</b>` }),
        ]),
      ]),
    ])
  );
  return frag;
}

export const librarySigns = activeSigns;
