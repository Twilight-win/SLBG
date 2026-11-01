/**
 * 数据采集任务 —— 边玩边给未来的模型攒数据。
 *
 * 采集时同时保存：
 *   1) 画面 JPEG（抠图后的手部区域优先，退化为整帧）
 *   2) 标注 JSON（词条、拍摄者、YOLO 框、MediaPipe 21 点、时间）
 *
 * 有 server/serve.py 在跑时，POST /api/capture 落盘到 data/captures；
 * 纯静态打开时自动降级为浏览器逐张下载，不丢数据。
 */

import { Stage } from '../engine/stage.js';
import { el, esc, toast, download } from '../core/ui.js';
import { activeSigns } from '../data/signs.js';

export default {
  id: 'quest',
  name: '数据任务',
  icon: '📷',
  kind: 'collect',
  tagline: '你的手型，会成为下一版模型的数据',
  desc: '选一个词条，让摄像头自动连拍。每张图都会带上词条、拍摄者和手部框/关键点标注，直接可转成 YOLO 数据集。数据只保存在你自己的机器上。',
  requires: ['camera'],

  mount(root, ctx) {
    let signer = localStorage.getItem('slbg.gesture.signer') || '';
    let signId = activeSigns[0].id;
    let signIdSelected = false;
    let count = 0;
    let shooting = false;

    const hud = el('div', { class: 'game-hud' });
    const stageHost = el('div', { class: 'stage-wrap' });
    const side = el('div', { class: 'game-side' });
    root.append(hud, el('div', { class: 'game-grid' }, [stageHost, side]));

    const stage = new Stage(stageHost, { yolo: ctx.yolo, hands: ctx.hands, capability: ctx.capability });
    stage.message('开启摄像头后即可采集');
    let lastFrame = null;
    stage.onFrame = (f) => {
      lastFrame = f;
    };

    side.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>采集设置</h3></div>
        <label class="field"><span>拍摄者昵称 / 编号</span>
          <input id="signer" placeholder="编号即可，如 S001（别写真名）" value="${esc(signer)}">
        </label>
        <label class="field"><span>词条</span>
          <select id="sign">${activeSigns.map((s) => `<option value="${s.id}">${esc(s.word)}（${esc(s.category)}）</option>`).join('')}</select>
        </label>
        <label class="field"><span>连拍张数</span>
          <input id="num" type="number" min="1" max="40" value="10">
        </label>
        <div class="game-ctrl">
          <button class="btn btn-primary" id="btn-start">开启摄像头</button>
          <button class="btn btn-ghost" id="btn-shoot" disabled>开始连拍</button>
        </div>
        <p class="hint">提示：拍摄时缓慢变换角度、距离和手的方向，模型会更鲁棒。同一人的数据会整组进入训练集或验证集，不会拆开。</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>本次采集</h3><span class="muted" id="cnt">0 张</span></div>
        <div class="thumb-row" id="thumbs"></div>
        <div class="game-ctrl">
          <button class="btn btn-ghost" id="btn-export">导出标注 JSON</button>
        </div>
      </div>`;

    const records = [];
    const thumbs = side.querySelector('#thumbs');
    const cntEl = side.querySelector('#cnt');
    const sel = side.querySelector('#sign');
    sel.value = signId;
    sel.onchange = () => {
      signId = sel.value;
      signIdSelected = true;
    };
    side.querySelector('#signer').oninput = (e) => {
      signer = e.target.value.trim();
      localStorage.setItem('slbg.gesture.signer', signer);
    };

    side.querySelector('#btn-start').onclick = async (e) => {
      const btn = e.currentTarget;
      try {
        btn.disabled = true;
        btn.textContent = '正在启动…';
        if (!ctx.yolo.ready) await ctx.yolo.loadSession().catch(() => {});
        if (ctx.hands && !ctx.hands.ready) await ctx.hands.load().catch(() => {});
        await stage.start({ mirror: ctx.store.state.settings.mirror });
        btn.textContent = '摄像头已开启';
        side.querySelector('#btn-shoot').disabled = false;
        toast('可以开始采集了', { type: 'ok' });
      } catch (err) {
        toast(String(err.message || err), { type: 'err', ms: 4200 });
        btn.disabled = false;
        btn.textContent = '开启摄像头';
      }
    };

    side.querySelector('#btn-shoot').onclick = async (e) => {
      if (shooting) return;
      if (!signer) return toast('请先填写拍摄者昵称', { type: 'err' });
      shooting = true;
      const btn = e.currentTarget;
      btn.disabled = true;
      const n = Math.max(1, Math.min(40, Number(side.querySelector('#num').value) || 10));
      for (let i = 0; i < n; i++) {
        await captureOne();
        await new Promise((r) => setTimeout(r, 500));
      }
      shooting = false;
      btn.disabled = false;
      toast(`本次采集完成：${n} 张`, { type: 'ok' });
    };

    side.querySelector('#btn-export').onclick = () => {
      if (!records.length) return toast('还没有采集数据', { type: 'err' });
      download(`slbg-captures-${Date.now()}.json`, JSON.stringify(records, null, 2));
      toast('标注 JSON 已导出');
    };

    async function captureOne() {
      const canvas = stage.snapshot(640);
      if (!canvas) return toast('摄像头还没准备好', { type: 'err' });
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      const rec = {
        t: new Date().toISOString(),
        signId,
        signWord: activeSigns.find((s) => s.id === signId)?.word || signId,
        signer,
        image: { w: canvas.width, h: canvas.height },
        detections: (lastFrame?.detections || []).map((d) => ({
          classId: d.classId,
          className: d.className,
          score: Number(d.score.toFixed(4)),
          bbox: [Number(d.nx.toFixed(5)), Number(d.ny.toFixed(5)), Number(d.nw.toFixed(5)), Number(d.nh.toFixed(5))],
        })),
        landmarks: lastFrame?.landmarks ? lastFrame.landmarks.map((p) => [Number(p.x.toFixed(5)), Number(p.y.toFixed(5)), Number((p.z || 0).toFixed(5))]) : null,
      };
      records.push(rec);
      count += 1;
      ctx.store.bumpCapture();

      const img = el('img', { src: URL.createObjectURL(blob), alt: `${rec.signWord} 样本` });
      thumbs.prepend(img);
      cntEl.textContent = `${count} 张`;
      renderHud();

      // 优先交给本地采集服务，失败则降级为浏览器下载
      const ok = await postCapture(blob, rec);
      if (!ok) {
        download(`capture_${rec.signer}_${rec.signId}_${Date.now()}.jpg`, blob, 'image/jpeg');
      }
    }

    /** 提交给 server/serve.py：JSON + base64，服务端零依赖即可解析 */
    async function postCapture(blob, rec) {
      try {
        const b64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('图片读取失败'));
          fr.readAsDataURL(blob);
        });
        const box = rec.detections[0]?.bbox || null;
        const res = await fetch('api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: b64,
            signId: rec.signId,
            label: rec.signWord,
            signer: rec.signer,
            bbox: box,
            landmarks: rec.landmarks,
            width: rec.image.w,
            height: rec.image.h,
            source: 'quest',
          }),
        });
        if (!res.ok) return false;
        rec.savedToServer = true;
        return true;
      } catch {
        return false;
      }
    }

    async function renderHud() {
      hud.innerHTML = `
        <div class="hud-item"><span>本次</span><b>${count} 张</b></div>
        <div class="hud-item"><span>词条</span><b>${esc(activeSigns.find((s) => s.id === signId)?.word || '—')}</b></div>
        <div class="hud-item"><span>拍摄者</span><b>${esc(signer || '未填写')}</b></div>
        <div class="hud-item"><span>服务端</span><b id="srv">检测中…</b></div>`;
      const srv = hud.querySelector('#srv');
      try {
        const res = await fetch('api/stats', { cache: 'no-store' });
        if (!res.ok) throw new Error('no');
        const st = await res.json();
        srv.textContent = `已连 · 累计 ${st.total || 0} 张`;
      } catch {
        srv.textContent = '未连接（将下载到本地）';
      }
    }

    if (!signIdSelected) sel.value = signId;
    renderHud();

    return () => stage.stop();
  },
};
