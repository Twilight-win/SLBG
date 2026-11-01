import { el, esc, ring, toast, download, modal, fmtRelative } from '../core/ui.js';
import { badges, signById, syncCustomSigns } from '../data/signs.js';

export function ProfileView(ctx) {
  const frag = document.createDocumentFragment();
  const st = ctx.store.state;
  const lp = ctx.store.levelProgress();
  const trend = ctx.store.trend(14);
  const got = ctx.store.syncBadges(badges);
  if (got.length) toast(`解锁徽章：${got.map((b) => b.name).join('、')}`, { type: 'ok' });

  frag.append(
    el('div', { class: 'section-head' }, [el('h2', { text: '我的档案' })]),
    el('section', { class: 'grid-3' }, [
      el('div', { class: 'card card-level' }, [
        el('div', { class: 'card-kicker', text: '等级' }),
        el('div', { class: 'level-row' }, [
          el('div', { html: ring(lp.pct, { size: 100, label: `Lv.${lp.lvl}`, sub: `${st.xp} XP` }) }),
          el('div', { class: 'level-meta' }, [
            el('div', { html: `<b>${st.streak}</b> 天连续` }),
            el('div', { html: `<b>${st.history.length}</b> 次练习` }),
            el('div', { html: `<b>${st.captures}</b> 张采集` }),
            el('div', { html: `<b>${st.trainRuns}</b> 次端侧训练` }),
          ]),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '近 14 天' }),
        el('div', { class: 'card-title', text: '练习曲线' }),
        el('div', { class: 'spark tall', html: trend.map((d) => `<i style="height:${Math.min(100, d.count * 18 + 5)}%" title="${d.day} · ${d.count}"></i>`).join('') }),
        el('div', { class: 'spark-x', html: `<span>${trend[0].day.slice(5)}</span><span>${trend[trend.length - 1].day.slice(5)}</span>` }),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '个性化模型' }),
        el('div', { class: 'card-title', text: ctx.personal.info().hasModel ? `已训练 · ${ctx.personal.classes().length} 类` : '未训练' }),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>样本数</span><b>${ctx.personal.info().samples}</b>` }),
          el('li', { html: `<span>模式</span><b>${ctx.personal.info().mode}</b>` }),
          el('li', { html: `<span>训练时间</span><b>${ctx.personal.info().trainedAt ? fmtRelative(ctx.personal.info().trainedAt) : '—'}</b>` }),
        ]),
        el('div', { class: 'game-ctrl' }, [
          el('button', { class: 'btn btn-ghost', text: '导出', onclick: () => download(`slbg-personal-${Date.now()}.json`, JSON.stringify(ctx.personal.exportJSON(), null, 2)) }),
          el('button', { class: 'btn btn-ghost', text: '去训练营', onclick: () => ctx.go('play/trainer') }),
        ]),
      ]),
    ])
  );

  // 徽章
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '徽章' })]),
      el('div', { class: 'badge-row' }, badges.map((b) => el('div', { class: `badge${st.badges.includes(b.id) ? ' on' : ''}` }, [
        el('div', { class: 'badge-icon', text: b.icon }),
        el('div', { class: 'badge-name', text: b.name }),
        el('div', { class: 'badge-desc', text: b.desc }),
      ]))),
    ])
  );

  // 复习队列
  const queue = ctx.store.reviewQueue();
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '复习队列' }), el('span', { class: 'muted', text: '基于 SM-2 间隔重复' })]),
      queue.length
        ? el('div', { class: 'chip-row' }, queue.map((q) => el('button', { class: 'chip', text: `${signById[q.signId]?.word || q.signId} · 到期 ${q.due}`, onclick: () => ctx.go(`library/${q.signId}`) })))
        : el('p', { class: 'hint', text: '暂无到期词条。去做一个 AI 判定游戏就会产生复习计划。' }),
    ])
  );

  // 最近记录
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '最近练习' })]),
      el('div', { class: 'table' }, [
        el('div', { class: 'tr th' }, [el('span', { text: '时间' }), el('span', { text: '词条' }), el('span', { text: '结果' }), el('span', { text: '置信度' }), el('span', { text: '来源' })]),
        ...(st.history.slice(0, 20).map((h) =>
          el('div', { class: 'tr' }, [
            el('span', { text: fmtRelative(h.t) }),
            el('span', { text: signById[h.signId]?.word || h.signId }),
            el('span', { class: h.ok ? 'ok-text' : 'err-text', text: h.ok ? '通过' : '未通过' }),
            el('span', { text: `${(h.score * 100).toFixed(0)}%` }),
            el('span', { class: 'muted', text: { yolo: 'YOLO', personal: '端侧', fused: '融合' }[h.source] || h.source }),
          ])
        ) || [el('div', { class: 'tr', text: '暂无记录' })]),
      ]),
    ])
  );

  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '设置与数据' })]),
      el('div', { class: 'card' }, [
        el('label', { class: 'field' }, [
          el('span', { text: `保持判定时长 ${(st.settings.holdMs / 1000).toFixed(1)} 秒` }),
          el('input', {
            type: 'range', min: '500', max: '3000', step: '100', value: String(st.settings.holdMs),
            oninput: (e) => {
              st.settings.holdMs = Number(e.target.value);
              ctx.store.save();
              e.target.previousElementSibling.textContent = `保持判定时长 ${(st.settings.holdMs / 1000).toFixed(1)} 秒`;
            },
          }),
        ]),
        el('label', { class: 'field check' }, [
          el('input', { type: 'checkbox', checked: st.settings.mirror, onchange: (e) => { st.settings.mirror = e.target.checked; ctx.store.save(); } }),
          el('span', { text: '画面镜像（自拍视角）' }),
        ]),
        el('label', { class: 'field check' }, [
          el('input', { type: 'checkbox', checked: st.settings.showLandmarks, onchange: (e) => { st.settings.showLandmarks = e.target.checked; ctx.store.save(); } }),
          el('span', { text: '显示手部关键点骨架' }),
        ]),
        el('div', { class: 'game-ctrl' }, [
          el('button', { class: 'btn btn-ghost', text: '导出完整备份', onclick: () => download(`slbg-backup-${Date.now()}.json`, JSON.stringify(ctx.store.exportBackup(ctx.personal.exportJSON()), null, 2)) }),
          el('button', { class: 'btn btn-ghost', text: '导入备份', onclick: pickBackup }),
          el('button', { class: 'btn btn-danger', text: '清空本机数据', onclick: reset }),
        ]),
        el('input', { type: 'file', accept: '.json,application/json', id: 'backup-file', style: 'display:none',
          onchange: (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
              try {
                const res = ctx.store.importJSON(JSON.parse(String(r.result)));
                if (res.customSigns) syncCustomSigns(ctx.store.customSignList());
                toast(`已恢复备份（含 ${res.customSigns} 个自建词条）`, { type: 'ok' });
                setTimeout(() => location.reload(), 500);
              } catch (err) {
                toast(`导入失败：${err.message}`, { type: 'err', ms: 4000 });
              }
            };
            r.readAsText(f);
            e.target.value = '';
          },
        }),
        el('p', { class: 'hint', html: `所有数据只存在这台设备的浏览器里，不上传任何服务器。<b>换浏览器、清缓存、换设备都会丢</b>——请定期点「导出完整备份」保存 JSON 文件（含进度、自建词条、端侧模型），在新设备上用「导入备份」恢复。` }),
      ]),
    ])
  );

  function pickBackup() {
    document.getElementById('backup-file')?.click();
  }

  function reset() {
    modal({
      title: '清空本机全部数据？',
      body: '<p>将删除练习记录、XP、徽章、复习计划以及端侧训练样本和模型，无法恢复。</p>',
      actions: [
        { label: '取消' },
        { label: '确认清空', primary: true, onClick: () => { ctx.store.reset(); ctx.personal.clear(); toast('已清空'); setTimeout(() => location.reload(), 400); } },
      ],
    });
  }

  return frag;
}
