/**
 * 手势速通 —— 限时赛：60 秒内尽可能多地完成手型判定。
 * 题池严格来自 capability.playable()，模型不认识的词永远不会出现。
 */

import { Stage } from '../engine/stage.js';
import { HoldTracker } from '../engine/capability.js';
import { el, esc, ring, toast } from '../core/ui.js';
import { popXP, flashTip } from './feedback.js';

const DURATION = 60;

export default {
  id: 'rush',
  name: '手势速通',
  icon: '⚡',
  kind: 'ai',
  tagline: '60 秒，能比对手快多少？',
  desc: '倒计时 60 秒，屏幕给出目标手型，稳定保持即通过。连续答对有连击加成。题池只包含当前模型真正认识的手型。',
  requires: ['camera', 'playable'],

  mount(root, ctx) {
    const pool = ctx.capability.playable();
    if (!pool.length) {
      root.append(el('div', { class: 'empty-state', html: '<b>还没有可识别的手型</b><p>先去「端侧训练营」录几个样本训练一个模型，或者替换一个多类别 YOLO 模型。</p>' }));
      return () => {};
    }

    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let left = DURATION;
    let timer = null;
    let target = null;
    let running = false;
    let finished = false;

    const hold = new HoldTracker({ holdMs: ctx.store.state.settings.holdMs || 1200, threshold: ctx.yolo.thresholds?.score ?? 0.35 });

    const hud = el('div', { class: 'game-hud' });
    const stageHost = el('div', { class: 'stage-wrap' });
    const card = el('div', { class: 'target-card' });
    const bar = el('div', { class: 'hold-bar' }, [el('i', { class: 'hold-fill' })]);
    const fill = bar.querySelector('.hold-fill');
    const ctrl = el('div', { class: 'game-ctrl' });

    const startBtn = el('button', { class: 'btn btn-primary', text: '开启摄像头并开始', onclick: start });
    const stopBtn = el('button', { class: 'btn btn-ghost', text: '结束本局', onclick: finish, disabled: true });
    ctrl.append(startBtn, stopBtn);

    root.append(hud, el('div', { class: 'game-grid' }, [stageHost, el('div', { class: 'game-side' }, [card, bar, ctrl])]));

    const stage = new Stage(stageHost, { yolo: ctx.yolo, hands: ctx.hands, capability: ctx.capability });
    stage.message('点击下方按钮开启摄像头');

    function renderHud() {
      hud.innerHTML = `
        <div class="hud-item"><span>得分</span><b>${score}</b></div>
        <div class="hud-item"><span>剩余</span><b>${left}s</b></div>
        <div class="hud-item"><span>连击</span><b>${combo}${maxCombo ? ` / 最高 ${maxCombo}` : ''}</b></div>
        <div class="hud-item"><span>识别引擎</span><b>${esc(ctx.capability.statusText())}</b></div>`;
    }

    function nextTarget() {
      const others = pool.filter((s) => s.id !== target?.id);
      target = (others.length ? others : pool)[Math.floor(Math.random() * (others.length || pool.length))];
      hold.reset(target.id);
      const src = ctx.capability.sourceOf(target.id);
      const srcLabel = { yolo: 'YOLO 模型', personal: '端侧模型', fused: '双模型融合' }[src] || '未知';
      card.innerHTML = `
        <div class="target-kicker">请比出</div>
        <div class="target-word">${esc(target.word)}</div>
        <div class="target-pinyin">${esc(target.pinyin)}</div>
        <div class="target-desc">${esc(target.desc)}</div>
        <div class="target-src">判定来源：${srcLabel}</div>
        ${target.media?.some((m) => m.src) ? `<img class="target-img" src="${esc(target.media.find((m) => m.src).src)}" alt="${esc(target.word)}">` : ''}`;
      fill.style.width = '0%';
    }

    function onFrame({ result, ms }) {
      if (!running || finished) return;
      const st = hold.update(result);
      fill.style.width = `${(st.progress * 100).toFixed(0)}%`;
      fill.classList.toggle('ok', st.progress > 0.6);
      if (st.done) {
        const gain = 10 + Math.min(20, combo * 2);
        score += gain;
        combo += 1;
        maxCombo = Math.max(maxCombo, combo);
        ctx.store.record({ signId: target.id, ok: true, score: result.score, source: result.source, game: 'rush' });
        toast(`通过！${target.word} +${gain}${combo > 1 ? ` · ${combo} 连击` : ''}`, { type: 'ok' });
        popXP(gain);
        const passed = target;
        nextTarget();
        flashTip(card, passed, 2200); // 答完给一条动作要点，趁热打铁
        renderHud();
      }
      if (result && result.signId && result.signId !== target.id) {
        // 比错了不算失败，只是不推进进度条；由保持判定自然回退
      }
      void ms;
    }

    async function start() {
      try {
        startBtn.disabled = true;
        startBtn.textContent = '正在启动…';
        if (!ctx.yolo.ready) await ctx.yolo.loadSession();
        if (ctx.hands && !ctx.hands.ready) await ctx.hands.load().catch(() => {});
        await stage.start({ mirror: ctx.store.state.settings.mirror });
      } catch (err) {
        toast(String(err.message || err), { type: 'err', ms: 4200 });
        startBtn.disabled = false;
        startBtn.textContent = '开启摄像头并开始';
        return;
      }
      stage.onFrame = onFrame;
      running = true;
      finished = false;
      score = 0;
      combo = 0;
      left = DURATION;
      nextTarget();
      renderHud();
      stopBtn.disabled = false;
      startBtn.textContent = '已开始';
      timer = setInterval(() => {
        left -= 1;
        renderHud();
        if (left <= 0) finish();
      }, 1000);
    }

    function finish() {
      if (finished) return;
      finished = true;
      running = false;
      clearInterval(timer);
      stopBtn.disabled = true;
      startBtn.disabled = false;
      startBtn.textContent = '再来一局';
      ctx.store.gameResult('rush', score, { maxCombo });
      card.innerHTML = `
        <div class="result">
          ${ring(Math.min(1, score / 300), { size: 120, label: String(score), sub: '分' })}
          <div class="result-line">最高连击 ${maxCombo} · 题池 ${pool.map((s) => esc(s.word)).join('、')}</div>
        </div>`;
      ctx.refresh?.();
      toast(`本局结束：${score} 分`, { type: score > 100 ? 'ok' : 'info' });
    }

    renderHud();
    card.innerHTML = '<div class="target-kicker">准备好了吗？</div><div class="target-desc">点击「开启摄像头并开始」，把目标手型对准镜头稳定保持。</div>';

    return () => {
      clearInterval(timer);
      stage.stop();
    };
  },
};
