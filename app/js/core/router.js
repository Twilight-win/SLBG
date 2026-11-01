/** 极简 hash 路由：#/play/rush  ->  { name:'play', params:['rush'] } */

export class Router {
  constructor(onChange) {
    this.onChange = onChange;
    this.routes = new Map();
    window.addEventListener('hashchange', () => this._fire());
  }

  add(pattern, handler) {
    this.routes.set(pattern, handler);
    return this;
  }

  get path() {
    return (location.hash || '#/home').replace(/^#\/?/, '');
  }

  go(path) {
    const target = `#/${String(path).replace(/^#?\/?/, '')}`;
    if (location.hash === target) this._fire();
    else location.hash = target;
  }

  start() {
    if (!location.hash) location.hash = '#/home';
    this._fire();
    return this;
  }

  _fire() {
    const segs = this.path.split('/').filter(Boolean);
    const name = segs[0] || 'home';
    const params = segs.slice(1);
    this.onChange({ name, params, path: this.path });
  }
}
