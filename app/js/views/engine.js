import { el, esc, toast } from '../core/ui.js';
import { coverMapper } from '../engine/decoder.js';

export function EngineView(ctx) {
  const frag = document.createDocumentFragment();
  const m = ctx.yolo.manifest || {};
  const pInfo = ctx.personal.info();

  frag.append(
    el('div', { class: 'section-head' }, [
      el('h2', { text: '识别引擎' }),
      el('span', { class: 'muted', text: '全部推理都在浏览器内完成，画面不上传' }),
    ])
  );

  frag.append(
    el('section', { class: 'grid-3' }, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '① 静态手型检测' }),
        el('div', { class: 'card-title', text: m.name || '未加载' }),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>版本</span><b>${esc(m.version || '—')}</b>` }),
          el('li', { html: `<span>输入</span><b>${esc(m.input ? `${m.input.width}×${m.input.height} ${m.input.layout}` : '—')}</b>` }),
          el('li', { html: `<span>输出</span><b>${esc(m.output ? `${m.output.name} [1,${m.output.attrs},N]` : '—')}</b>` }),
          el('li', { html: `<span>预处理</span><b>${esc(m.input ? `${m.input.letterbox ? 'letterbox' : '直接缩放'} / ${m.input.normalize}` : '—')}</b>` }),
          el('li', { html: `<span>阈值</span><b>score ${esc(m.thresholds?.score ?? 0.35)} · IoU ${esc(m.thresholds?.iou ?? 0.45)}</b>` }),
          el('li', { html: `<span>训练时间</span><b>${esc(m.trainedAt || '—')}</b>` }),
          el('li', { id: 'kv-load', html: `<span>加载耗时</span><b>${ctx.yolo.ready ? `${ctx.yolo.stats.loadMs} ms` : '未加载'}</b>` }),
        ]),
        el('p', { class: 'hint', text: m.notes || '' }),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '② 手部关键点' }),
        el('div', { class: 'card-title', text: 'MediaPipe HandLandmarker' }),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>状态</span><b>${ctx.hands?.ready ? `就绪（${ctx.hands.delegate}）` : '未加载'}</b>` }),
          el('li', { html: `<span>输出</span><b>21 点 × 3 轴</b>` }),
          el('li', { html: `<span>特征</span><b>63 维归一化</b>` }),
        ]),
        el('p', { class: 'hint', text: '关键点负责给端侧小模型提特征，也用于骨架可视化。首次加载约 8 MB。' }),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-kicker', text: '③ 端侧个性化' }),
        el('div', { class: 'card-title', text: pInfo.hasModel ? `TinyMLP · ${pInfo.classes?.length || 0} 类` : 'TinyMLP · 未训练' }),
        el('ul', { class: 'kv' }, [
          el('li', { html: `<span>结构</span><b>63 → 64 → 32 → N</b>` }),
          el('li', { html: `<span>样本</span><b>${pInfo.samples}</b>` }),
          el('li', { html: `<span>模式</span><b>${esc(pInfo.mode)}</b>` }),
          el('li', { html: `<span>训练轮数</span><b>90 · Adam · 交叉熵 + L2</b>` }),
        ]),
        el('button', { class: 'btn btn-ghost', text: '去训练营', onclick: () => ctx.go('play/trainer') }),
      ]),
    ])
  );

  // 类别表
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '类别表' }), el('span', { class: 'muted', text: '只有出现在表里的类才会在 AI 判定游戏里出题' })]),
      el('div', { class: 'table' }, [
        el('div', { class: 'tr th' }, [el('span', { text: 'id' }), el('span', { text: '类名' }), el('span', { text: '对应词条' }), el('span', { text: '来源' })]),
        ...(m.classes || []).map((c) => el('div', { class: 'tr' }, [
          el('span', { text: String(c.id) }),
          el('span', { text: c.name }),
          el('span', { text: c.zh || c.signId || '—' }),
          el('span', { class: 'muted', text: 'YOLO' }),
        ])),
        ...ctx.capability.personalSignIds().map((id, i) => el('div', { class: 'tr' }, [
          el('span', { text: `P${i}` }),
          el('span', { text: id }),
          el('span', { text: ctx.signName(id) }),
          el('span', { class: 'muted', text: '端侧' }),
        ])),
      ]),
    ])
  );

  // 示例图自检
  const demo = el('div', { class: 'card demo-card' }, [
    el('div', { class: 'card-kicker', text: '自检' }),
    el('div', { class: 'card-title', text: '用示例图跑一次推理' }),
    el('p', { class: 'hint', text: '不打开摄像头也能验证模型与前端解码是否正常工作。示例图：数字六（出镜者已授权公开使用）。' }),
    el('div', { class: 'game-ctrl' }, [el('button', { class: 'btn btn-primary', text: '跑一次', onclick: run })]),
    el('div', { class: 'demo-stage' }, [el('img', { id: 'demo-img', src: new URL('../../assets/img/example_number_6_a.jpg', import.meta.url).href, alt: '示例图' })]),
    el('div', { class: 'demo-out', id: 'demo-out', text: '尚未运行' }),
  ]);
  frag.append(el('section', {}, [demo]));

  async function run() {
    const out = frag.querySelector('#demo-out') || demo.querySelector('#demo-out');
    const img = demo.querySelector('#demo-img');
    out.textContent = '推理中…';
    try {
      if (!ctx.yolo.ready) await ctx.yolo.loadSession();
      if (!img.complete) await new Promise((r) => (img.onload = r));
      const r = await ctx.yolo.detect(img, img.naturalWidth, img.naturalHeight);
      drawBoxes(demo.querySelector('.demo-stage'), img, r.detections);
      const kvLoad = document.getElementById('kv-load');
      if (kvLoad) kvLoad.innerHTML = `<span>加载耗时</span><b>${ctx.yolo.stats.loadMs} ms</b>`;
      out.innerHTML = `
        <div>输出形状 <b>[${r.shape.join(', ')}]</b> · 耗时 <b>${r.ms.toFixed(0)} ms</b></div>
        <div>检出 <b>${r.detections.length}</b> 个目标（NMS 后）</div>
        ${r.detections.map((d) => `<div class="log-line ok">${esc(d.label)} · ${(d.score * 100).toFixed(1)}% · 框 [${d.x.toFixed(0)}, ${d.y.toFixed(0)}, ${d.w.toFixed(0)}, ${d.h.toFixed(0)}]</div>`).join('') || '<div class="log-line err">没有检出任何目标 —— 检查阈值或模型类别</div>'}`;
    } catch (err) {
      out.innerHTML = `<div class="log-line err">${esc(err.message || err)}</div>`;
      toast(String(err.message || err), { type: 'err' });
    }
  }

  function drawBoxes(host, img, dets) {
    host.querySelectorAll('canvas').forEach((c) => c.remove());
    const cv = document.createElement('canvas');
    const rect = img.getBoundingClientRect();
    cv.width = rect.width;
    cv.height = rect.height;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const g = cv.getContext('2d');
    const map = coverMapper(img.naturalWidth, img.naturalHeight, rect.width, rect.height);
    for (const d of dets) {
      const p = map(d.x, d.y);
      const q = map(d.x + d.w, d.y + d.h);
      g.strokeStyle = '#6ee7b7';
      g.lineWidth = 2.5;
      g.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
      g.fillStyle = 'rgba(12,22,28,.85)';
      const label = `${d.label} ${(d.score * 100).toFixed(0)}%`;
      g.font = '600 13px system-ui, sans-serif';
      g.fillRect(p.x, Math.max(0, p.y - 22), g.measureText(label).width + 12, 21);
      g.fillStyle = '#6ee7b7';
      g.fillText(label, p.x + 6, Math.max(14, p.y - 6));
    }
    host.append(cv);
  }

  // 替换模型指引
  frag.append(
    el('section', {}, [
      el('div', { class: 'section-head' }, [el('h2', { text: '更换模型' })]),
      el('div', { class: 'card' }, [
        el('ol', { class: 'steps' }, [
          el('li', { html: '把新导出的 <code>best.onnx</code> 放到 <code>app/models/</code>（建议改名带日期，如 <code>best_2026-11-01.onnx</code>）。' }),
          el('li', { html: '改 <code>app/models/manifest.json</code>：<code>model</code> 指向新文件名，<code>classes</code> 按训练时的顺序写全，<code>input.width/height</code> 与实际导出一致。' }),
          el('li', { html: '每个类别写 <code>signId</code>，与 <code>app/js/data/signs.js</code> 里的词条 id 对应；对不上就不会进题池。' }),
          el('li', { html: '回到本页点「跑一次」，确认检出正常，再去游戏中心开玩。' }),
        ]),
        el('p', { class: 'hint', text: 'manifest 是"模型能力的唯一真相来源"。前端不再从 ONNX 元数据猜输入尺寸，避免旧版那种形状不匹配导致 0 检测的问题。' }),
      ]),
    ])
  );

  return frag;
}
