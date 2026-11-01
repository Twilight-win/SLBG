/**
 * 词工坊 —— 让"数据的多样性"由社区自己长出来。
 *
 * 内置词库只是起点（目前 YOLO 只认识数字 6）。任何人都可以：
 *   1. 新建词条（谢谢、对不起、社团内部的暗号…）
 *   2. 配文字说明与分步要点（未来可配视频）
 *   3. 上传/拍摄示例图（存本机 IndexedDB，不上传服务器）
 *   4. 去端侧训练营录样本训练，训练完立刻能玩
 *   5. 导出数据包（ZIP）提交给仓库，让官方 YOLO 下一轮重训认识它
 */

import { el, esc, toast, modal } from '../core/ui.js';
import { store } from '../core/store.js';
import { makeCustomSign, syncCustomSigns, customSignList } from '../data/signs.js';
import { mediaDB, blobURL } from '../data/idb.js';
import { makeZip, utf8 } from '../data/zip.js';

const KIND_LABEL = { static: '静态手型', dynamic: '动态动作' };

export function WorkshopView(ctx) {
  const frag = document.createDocumentFragment();

  frag.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: '词工坊' }),
      el('span', { class: 'muted', text: '自己加词、自己训练、自己组内游玩' }),
    ]),
    el('div', { class: 'card' }, [
      el('p', { class: 'hint', html: `内置词库只是起点。<b>你可以新建任意词条</b>，写清动作要点，然后在「端侧训练营」为它录 5–8 个样本——训练完成后它就会立刻出现在所有 AI 判定类游戏的题池里。想让全站都认识它，就用「导出数据包」把样本交给仓库，等下一轮 YOLO 重训。` }),
      el('ul', { class: 'kv' }, [
        el('li', { html: '<span>已训练（端侧）</span><b>' + ctx.personal.classes().length + ' 类</b>' }),
        el('li', { html: '<span>YOLO 官方类</span><b>' + ctx.capability.yoloSignIds().length + ' 类</b>' }),
        el('li', { html: '<span>自建词条</span><b>' + customSignList().length + ' 个</b>' }),
      ]),
    ])
  );

  // ── 新建词条 ────────────────────────────────────────────────
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '① 新建一个词条' })]),
      el('div', { class: 'card' }, [
        el('div', { class: 'form-grid' }, [
          el('label', { class: 'field' }, [
            el('span', { text: '词语' }),
            el('input', { id: 'w-word', type: 'text', placeholder: '例如：谢谢 / 对不起 / 六六大顺', maxlength: '20' }),
          ]),
          el('label', { class: 'field' }, [
            el('span', { text: '拼音或注音（可选）' }),
            el('input', { id: 'w-pinyin', type: 'text', placeholder: 'xiè xie', maxlength: '40' }),
          ]),
          el('label', { class: 'field' }, [
            el('span', { text: '类型' }),
            el('select', { id: 'w-kind' }, [
              el('option', { value: 'static', text: '静态手型（推荐，可端侧训练）' }),
              el('option', { value: 'dynamic', text: '动态动作（暂只做知识卡）' }),
            ]),
          ]),
          el('label', { class: 'field' }, [
            el('span', { text: '一句话说明' }),
            el('input', { id: 'w-desc', type: 'text', placeholder: '手掌朝向、手指关系等', maxlength: '120' }),
          ]),
        ]),
        el('label', { class: 'field' }, [
          el('span', { text: '动作要点 / tips（一行一条）' }),
          el('textarea', { id: 'w-tips', rows: '3', placeholder: '拇指和小指伸直\n其余三指自然弯曲\n手离镜头 40–60 cm' }),
        ]),
        el('div', { class: 'game-ctrl' }, [
          el('button', { class: 'btn btn-primary', text: '创建词条', onclick: create }),
        ]),
      ]),
    ])
  );

  // ── 自建词条列表 ────────────────────────────────────────────
  const listHost = el('div', { class: 'grid-2', id: 'w-list' });
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '② 我的词条' }), el('button', { class: 'btn btn-ghost', text: '全部导出数据包', onclick: () => exportPackage(null) })]),
      listHost,
    ])
  );

  // ── 贡献说明 ────────────────────────────────────────────────
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '③ 把数据贡献给仓库' })]),
      el('div', { class: 'card' }, [
        el('ol', { class: 'steps' }, [
          el('li', { html: '在词工坊建词 → 端侧训练营录样本（每个词 ≥ 20 个样本、多角度多光照）。' }),
          el('li', { html: '点词条上的「导出数据包」，得到一个 ZIP：<code>words.json</code> + <code>samples.json</code> + <code>images/</code>。' }),
          el('li', { html: '在 GitHub 上 fork 本仓库，把 ZIP 解包后的内容放进 <code>datasets/&lt;你的词条&gt;/</code>，提交 Pull Request。' }),
          el('li', { html: '维护者审核（含隐私检查）后合入，下轮 <code>python training/train_yolo.py</code> 重训，全站就认识这个词了。' }),
        ]),
        el('p', { class: 'hint', text: '隐私：数据包里不含姓名、设备信息；示例图默认不公开，除非你在 PR 里明确说明已获出镜者授权。' }),
      ]),
    ])
  );

  renderList();

  function create() {
    const word = document.getElementById('w-word')?.value?.trim();
    if (!word) return toast('先填一个词语', { type: 'err' });
    const sign = makeCustomSign({
      word,
      pinyin: document.getElementById('w-pinyin')?.value || '',
      kind: document.getElementById('w-kind')?.value || 'static',
      desc: document.getElementById('w-desc')?.value || '',
      tips: (document.getElementById('w-tips')?.value || '').split('\n'),
    });
    store.addCustomSign(sign);
    syncCustomSigns(store.customSignList());
    for (const id of ['w-word', 'w-pinyin', 'w-desc', 'w-tips']) document.getElementById(id).value = '';
    toast(`已创建「${sign.word}」，去训练营录样本就能玩`, { type: 'ok', ms: 3200 });
    renderList();
    ctx.refresh?.();
  }

  async function renderList() {
    const list = store.customSignList();
    listHost.innerHTML = '';
    if (!list.length) {
      listHost.append(el('div', { class: 'empty-state', html: '<b>还没有自建词条</b><p>用上面的表单建第一个吧。</p>' }));
      return;
    }
    for (const s of list) {
      const trained = ctx.personal.classes().includes(s.id);
      const samples = ctx.personal.sampleCount(s.id);
      const imgs = (s.media || []).filter((m) => m.idbKey);
      const thumb = el('div', { class: 'thumb-row' });
      for (const m of imgs) {
        const blob = await mediaDB.get(m.idbKey).catch(() => null);
        const url = blobURL(blob);
        if (url) thumb.append(el('img', { class: 'thumb', src: url, alt: s.word, title: `第 ${m.step || 1} 步` }));
      }
      if (!imgs.length) thumb.append(el('span', { class: 'muted', text: '暂无示例图' }));

      listHost.append(
        el('div', { class: 'card' }, [
          el('div', { class: 'card-kicker', text: KIND_LABEL[s.kind] || s.kind }),
          el('div', { class: 'card-title', text: `${s.word}${s.pinyin ? ` · ${s.pinyin}` : ''}` }),
          el('p', { class: 'hint', text: s.desc || '（暂无说明）' }),
          ...(s.tips?.length ? [el('ul', { class: 'tips' }, s.tips.map((t) => el('li', { text: t })))] : []),
          thumb,
          el('ul', { class: 'kv' }, [
            el('li', { html: `<span>端侧样本</span><b>${samples}</b>` }),
            el('li', { html: `<span>状态</span><b class="${trained ? 'ok-text' : 'muted'}">${trained ? '可玩' : '未训练'}</b>` }),
          ]),
          el('div', { class: 'game-ctrl' }, [
            el('button', { class: 'btn btn-ghost', text: '传示例图', onclick: () => pickImages(s) }),
            el('button', { class: 'btn btn-ghost', text: '去训练', onclick: () => ctx.go('play/trainer') }),
            el('button', { class: 'btn btn-ghost', text: '导出数据包', onclick: () => exportPackage(s) }),
            el('button', { class: 'btn btn-danger', text: '删除', onclick: () => remove(s) }),
          ]),
        ])
      );
    }
  }

  function pickImages(sign) {
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
    document.body.append(input);
    input.onchange = async () => {
      const files = [...(input.files || [])];
      for (const f of files) {
        const key = `sign:${sign.id}/${Date.now().toString(36)}-${f.name}`;
        await mediaDB.put(key, f);
        sign.media ||= [];
        sign.media.push({ type: 'image', step: sign.media.length + 1, idbKey: key, credit: '创作者自上传 · 授权范围见 PR 说明', alt: `${sign.word} 示例` });
      }
      store.addCustomSign(sign);
      syncCustomSigns(store.customSignList());
      toast(`已添加 ${files.length} 张示例图`, { type: 'ok' });
      renderList();
      input.remove();
    };
    input.click();
  }

  function remove(sign) {
    modal({
      title: `删除「${esc(sign.word)}」？`,
      body: '<p>会同时删除它的示例图与端侧样本，进度里的自建词条记录也会移除。导出过的数据包不受影响。</p>',
      actions: [
        { label: '取消' },
        {
          label: '确认删除',
          primary: true,
          onClick: async () => {
            for (const m of sign.media || []) if (m.idbKey) await mediaDB.del(m.idbKey).catch(() => {});
            ctx.personal.removeSign(sign.id);
            store.removeCustomSign(sign.id);
            syncCustomSigns(store.customSignList());
            toast('已删除');
            renderList();
            ctx.refresh?.();
          },
        },
      ],
    });
  }

  async function exportPackage(sign) {
    const targets = sign ? [sign] : store.customSignList();
    if (!targets.length) return toast('还没有自建词条可以导出', { type: 'err' });

    const words = targets.map((s) => ({ ...s, media: (s.media || []).map((m) => ({ type: m.type, step: m.step, file: m.idbKey ? `images/${m.idbKey.split('/').pop()}` : m.src })) }));
    const samples = {};
    for (const s of targets) {
      const arr = ctx.personal.samples?.[s.id];
      if (arr?.length) samples[s.id] = arr;
    }

    const files = [
      { name: 'words.json', data: utf8(JSON.stringify({ schema: 'slbg.data-package/1', exportedAt: new Date().toISOString(), note: '不含姓名/设备信息；示例图版权与出镜授权由提交者在 PR 中声明', words }, null, 2)) },
      { name: 'samples.json', data: utf8(JSON.stringify({ schema: 'slbg.landmark-samples/1', dim: 63, samples }, null, 2)) },
      { name: 'README.txt', data: utf8('SLBG 数据包\n\nwords.json   词条定义（含动作要点）\nsamples.json MediaPipe 21 点归一化特征，每类一行数组\nimages/      示例图（如有）\n\n提交方式：fork 仓库 → 放入 datasets/<词条>/ → 提 Pull Request。\n隐私：确认出镜者已授权后再提交图片。\n') },
    ];

    for (const s of targets) {
      for (const m of s.media || []) {
        if (!m.idbKey) continue;
        const blob = await mediaDB.get(m.idbKey).catch(() => null);
        if (!blob) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: `images/${m.idbKey.split('/').pop()}`, data: buf });
      }
    }

    const zip = makeZip(files);
    const url = URL.createObjectURL(zip);
    const a = el('a', { href: url, download: `slbg-data-package-${Date.now()}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`已导出 ${targets.length} 个词条的数据包`, { type: 'ok' });
  }

  return frag;
}
