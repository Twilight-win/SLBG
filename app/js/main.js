/**
 * 应用入口：装配引擎 → 路由 → 渲染视图。
 * 所有子系统在各自目录里独立，这里只负责把它们接起来。
 */

import { store } from './core/store.js';
import { Router } from './core/router.js';
import { toast, el, modal } from './core/ui.js';
import { YoloEngine } from './engine/yolo.js';
import { HandLandmarker } from './engine/landmarks.js';
import { Capability } from './engine/capability.js';
import { personalModel } from './engine/tinymlp.js';
import { signById, syncCustomSigns } from './data/signs.js';
import { HomeView } from './views/home.js';
import { LibraryView, SignDetailView } from './views/library.js';
import { PlayView, GameView } from './views/play.js';
import { ProfileView } from './views/profile.js';
import { EngineView } from './views/engine.js';
import { WorkshopView } from './views/workshop.js';
import { gameById } from './games/index.js';

store.load();
syncCustomSigns(store.customSignList()); // 自建词条要在任何视图渲染前并入索引

const yolo = new YoloEngine();
const hands = new HandLandmarker();
const personal = personalModel;
const capability = new Capability(yolo, personal);

const NAV = [
  { key: 'home', label: '首页', icon: '🏠', path: 'home' },
  { key: 'play', label: '游戏', icon: '🎮', path: 'play' },
  { key: 'workshop', label: '词工坊', icon: '✍️', path: 'workshop' },
  { key: 'library', label: '词典', icon: '📖', path: 'library' },
  { key: 'engine', label: '引擎', icon: '⚙️', path: 'engine' },
  { key: 'me', label: '我的', icon: '🙋', path: 'me' },
];

const view = document.getElementById('view');
const sideNav = document.getElementById('side-nav');
const tabbar = document.getElementById('tabbar');
const titleEl = document.getElementById('topbar-title');
const boot = document.getElementById('boot');
const shell = document.getElementById('shell');
let cleanup = null;

const ctx = {
  yolo, hands, capability, personal, store,
  go: (p) => router.go(p),
  toast,
  signName: (id) => signById[id]?.word || id,
  refresh: () => renderNav(),
};

const router = new Router(handleRoute);

function renderNav() {
  const cur = router.path.split('/')[0] || 'home';
  sideNav.innerHTML = '';
  for (const n of NAV) {
    sideNav.append(
      el('a', { class: `nav-item${cur === n.key ? ' active' : ''}`, href: `#/${n.path}` }, [
        el('span', { class: 'nav-icon', text: n.icon }),
        el('span', { text: n.label }),
      ])
    );
  }
  tabbar.innerHTML = '';
  for (const n of NAV.slice(0, 5)) {
    tabbar.append(
      el('a', { class: `tab${cur === n.key ? ' active' : ''}`, href: `#/${n.path}` }, [
        el('span', { class: 'tab-icon', text: n.icon }),
        el('span', { class: 'tab-label', text: n.label }),
      ])
    );
  }
  const pill = document.getElementById('model-pill');
  if (pill) {
    const n = capability.playable().length;
    pill.innerHTML = `<i class="dot"></i> ${yolo.ready ? '引擎就绪' : '引擎待命'} · 可玩 ${n}`;
    pill.classList.toggle('pill-ok', n > 0);
  }
}

function handleRoute({ name, params }) {
  cleanup?.();
  cleanup = null;
  view.innerHTML = '';
  renderNav();

  const titles = { home: '首页', play: '游戏中心', workshop: '词工坊', library: '手语词典', engine: '识别引擎', me: '我的档案' };
  let frag;
  let mounter = null;

  if (name === 'home') frag = HomeView(ctx);
  else if (name === 'workshop') frag = WorkshopView(ctx);
  else if (name === 'library') frag = params[0] ? SignDetailView(ctx, params[0]) : LibraryView(ctx);
  else if (name === 'play') {
    if (params[0]) {
      const g = GameView(ctx, params[0]);
      frag = g.frag;
      mounter = g.mount;
      const gm = gameById[params[0]];
      if (gm) titleEl.textContent = gm.name;
    } else {
      frag = PlayView(ctx);
    }
  } else if (name === 'engine') frag = EngineView(ctx);
  else if (name === 'me') frag = ProfileView(ctx);
  else {
    frag = el('div', { class: 'empty-state', text: '页面不存在' });
  }

  if (titles[name] && !(name === 'play' && params[0])) titleEl.textContent = titles[name];
  view.append(frag);
  view.scrollTop = 0;

  if (mounter) {
    try {
      const done = mounter();
      if (typeof done === 'function') cleanup = done;
    } catch (err) {
      view.append(el('div', { class: 'empty-state', html: `<b>游戏加载失败</b><p>${String(err.message || err)}</p>` }));
    }
  }
}

// ── 启动 ──────────────────────────────────────────────────────
async function boot_() {
  try {
    await yolo.loadManifest();
  } catch (err) {
    console.warn('manifest 加载失败', err);
    toast('模型清单读取失败：请通过 server/serve.py 启动，而不是双击 HTML', { type: 'err', ms: 6000 });
  }
  boot.hidden = true;
  shell.hidden = false;
  renderNav();
  router.start();

  document.getElementById('menu-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });
  document.getElementById('main')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.remove('open');
  });

  // 调试钩子：控制台里可直接查看引擎状态，也供 tools/e2e_smoke.mjs 断言
  window.__slbg = { yolo, hands, capability, personal, store, ctx };

  // 环境自检：file:// 打开时给出明确提示
  if (location.protocol === 'file:') {
    modal({
      title: '需要通过本地服务打开',
      body: `<p>当前是 <code>file://</code> 协议，浏览器会禁止读取模型文件、禁止调用摄像头。</p>
        <p>请在项目根目录执行：</p><pre>python server/serve.py</pre><p>然后访问 <code>http://127.0.0.1:8123/</code></p>`,
      actions: [{ label: '我知道了', primary: true }],
    });
  }
}

boot_();
