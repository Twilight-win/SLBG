/** 极小的 DOM / 提示工具，避免每个页面各写一套。 */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastWrap = null;
export function toast(msg, { type = 'info', ms = 2600 } = {}) {
  toastWrap ||= document.getElementById('toast-wrap');
  if (!toastWrap) return;
  const node = el('div', { class: `toast toast-${type}`, text: msg });
  toastWrap.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
  }, ms);
}

export function modal({ title, body, actions = [], wide = false }) {
  const root = document.getElementById('modal-root');
  const close = () => {
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 200);
  };
  const wrap = el('div', { class: 'modal-mask' }, [
    el('div', { class: `modal-card${wide ? ' wide' : ''}` }, [
      el('div', { class: 'modal-head' }, [
        el('h3', { text: title }),
        el('button', { class: 'icon-btn', onclick: close, 'aria-label': '关闭', text: '✕' }),
      ]),
      el('div', { class: 'modal-body' }, [typeof body === 'string' ? el('div', { html: body }) : body]),
      el(
        'div',
        { class: 'modal-actions' },
        actions.map((a) =>
          el('button', {
            class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`,
            text: a.label,
            onclick: () => {
              const keep = a.onClick?.();
              if (keep !== false) close();
            },
          })
        )
      ),
    ]),
  ]);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  return close;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

/** 进度环 SVG */
export function ring(pct, { size = 96, stroke = 9, color = '#6ee7b7', label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${label ? `<text x="50%" y="47%" text-anchor="middle" class="ring-main">${esc(label)}</text>` : ''}
    ${sub ? `<text x="50%" y="66%" text-anchor="middle" class="ring-sub">${esc(sub)}</text>` : ''}
  </svg>`;
}

export function download(filename, data, mime = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
