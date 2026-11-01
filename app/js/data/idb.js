/**
 * 极简 IndexedDB 封装：存自建词条上传的示例图（二进制），不占 localStorage 配额。
 * 所有数据只在本机浏览器内，不上传任何服务器。
 */

const DB_NAME = 'slbg';
const STORE = 'media';
const VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('当前浏览器不支持 IndexedDB'));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const mediaDB = {
  async put(key, blob) {
    await tx('readwrite', (s) => s.put(blob, key));
    return key;
  },
  async get(key) {
    return tx('readonly', (s) => s.get(key));
  },
  async del(key) {
    await tx('readwrite', (s) => s.delete(key));
  },
  async keys() {
    const all = await tx('readonly', (s) => s.getAllKeys());
    return (all?.result || all || []).map(String);
  },
  async entries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).openCursor();
      const out = [];
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push({ key: String(cur.key), value: cur.value });
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
};

/** 读取为可直接 <img src> 的临时 URL；用完记得 revokeObjectURL */
export function blobURL(blob) {
  return blob ? URL.createObjectURL(blob) : null;
}
