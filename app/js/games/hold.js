/**
 * 稳态大师 —— 比的是"稳"，不是"快"。
 * 目标手型必须一直保持在判定阈值以上，手一松分数就停；丢手势超过 0.8 秒本轮结束。
 */

import { Stage } from '../engine/stage.js';
import { el, esc, ring, toast } from '../core/ui.js';
import { popXP, roundFeedback } from './feedback.js';

const ROUNDS = 3;
const GRACE_MS = 800;

export default {
  id: 'hold',
  name: '稳态大师',
  icon: '🧘',
  kind: 'ai',
  tagline: '手别抖，分才涨',
  desc: '三轮比拼：保持目标手型，分数随保持时长增长。中途松手会扣分并结束本轮。适合练习手部稳定性与镜头距离。',
  requires: ['camera', 'playable'],

  mount(root, ctx) {
    const pool = ctx.capability.playable().filter((s) => s.kind === 'static');
    if (!pool.length) {
      root.append(el('div', { class: 'empty-state', html: '<b>还没有可识别的静态手型</b><p>先去「端侧训练营」解锁，或替换一个类别更多的 YOLO 模型。</p>' }));
      return () => {};
    }

    let round = 0;
    let scores = [];
    let running = false;
    let target = null;
    let holdStart = 0;
    let missStart = 0;
    let curScore = 0;
    let best = 0;

    const hud = el('div', { class: 'game-hud' });
    const stageHost = el('div', { class: 'stage-wrap' });
    const card = el('div', { class: 'target-card' });
    const ctrl = el('div', { class: 'game-ctrl' });
    const startBtn = el('button', { class: 'btn btn-primary', text: '开启摄像头并开始', onclick: start });
    ctrl.append(startBtn);
    root.append(hud, el('div', { class: 'game-grid' }, [stageHost, el('div', { class: 'game-side' }, [card, ctrl])]));

    const stage = new Stage(stageHost, { yolo: ctx.yolo, hands: ctx.hands, capability: ctx.capability });
    stage.message('点击下方按钮开启摄像头');

    function renderHud() {
      hud.innerHTML = `
        <div class="hud-item"><span>轮次</span><b>${Math.min(round + 1, ROUNDS)} / ${ROUNDS}</b></div>
        <div class="hud-item"><span>本轮得分</span><b>${Math.floor(curScore)}</b></div>
        <div class="hud-item"><span>已完成</span><b>${scores.map((s) => Math.floor(s)).join(' · ') || '—'}</b></div>
        <div class="hud-item"><span>阈值</span><b>${((ctx.yolo.thresholds?.score ?? 0.35) * 100).toFixed(0)}%</b></div>`;
    }

    function newRound() {
      const others = pool.filter((s) => s.id !== target?.id);
      target = (others.length ? others : pool)[Math.floor(Math.random() * (others.length || pool.length))];
      holdStart = 0;
      missStart = 0;
      curScore = 0;
      const src = ctx.capability.sourceOf(target.id);
      card.innerHTML = `
        <div class="target-kicker">第 ${round + 1} 轮 · 请保持</div>
        <div class="target-word">${esc(target.word)}</div>
        <div class="target-desc">${esc(target.desc)}</div>
        <div class="target-src">判定来源：${{ yolo: 'YOLO 模型', personal: '端侧模型', fused: '双模型融合' }[src] || '未知'}</div>`;
      renderHud();
    }

    function onFrame({ result }) {
      if (!running || !target) return;
      const thr = ctx.yolo.thresholds?.score ?? 0.35;
      const ok = result?.signId === target.id && result.score >= thr;
      const now = performance.now();
      if (ok) {
        if (!holdStart) holdStart = now;
        missStart = 0;
        curScore = (now - holdStart) / 100;
        best = Math.max(best, curScore);
      } else if (holdStart) {
        if (!missStart) missStart = now;
        else if (now - missStart > GRACE_MS) endRound();
      }
      renderHud();
    }

    function endRound() {
      scores.push(curScore);
      ctx.store.record({ signId: target.id, ok: curScore > 5, score: Math.min(1, curScore / 20), source: 'yolo', game: 'hold' });
      round += 1;
      running = false;
      if (round >= ROUNDS) return finish();
      const passed = curScore > 5;
      card.innerHTML = `<div class="target-kicker">第 ${round} 轮结束</div><div class="target-word">${Math.floor(curScore)} 分</div>`;
      card.append(roundFeedback({ ok: passed, sign: target, score: Math.min(1, curScore / 20), extra: `保持 ${(curScore / 10).toFixed(1)} 秒` }));
      if (passed) popXP(8 + Math.round(Math.min(1, curScore / 20) * 12));
      card.append(el('button', { class: 'btn btn-primary', id: 'next-round', text: '下一轮' }));
      card.querySelector('#next-round').onclick = () => {
        running = true;
        newRound();
      };
      renderHud();
    }

    function finish() {
      const total = Math.floor(scores.reduce((a, b) => a + b, 0));
      ctx.store.gameResult('hold', total, { rounds: scores.length });
      stage.stop();
      card.innerHTML = `
        <div class="result">
          ${ring(Math.min(1, total / 200), { size: 120, label: String(total), sub: '总分' })}
          <div class="result-line">三轮成绩：${scores.map((s) => Math.floor(s)).join(' / ')}</div>
          <button class="btn btn-primary" id="again">再来一次</button>
        </div>`;
      // 用路由重挂载代替整页刷新，避免丢掉引擎已加载的会话
      card.querySelector('#again').onclick = () => ctx.go('play/hold');
      startBtn.disabled = true;
      ctx.refresh?.();
      toast(`总分 ${total}`, { type: 'ok' });
    }

    async function start() {
      try {
        startBtn.disabled = true;
        startBtn.textContent = '正在启动…';
        if (!ctx.yolo.ready) await ctx.yolo.loadSession();
        if (ctx.hands && !ctx.hands.ready) await ctx.hands.load().catch(() => {});
        await stage.start({ mirror: ctx.store.state.settings.mirror });
        stage.onFrame = onFrame;
        running = true;
        round = 0;
        scores = [];
        startBtn.textContent = '进行中';
        newRound();
      } catch (err) {
        toast(String(err.message || err), { type: 'err', ms: 4200 });
        startBtn.disabled = false;
        startBtn.textContent = '开启摄像头并开始';
      }
    }

    renderHud();
    card.innerHTML = '<div class="target-kicker">准备好了吗？</div><div class="target-desc">点击开始，把手型稳稳地举在镜头前。</div>';

    return () => stage.stop();
  },
};
