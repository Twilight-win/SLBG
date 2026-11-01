import { el, esc, ring } from '../core/ui.js';
import { dailySign } from '../data/signs.js';
import { games, KIND_LABEL } from '../games/index.js';

export function HomeView(ctx) {
  const frag = document.createDocumentFragment();
  const today = dailySign();
  const playable = ctx.capability.playable();
  const lp = ctx.store.levelProgress();
  const trend = ctx.store.trend(7);

  frag.append(
    el('section', { class: 'hero' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: '今日手语' }),
        el('h1', { class: 'hero-word', text: today.word }),
        el('div', { class: 'hero-pinyin', text: today.pinyin }),
        el('p', { class: 'hero-desc', text: today.desc }),
        el('div', { class: 'hero-actions' }, [
          el('button', { class: 'btn btn-primary', text: '开始玩', onclick: () => ctx.go('play') }),
          el('button', { class: 'btn btn-ghost', text: '看词典', onclick: () => ctx.go('library') }),
        ]),
      ]),
      el('div', { class: 'hero-card' }, [
        today.media?.length && today.media[0].type === 'image'
          ? el('img', { src: esc(today.media[0].src), alt: esc(today.word) })
          : el('div', { class: 'hero-emoji', text: '✋' }),
        el('div', { class: 'hero-credit', text: today.media?.[0]?.credit || '社团示范待补充' }),
      ]),
    ])
  );

  // 引擎状态
  const yoloInfo = ctx.yolo.manifest
    ? {
        name: ctx.yolo.manifest.name,
        version: ctx.yolo.manifest.version,
        size: `${ctx.yolo.size}×${ctx.yolo.size}`,
        classes: (ctx.yolo.classes || []).map((c) => c.zh || c.name).join('、') || '—',
        trainedAt: ctx.yolo.manifest.trainedAt,
      }
    : null;

  frag.append(
    el('section', { class: 'grid-3' }, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '识别引擎' }),
        el('div', { class: 'card-title', text: yoloInfo?.name || '未加载' }),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>版本</span><b>${esc(yoloInfo?.version || '—')}</b>` }),
          el('li', { html: `<span>输入</span><b>${esc(yoloInfo?.size || '—')}</b>` }),
          el('li', { html: `<span>已认识</span><b>${esc(yoloInfo?.classes || '—')}</b>` }),
          el('li', { html: `<span>端侧模型</span><b>${ctx.personal.info().hasModel ? `${ctx.personal.classes().length} 类` : '未训练'}</b>` }),
        ]),
        el('button', { class: 'btn btn-ghost', text: '引擎详情', onclick: () => ctx.go('engine') }),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '当前可玩' }),
        el('div', { class: 'card-title', text: `${playable.length} 个手型` }),
        el('div', { class: 'chip-row', html: playable.map((s) => `<span class="chip static">${esc(s.word)}</span>`).join('') || '<span class="muted">还没有。去「端侧训练营」解锁。</span>' }),
        el('button', { class: 'btn btn-ghost', text: '去解锁', onclick: () => ctx.go('play/trainer') }),
      ]),
      el('div', { class: 'card card-level' }, [
        el('div', { class: 'card-kicker', text: '我的进度' }),
        el('div', { class: 'level-row' }, [
          el('div', { html: ring(lp.pct, { size: 84, label: `Lv.${lp.lvl}`, sub: `${ctx.store.xp} XP` }) }),
          el('div', { class: 'level-meta' }, [
            el('div', { html: `<b>${ctx.store.state.streak}</b> 天连续` }),
            el('div', { html: `<b>${ctx.store.state.history.length}</b> 次练习` }),
            el('div', { html: `<b>${ctx.store.state.captures}</b> 张采集` }),
          ]),
        ]),
        el('div', { class: 'spark', html: trend.map((d) => `<i style="height:${Math.min(100, d.count * 22 + 6)}%" title="${d.day} · ${d.count}"></i>`).join('') }),
      ]),
    ])
  );

  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [
        el('h2', { text: '游戏中心' }),
        el('span', { class: 'muted', text: 'AI 判定类游戏只会出模型真正认识的手型' }),
      ]),
      el(
        'div',
        { class: 'grid-3' },
        games.map((g) =>
          el('button', { class: 'card game-card', onclick: () => ctx.go(`play/${g.id}`) }, [
            el('div', { class: 'game-icon', text: g.icon }),
            el('div', { class: `tag tag-${g.kind}`, text: KIND_LABEL[g.kind] }),
            el('div', { class: 'card-title', text: g.name }),
            el('div', { class: 'card-desc', text: g.tagline }),
          ])
        )
      ),
    ])
  );

  return frag;
}
