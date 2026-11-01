#!/usr/bin/env python3
"""SLBG 手势游戏站 —— 本地静态服务 + 采集落盘 API（标准库，无需 pip 安装）。

作用：
  1. 托管 app/ 站点。摄像头、ES Module、fetch(onnx/wasm) 都要求 http(s)，
     双击 HTML 用 file:// 打开必然失败。
  2. 接收游戏里采集的样本，落到 data/captures/（图片 + 标注 JSON）。
  3. 统计与导出 YOLO 数据集 zip，交给 training/ 训练。

用法：
    python server/serve.py                 # http://127.0.0.1:8123/
    python server/serve.py --port 9000
    python server/serve.py --host 0.0.0.0  # 局域网访问（注意数据隐私）

这个环境只依赖 Python 标准库，和 training/ 的 torch 环境完全隔离。
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
CAPTURES = os.path.join(ROOT, "data", "captures")
MAX_BODY = 12 * 1024 * 1024
SAFE = re.compile(r"^[A-Za-z0-9_\-\u4e00-\u9fa5]{1,32}$")

EXTRA_MIME = {
    ".onnx": "application/octet-stream",
    ".wasm": "application/wasm",
    ".mjs": "text/javascript",
    ".task": "application/octet-stream",
    ".mp4": "video/mp4",
}


def safe_part(value: str, fallback: str) -> str:
    value = (value or "").strip()
    if not SAFE.match(value):
        value = re.sub(r"[^A-Za-z0-9_\-\u4e00-\u9fa5]", "_", value)[:32] or fallback
    return value


def iter_captures():
    """遍历 data/captures 下所有标注 JSON。"""
    if not os.path.isdir(CAPTURES):
        return
    for root, _dirs, files in os.walk(CAPTURES):
        for name in files:
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    meta = json.load(fh)
                if isinstance(meta, dict):
                    meta["_path"] = path
                    yield meta
            except Exception:
                continue


def stats_payload() -> dict:
    by_sign: dict[str, int] = {}
    by_signer: dict[str, int] = {}
    labeled = 0
    total = 0
    for meta in iter_captures():
        total += 1
        by_sign[str(meta.get("signId") or "unknown")] = by_sign.get(str(meta.get("signId") or "unknown"), 0) + 1
        by_signer[str(meta.get("signer") or "匿名")] = by_signer.get(str(meta.get("signer") or "匿名"), 0) + 1
        if meta.get("bbox"):
            labeled += 1
    return {
        "ok": True,
        "total": total,
        "labeled": labeled,
        "bySign": by_sign,
        "bySigner": by_signer,
        "dataDir": os.path.relpath(CAPTURES, ROOT).replace("\\", "/"),
    }


def save_capture(payload: dict) -> dict:
    sign_id = safe_part(payload.get("signId"), "unknown")
    signer = safe_part(payload.get("signer"), "匿名")
    image = payload.get("image") or ""
    if not isinstance(image, str) or not image.startswith("data:image/"):
        raise ValueError("缺少有效的图片数据（需 data:image/... base64）")
    header, _, b64 = image.partition(",")
    ext = ".jpg" if ("jpeg" in header or "jpg" in header) else ".png" if "png" in header else ""
    if not ext:
        raise ValueError("只支持 JPEG / PNG")
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception as exc:
        raise ValueError(f"图片解码失败：{exc}")
    if len(raw) < 512 or len(raw) > 6 * 1024 * 1024:
        raise ValueError("图片大小异常（需小于 6 MB）")

    bbox = None
    raw_box = payload.get("bbox")
    if isinstance(raw_box, (list, tuple)) and len(raw_box) == 4:
        try:
            bbox = [min(1.0, max(0.0, round(float(v), 5))) for v in raw_box]
        except Exception:
            bbox = None

    stamp = int(time.time() * 1000)
    short = hashlib.sha1(f"{stamp}-{signer}-{sign_id}".encode()).hexdigest()[:6]
    folder = os.path.join(CAPTURES, signer, sign_id)
    os.makedirs(folder, exist_ok=True)
    base = f"{stamp}_{short}"
    with open(os.path.join(folder, base + ext), "wb") as fh:
        fh.write(raw)

    meta = {
        "id": base,
        "signId": sign_id,
        "signer": signer,
        "label": str(payload.get("label") or sign_id)[:64],
        "bbox": bbox,  # 归一化 [x, y, w, h]
        "landmarks": payload.get("landmarks") if isinstance(payload.get("landmarks"), list) else None,
        "image": os.path.relpath(os.path.join(folder, base + ext), CAPTURES).replace("\\", "/"),
        "width": payload.get("width"),
        "height": payload.get("height"),
        "createdAt": stamp,
        "source": payload.get("source") or "quest",
    }
    with open(os.path.join(folder, base + ".json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    return meta


def export_zip(payload: dict) -> bytes:
    """把带框的采集数据打包成 YOLO 数据集 zip（images/train|val + labels + data.yaml）。"""
    classes = payload.get("classes") or []
    key_to_id: dict[str, int] = {}
    names: dict[int, str] = {}
    for item in classes:
        try:
            cid = int(item.get("id"))
        except Exception:
            continue
        for key in (item.get("signId"), item.get("key"), item.get("zh")):
            if key:
                key_to_id[str(key)] = cid
        names[cid] = str(item.get("zh") or item.get("key") or cid)
    if not key_to_id:
        raise ValueError("缺少类别定义（classes）")

    entries = []
    for meta in iter_captures():
        key = str(meta.get("signId"))
        bbox = meta.get("bbox")
        rel = meta.get("image")
        if key not in key_to_id or not bbox or not rel:
            continue
        path = os.path.join(CAPTURES, rel)
        if not os.path.isfile(path):
            continue
        entries.append((meta, path, key_to_id[key]))
    if not entries:
        raise ValueError("还没有带手部框的采集数据")

    entries.sort(key=lambda item: item[0].get("createdAt") or 0)
    n = len(entries)
    split_idx = 1 if n == 1 else max(1, min(n - 1, int(n * 0.8)))

    buf = io.BytesIO()
    counts = {"train": 0, "val": 0}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, (meta, path, cid) in enumerate(entries):
            split = "train" if idx < split_idx else "val"
            counts[split] += 1
            ext = os.path.splitext(path)[1] or ".jpg"
            img_name = f"{meta['signer']}_{meta['id']}{ext}"
            zf.write(path, f"images/{split}/{img_name}")
            x, y, w, h = bbox_to_yolo(meta["bbox"])
            zf.writestr(
                f"labels/{split}/{meta['id']}.txt",
                f"{cid} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n",
            )
        yaml_names = "\n".join(f"  {i}: {names[i]}" for i in sorted(names))
        zf.writestr(
            "data.yaml",
            "path: .\ntrain: images/train\nval: images/val\n"
            f"nc: {len(names)}\nnames:\n{yaml_names}\n",
        )
        zf.writestr(
            "_manifest.json",
            json.dumps(
                {"classes": [{"id": i, "name": names[i]} for i in sorted(names)], "counts": counts},
                ensure_ascii=False,
                indent=2,
            ),
        )
    return buf.getvalue()


def bbox_to_yolo(bbox):
    """归一化 [x, y, w, h]（左上角）-> YOLO [cx, cy, w, h]"""
    x, y, w, h = [float(v) for v in bbox[:4]]
    return x + w / 2, y + h / 2, w, h


class Handler(SimpleHTTPRequestHandler):
    """静态服务仓库根目录（与 GitHub Pages 的发布结构一致）+ /api/*。"""

    def __init__(self, *args, **kwargs):
        # 与线上一致：入口 index.html 在仓库根，前端资源在 app/ 下
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("  [api] %s\n" % (fmt % args))

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTRA_MIME:
            return EXTRA_MIME[ext]
        return super().guess_type(path)

    def end_headers(self):
        # 开发期禁用缓存，改前端/模型后立即生效
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ── API ────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self._json({"ok": True, "service": "slbg", "root": "app/"})
        if path == "/api/stats":
            return self._json(stats_payload())
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            payload = self._read_json()
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 400)

        if path == "/api/capture":
            try:
                meta = save_capture(payload)
                return self._json({"ok": True, "meta": meta})
            except ValueError as exc:
                return self._json({"ok": False, "error": str(exc)}, 400)
            except OSError as exc:
                return self._json({"ok": False, "error": f"写入失败：{exc}"}, 500)

        if path == "/api/export":
            try:
                data = export_zip(payload)
            except ValueError as exc:
                return self._json({"ok": False, "error": str(exc)}, 400)
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="slbg_dataset.zip"')
            self.end_headers()
            self.wfile.write(data)
            return

        return self._json({"ok": False, "error": "未知接口"}, 404)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > MAX_BODY:
            raise ValueError("请求体过大")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise ValueError(f"JSON 解析失败：{exc}")

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    ap = argparse.ArgumentParser(description="SLBG 手势游戏站本地服务")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8123)
    args = ap.parse_args()

    os.makedirs(CAPTURES, exist_ok=True)
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"SLBG 手势游戏站：http://{args.host}:{args.port}/")
    print(f"  站点目录：{ROOT}（入口 index.html，与 GitHub Pages 一致）")
    print(f"  采集落盘：{CAPTURES}")
    print(f"  采集目录：{CAPTURES}")
    print("  停止：Ctrl+C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
