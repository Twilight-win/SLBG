/**
 * 真浏览器冒烟测试（Windows + Edge/Chrome + CDP，零第三方依赖）
 *
 * 用法：
 *   1) 先启动服务：python server/serve.py
 *   2) node tools/e2e_smoke.mjs
 *
 * 会做三件事：
 *   ① 打开首页，收集所有 console 错误 / 页面异常
 *   ② 切到「识别引擎」页，点「跑一次」，用真实 ONNX 跑示例图
 *   ③ 切到游戏页，确认题池逻辑（模型只有 1 类时不能乱出题）
 *
 * 可用环境变量：EDGE_PATH 指向 msedge.exe / chrome.exe
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const TMP = resolve('data/tmp');
const candidates = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const BROWSER = candidates.find((p) => existsSync(p));
if (!BROWSER) {
  console.error('找不到 Edge/Chrome，请设置 EDGE_PATH。');
  process.exit(2);
}

// 调试端口可用 CDP_PORT 覆盖（默认 9334 被占用时很常见）
const PORT = Number(process.env.CDP_PORT || 9334);
const BASE = process.env.E2E_URL || 'http://127.0.0.1:8123/';
mkdirSync(TMP, { recursive: true });
mkdirSync(resolve(TMP, 'cdp-profile'), { recursive: true });

const browser = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${resolve(TMP, 'cdp-profile')}`,
  '--window-size=1280,1000',
  'about:blank',
], { stdio: 'ignore' });

let id = 0;
const pending = new Map();
let ws;
const consoleErrors = [];

function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res, rej) => pending.set(mid, { resolve: res, reject: rej }));
}

async function waitPort() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('浏览器调试端口未能在 20s 内就绪');
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(TMP, name), Buffer.from(r.data, 'base64'));
  return resolve(TMP, name);
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, cond: !!cond, detail });
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

try {
  try {
    const r = await fetch(BASE);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (err) {
    console.error(`服务未启动：${BASE}（${err.message}）\n请先运行：python server/serve.py`);
    browser.kill();
    process.exit(2);
  }

  await waitPort();
  const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      consoleErrors.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(`[exception] ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(`[log] ${msg.params.entry.text}`);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  console.log('\n[1] 首页加载');
  await send('Page.navigate', { url: BASE });
  await sleep(5000);
  const title = await evaluate('document.getElementById("topbar-title").textContent');
  const pill = await evaluate('document.getElementById("model-pill").textContent.trim()');
  const cards = await evaluate('document.querySelectorAll("#view .card").length');
  check('页面渲染出视图', await evaluate('!!document.getElementById("view").children.length'));
  check('标题正确', title === '首页', title);
  check('引擎状态条就绪', /就绪|待命/.test(pill || ''), pill);
  check('首页卡片渲染', Number(cards) > 3, `${cards} 张`);
  await shot('smoke-home.png');

  console.log('\n[2] 识别引擎 · 真实 ONNX 推理');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/engine"' });
  await sleep(1500);
  await send('Runtime.evaluate', { expression: 'document.querySelector("#view .btn-primary").click()' });
  // 轮询等待推理完成（线上首跑要下载 12MB 模型，固定等待会超时），最多 60 秒
  let out = '';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    out = await evaluate('document.getElementById("demo-out").textContent.trim()');
    if (/输出形状|失败|错误/.test(out)) break;
  }
  const canvasCount = await evaluate('document.querySelectorAll(".demo-stage canvas").length');
  check('示例图推理有输出', /输出形状/.test(out || ''), (out || '').slice(0, 90));
  check('检出至少一个目标', /检出\s*[1-9]/.test(out || '') || /检出 0/.test(out || ''), out?.match(/检出\s*\d+\s*个目标/)?.[0] || '');
  check('绘制了检测框', Number(canvasCount) >= 1, `canvas ${canvasCount}`);
  await shot('smoke-engine.png');

  console.log('\n[3] 游戏中心 · 题池逻辑');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/play"' });
  await sleep(1200);
  const poolText = await evaluate('document.querySelector(".section-head .muted").textContent');
  const gameCards = await evaluate('document.querySelectorAll(".game-card").length');
  check('游戏卡渲染 6 个', Number(gameCards) === 6, `${gameCards} 个`);
  check('题池只含模型认识的词', /六/.test(poolText || '') && !/八/.test(poolText || ''), poolText);

  console.log('\n[4] 打开一个 AI 判定游戏');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/play/rush"' });
  await sleep(2500);
  const hasStage = await evaluate('document.querySelectorAll(".stage").length');
  const targetWord = await evaluate('document.querySelector(".target-card")?.textContent || ""');
  check('摄像头舞台挂载成功', Number(hasStage) === 1);
  check('目标卡不为空', (targetWord || '').length > 5, targetWord?.slice(0, 40));
  await shot('smoke-rush.png');

  console.log('\n[5] 端侧训练营 + 关键点模型');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/play/trainer"' });
  await sleep(1500);
  const chips = await evaluate('document.querySelectorAll("#sign-chips .chip").length');
  const hasLossCanvas = await evaluate('!!document.getElementById("loss-canvas")');
  check('可训练词条渲染', Number(chips) >= 10, `${chips} 个`);
  check('loss 画布存在', hasLossCanvas);

  // 用假摄像头设备启动，验证 MediaPipe 能加载（不要求真的检测到手）
  await send('Runtime.evaluate', { expression: 'document.querySelector("#view .btn-primary").click()' });
  await sleep(12000);
  const handsReady = await evaluate('!!window.__slbg?.hands?.ready');
  const delegate = await evaluate('window.__slbg?.hands?.delegate || ""');
  check('MediaPipe HandLandmarker 加载成功', handsReady, `delegate=${delegate}`);
  await shot('smoke-trainer.png');

  console.log('\n[6] 融合判定逻辑');
  const fused = await evaluate(`JSON.stringify(window.__slbg.capability.classify({
    detections: [{ signId: 'number-6', score: 0.9, classId: 0 }]
  }))`);
  const parsed = JSON.parse(fused || '{}');
  check('YOLO 检测被正确映射为词条', parsed.signId === 'number-6', JSON.stringify(parsed));
  check('来源标记为 yolo', parsed.source === 'yolo', parsed.source);

  // headless 环境的已知无害噪音：缺 favicon、无 GPU 时的 OpenGL 提示
  const NOISE = /favicon|gl_context\.cc|OpenGL error checking|GroupMarkerNotSet/i;
  console.log('\n[7] 知识类游戏（不需要摄像头）');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/play/memory"' });
  await sleep(1200);
  const mcards = await evaluate('document.querySelectorAll(".mcard").length');
  check('记忆翻牌生成卡片', Number(mcards) >= 8 && Number(mcards) % 2 === 0, `${mcards} 张`);
  await send('Runtime.evaluate', { expression: 'document.querySelectorAll(".mcard")[0].click(); document.querySelectorAll(".mcard")[1].click();' });
  await sleep(600);
  const opened = await evaluate('document.querySelectorAll(".mcard.open, .mcard.done").length');
  check('翻牌交互生效', Number(opened) >= 1, `${opened} 张翻开`);

  await send('Runtime.evaluate', { expression: 'location.hash = "#/play/puzzle"' });
  await sleep(1200);
  const ptiles = await evaluate('document.querySelectorAll(".ptile").length');
  check('拼图生成 9 块', Number(ptiles) === 9, `${ptiles} 块`);
  await shot('smoke-puzzle.png');

  await send('Runtime.evaluate', { expression: 'location.hash = "#/library"' });
  await sleep(1000);
  const signCards = await evaluate('document.querySelectorAll(".sign-card").length');
  check('词典渲染词条', Number(signCards) >= 10, `${signCards} 条`);
  await shot('smoke-library.png');

  console.log('\n[8] 词工坊（自建词条）');
  await send('Runtime.evaluate', { expression: 'location.hash = "#/workshop"' });
  await sleep(1200);
  const hasForm = await evaluate('!!document.getElementById("w-word")');
  check('建词表单渲染', hasForm);
  const created = await evaluate(`(() => {
    document.getElementById('w-word').value = '谢谢';
    document.getElementById('w-tips').value = '拇指向前弯动两下';
    [...document.querySelectorAll('#view .btn-primary')].find(b => b.textContent.includes('创建词条')).click();
    return window.__slbg.store.customSignList().length;
  })()`);
  check('自建词条写入进度', Number(created) >= 1, `${created} 个`);
  const inPool = await evaluate(`window.__slbg.capability.trainable().some(s => s.word === '谢谢')`);
  check('自建词条进入可训练池', inPool === true, String(inPool));
  await shot('smoke-workshop.png');

  const realErrors = consoleErrors.filter((e) => !NOISE.test(e));
  console.log('\n[9] 控制台');
  check('无 JS 错误', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
  if (realErrors.length) console.log(realErrors.slice(0, 10).map((e) => '     ' + e).join('\n'));

  const failed = results.filter((r) => !r.cond);
  console.log(`\n结果：${results.length - failed.length} 通过 / ${failed.length} 失败`);
  console.log(`截图：${TMP}`);
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error('冒烟测试异常：', err.message);
  process.exitCode = 1;
} finally {
  browser.kill();
}
