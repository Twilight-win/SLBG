/**
 * 端侧训练营 —— 这个项目里"最深度学习"的一块。
 *
 * 你在浏览器里亲手完成一次完整的监督学习闭环：
 *   采集（MediaPipe 21 点 → 63 维归一化特征）
 *     → 标准化（FeatureScaler 拟合 mean/std）
 *     → 训练（63→64→32→N 的 MLP，Adam + 交叉熵 + L2 + 数据增强）
 *     → 评估（留一交叉验证，给一个诚实的准确率）
 *     → 部署（权重写回 localStorage，立刻进入游戏题池）
 *
 * 全过程不出设备。它解决的是 YOLO 目前只有 1 个类的问题：
 * 不用重新训练 YOLO，也能先把更多手型"解锁"出来玩。
 */

import { Stage } from '../engine/stage.js';
import { el, esc, toast, download, modal } from '../core/ui.js';

export default {
  id: 'trainer',
  name: '端侧训练营',
  icon: '🧠',
  kind: 'train',
  tagline: '在浏览器里训练一个属于你的手势模型',
  desc: '为任意静态手型录 5–8 个样本，浏览器内训练一个 63→64→32→N 的小神经网络。训练完成后，这些手型会立刻出现在 AI 判定类游戏的题池里。所有计算与数据都在本机。',
  requires: ['camera'],

  mount(root, ctx) {
    const pool = ctx.capability.trainable();
    let current = pool.find((s) => !ctx.capability.playable().includes(s)) || pool[0];
    let lastFeatures = null;
    let bursting = false;

    const head = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h3', { text: '① 选一个要解锁的手型' }),
        el('span', { class: 'muted', text: '静态手型才适合做关键点分类；动态词请留给时序模型' }),
      ]),
      el('div', { class: 'chip-row', id: 'sign-chips' }),
    ]);

    const stageHost = el('div', { class: 'stage-wrap' });
    const collectPanel = el('div', { class: 'panel' });
    const trainPanel = el('div', { class: 'panel' });

    root.append(
      head,
      el('div', { class: 'game-grid' }, [
        stageHost,
        el('div', { class: 'game-side' }, [collectPanel, trainPanel]),
      ])
    );

    const stage = new Stage(stageHost, { yolo: ctx.yolo, hands: ctx.hands, capability: ctx.capability });
    stage.message('开启摄像头后即可采集样本');
    stage.onFrame = ({ features }) => {
      if (features) lastFeatures = features;
    };

    // ── 词条选择 ────────────────────────────────────────────────
    function renderChips() {
      const row = root.querySelector('#sign-chips');
      row.innerHTML = '';
      for (const s of pool) {
        const n = ctx.personal.sampleCount(s.id);
        const unlocked = ctx.capability.sourceOf(s.id);
        const chip = el('button', {
          class: `chip${s.id === current?.id ? ' active' : ''}${unlocked ? ' unlocked' : ''}`,
          onclick: () => {
            current = s;
            renderChips();
            renderCollect();
          },
        }, [
          el('span', { class: 'chip-word', text: s.word }),
          el('span', { class: 'chip-badge', text: unlocked ? '已解锁' : `${n} 样本` }),
        ]);
        row.append(chip);
      }
    }

    // ── 采集 ───────────────────────────────────────────────────
    function renderCollect() {
      const n = ctx.personal.sampleCount(current.id);
      const total = ctx.personal.info().samples;
      const classes = ctx.personal.classes().length;
      collectPanel.innerHTML = `
        <div class="panel-head">
          <h3>② 采集样本 · ${esc(current.word)}</h3>
          <span class="muted">已采 ${n} / 建议 5–8</span>
        </div>
        <div class="sample-dots">${Array.from({ length: 8 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
        <p class="hint">比出手型后点击「采集」，稍微换一下角度/距离再采，模型更抗变化。一次连拍会自动采 6 张。</p>
        <div class="game-ctrl">
          <button class="btn btn-primary" id="btn-shot">采集 1 张</button>
          <button class="btn btn-ghost" id="btn-burst">连拍 6 张</button>
          <button class="btn btn-ghost" id="btn-clear-word">清空这个词</button>
        </div>
        <div class="stat-row">
          <span>样本总数 <b id="st-total">${total}</b></span>
          <span>类别数 <b id="st-cls">${classes}</b></span>
          <span>可玩手型 <b id="st-play">${ctx.capability.playable().length}</b></span>
        </div>`;

      collectPanel.querySelector('#btn-shot').onclick = () => shoot();
      collectPanel.querySelector('#btn-burst').onclick = () => burst();
      collectPanel.querySelector('#btn-clear-word').onclick = () => {
        ctx.personal.removeSign(current.id);
        renderChips();
        renderCollect();
        renderTrain();
        toast(`已清空「${current.word}」的样本`);
      };
    }

    function shoot() {
      if (!ctx.hands?.ready) return toast('手部关键点模型还没就绪，请先开启摄像头', { type: 'err' });
      if (!lastFeatures) return toast('没有检测到手，请把手放在镜头前', { type: 'err' });
      const n = ctx.personal.addSample(current.id, lastFeatures);
      renderChips();
      renderCollect();
      renderTrain();
      if (n === 5 || n === 8) toast(`${current.word} 已采集 ${n} 个样本`, { type: 'ok' });
      return n;
    }

    async function burst() {
      if (bursting) return;
      if (!ctx.hands?.ready) return toast('手部关键点模型还没就绪，请先开启摄像头', { type: 'err' });
      bursting = true;
      toast('连拍中，请慢慢变换手部角度…');
      for (let i = 0; i < 6; i++) {
        shoot();
        await new Promise((r) => setTimeout(r, 420));
      }
      bursting = false;
      toast('连拍完成', { type: 'ok' });
    }

    // ── 训练 ───────────────────────────────────────────────────
    function renderTrain() {
      const info = ctx.personal.info();
      const cls = info.classes.length;
      const canTrain = info.samples >= 6;
      trainPanel.innerHTML = `
        <div class="panel-head">
          <h3>③ 训练与评估</h3>
          <span class="muted">MLP 63→64→32→${Math.max(1, cls)}</span>
        </div>
        <p class="hint">${
          cls < 2
            ? '当前只有 1 个类别，会训练成「类内距离模型」：只能判断"是不是这个手型"，无法做多类区分。再采集 1 个类别就能跑真正的分类器。'
            : `将对 ${cls} 个类别做分类训练，并用留一交叉验证给出诚实准确率。`
        }</p>
        <canvas class="loss-canvas" id="loss-canvas" width="320" height="90"></canvas>
        <div class="game-ctrl">
          <button class="btn btn-primary" id="btn-train" ${canTrain ? '' : 'disabled'}>开始训练</button>
          <button class="btn btn-ghost" id="btn-eval" ${canTrain && cls >= 2 ? '' : 'disabled'}>留一交叉验证</button>
          <button class="btn btn-ghost" id="btn-export">导出模型</button>
        </div>
        <div class="train-log" id="train-log"></div>`;

      trainPanel.querySelector('#btn-train').onclick = () => train();
      trainPanel.querySelector('#btn-eval').onclick = () => evaluate();
      trainPanel.querySelector('#btn-export').onclick = () => {
        download(`slbg-personal-${Date.now()}.json`, JSON.stringify(ctx.personal.exportJSON(), null, 2));
        toast('已导出个性化模型 JSON');
      };
      if (info.trainedAt) {
        trainPanel.querySelector('#train-log').innerHTML =
          `<div class="log-line">上次训练：${new Date(info.trainedAt).toLocaleString()} · 模式 ${info.mode} · 训练集准确率 ${(info.accuracy * 100).toFixed(0)}%</div>`;
      }
      drawLoss([]);
    }

    function drawLoss(history) {
      const cv = trainPanel.querySelector('#loss-canvas');
      if (!cv) return;
      const g = cv.getContext('2d');
      const w = cv.width;
      const h = cv.height;
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.beginPath();
      g.moveTo(0, h - 1);
      g.lineTo(w, h - 1);
      g.stroke();
      if (history.length < 2) {
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.font = '12px system-ui, sans-serif';
        g.fillText('训练后这里会显示 loss 曲线', 10, h / 2);
        return;
      }
      const max = Math.max(...history);
      const min = Math.min(...history);
      const span = Math.max(1e-6, max - min);
      g.beginPath();
      history.forEach((v, i) => {
        const x = (i / (history.length - 1)) * (w - 10) + 5;
        const y = h - 8 - ((v - min) / span) * (h - 22);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.strokeStyle = '#6ee7b7';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.font = '11px system-ui, sans-serif';
      g.fillText(`loss ${min.toFixed(3)} → ${max.toFixed(3)}`, 8, 14);
    }

    async function train() {
      const log = trainPanel.querySelector('#train-log');
      const btn = trainPanel.querySelector('#btn-train');
      btn.disabled = true;
      const history = [];
      log.innerHTML = '<div class="log-line">训练中…</div>';
      try {
        const r = await ctx.personal.train({
          epochs: 90,
          onEpoch: (ep, total, loss) => {
            history.push(loss);
            if (ep % 5 === 0 || ep === total) {
              drawLoss(history);
              log.innerHTML = `<div class="log-line">第 ${ep}/${total} 轮 · loss ${loss.toFixed(4)}</div>`;
            }
          },
        });
        ctx.store.bumpTrain();
        log.innerHTML = `
          <div class="log-line ok">训练完成：${r.labels.length} 类 / ${r.samples} 样本 / 模式 ${r.mode}</div>
          <div class="log-line">训练集准确率 ${(r.accuracy * 100).toFixed(0)}% —— 这是乐观值，请用「留一交叉验证」看真实水平。</div>
          <div class="log-line ok">已解锁：${r.labels.map((id) => ctx.signName(id)).join('、')}</div>`;
        toast('训练完成，手型已解锁', { type: 'ok' });
        ctx.refresh?.();
        renderChips();
        renderCollect();
        renderTrain();
      } catch (err) {
        log.innerHTML = `<div class="log-line err">${esc(err.message || err)}</div>`;
        toast(String(err.message || err), { type: 'err' });
      } finally {
        btn.disabled = false;
      }
    }

    async function evaluate() {
      const log = trainPanel.querySelector('#train-log');
      const btn = trainPanel.querySelector('#btn-eval');
      btn.disabled = true;
      log.innerHTML = '<div class="log-line">留一交叉验证中（每个样本轮流当测试集）…</div>';
      try {
        const r = await ctx.personal.evaluate({
          onProgress: (i, n) => {
            log.innerHTML = `<div class="log-line">验证进度 ${i}/${n}</div>`;
          },
        });
        if (!r) return (log.innerHTML = '<div class="log-line err">样本太少，至少需要 4 个</div>');
        const wrong = Object.entries(r.confusion).filter(([k]) => !k.includes('→') || k.split('→')[0] !== k.split('→')[1]);
        log.innerHTML = `
          <div class="log-line ${r.accuracy >= 0.8 ? 'ok' : ''}">留一交叉验证准确率 ${(r.accuracy * 100).toFixed(1)}%（${Math.round(r.accuracy * r.n)}/${r.n}）</div>
          ${wrong.length ? `<div class="log-line">主要混淆：${wrong.map(([k, v]) => `${esc(k)} ×${v}`).join('，')}</div>` : ''}
          <div class="log-line muted">低于 80% 时建议补样本：换角度、换距离、换手，各采几张。</div>`;
      } catch (err) {
        log.innerHTML = `<div class="log-line err">${esc(err.message || err)}</div>`;
      } finally {
        btn.disabled = false;
      }
    }

    // ── 启动 ───────────────────────────────────────────────────
    const startBtn = el('button', { class: 'btn btn-primary', text: '开启摄像头', onclick: start });
    const importBtn = el('button', { class: 'btn btn-ghost', text: '导入模型', onclick: importModel });
    const resetBtn = el('button', { class: 'btn btn-ghost', text: '清空全部样本', onclick: resetAll });
    stageHost.append(el('div', { class: 'game-ctrl' }, [startBtn, importBtn, resetBtn]));

    async function start() {
      try {
        startBtn.disabled = true;
        startBtn.textContent = '正在启动…';
        await ctx.hands.load();
        if (!ctx.yolo.ready) await ctx.yolo.loadSession().catch(() => {});
        await stage.start({ mirror: ctx.store.state.settings.mirror });
        startBtn.textContent = '摄像头已开启';
        toast('手部关键点模型就绪，可以开始采集', { type: 'ok' });
      } catch (err) {
        toast(String(err.message || err), { type: 'err', ms: 4200 });
        startBtn.disabled = false;
        startBtn.textContent = '开启摄像头';
      }
    }

    function importModel() {
      const input = el('input', { type: 'file', accept: '.json,application/json' });
      input.onchange = async () => {
        try {
          const text = await input.files[0].text();
          ctx.personal.importJSON(JSON.parse(text));
          renderChips();
          renderCollect();
          renderTrain();
          ctx.refresh?.();
          toast('模型已导入', { type: 'ok' });
        } catch (err) {
          toast(String(err.message || err), { type: 'err' });
        }
      };
      input.click();
    }

    function resetAll() {
      modal({
        title: '清空全部训练样本？',
        body: '<p>这会删除本机保存的所有关键点样本与训练好的个性化模型，且无法恢复。建议先「导出模型」备份。</p>',
        actions: [
          { label: '取消' },
          {
            label: '确认清空',
            primary: true,
            onClick: () => {
              ctx.personal.clear();
              renderChips();
              renderCollect();
              renderTrain();
              ctx.refresh?.();
            },
          },
        ],
      });
    }

    renderChips();
    renderCollect();
    renderTrain();

    return () => stage.stop();
  },
};
