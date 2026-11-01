#!/usr/bin/env python3
"""导出 ONNX 并生成 app/models/manifest.json —— 前端唯一的能力来源。

为什么要生成 manifest：浏览器端的 ONNX Runtime Web 通常不暴露 inputMetadata，
旧版前端"猜"输入尺寸导致形状不匹配、永远 0 检测。现在尺寸、类别、阈值都写死在
manifest 里，前端只负责照着做。

    python training/export_onnx.py --weights runs/gesture/weights/best.pt \
        --classes datasets/slbg_v1/classes.json --imgsz 320
    python training/export_onnx.py --weights ... --classes ... --map50 0.93 --version 0.2.0
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "app", "models")


def read_output_attrs(onnx_path: str, fallback: int):
    """从 ONNX 图里读输出通道数，决定解码方式（4+C 还是 5+C）。"""
    try:
        import onnx  # type: ignore
        model = onnx.load(onnx_path, load_external_data=False)
        out = model.graph.output[0]
        dims = [d.dim_value or d.dim_param for d in out.type.tensor_type.shape.dim]
        # [1, attrs, N] 或 [1, N, attrs]
        vals = [d for d in dims[1:] if isinstance(d, int)]
        if len(vals) == 2:
            a, b = vals
            return int(a) if a < b else int(b), dims
        return fallback, dims
    except Exception as exc:
        print(f"  （无法用 onnx 库读取输出形状：{exc}；使用 --attrs 指定）")
        return fallback, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True, help="best.pt 路径")
    ap.add_argument("--classes", required=True, help="classes.json 路径（prepare_dataset.py 生成）")
    ap.add_argument("--imgsz", type=int, default=320)
    ap.add_argument("--opset", type=int, default=12)
    ap.add_argument("--attrs", type=int, default=None, help="输出通道数（读不到时手动指定）")
    ap.add_argument("--version", default=None)
    ap.add_argument("--score", type=float, default=0.35)
    ap.add_argument("--iou", type=float, default=0.45)
    ap.add_argument("--map50", type=float, default=None)
    ap.add_argument("--map50-95", type=float, default=None)
    ap.add_argument("--precision", type=float, default=None)
    ap.add_argument("--recall", type=float, default=None)
    ap.add_argument("--name", default="gesture-yolov8")
    ap.add_argument("--no-copy", action="store_true", help="只导出，不复制到 app/models")
    args = ap.parse_args()

    weights = args.weights if os.path.isabs(args.weights) else os.path.join(ROOT, args.weights)
    classes_path = args.classes if os.path.isabs(args.classes) else os.path.join(ROOT, args.classes)
    if not os.path.isfile(weights):
        print(f"找不到权重：{weights}")
        sys.exit(1)
    if not os.path.isfile(classes_path):
        print(f"找不到类别表：{classes_path}（先运行 prepare_dataset.py）")
        sys.exit(1)

    with open(classes_path, "r", encoding="utf-8") as fh:
        classes = json.load(fh)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("未安装 ultralytics，无法导出。请在 training 虚拟环境里运行。")
        sys.exit(2)

    print(f"导出 ONNX：{weights} @ {args.imgsz}")
    model = YOLO(weights)
    exported = model.export(format="onnx", imgsz=args.imgsz, simplify=True, opset=args.opset, dynamic=False)
    onnx_path = str(exported)
    size_mb = os.path.getsize(onnx_path) / 1024 / 1024
    print(f"  已导出：{onnx_path}（{size_mb:.1f} MB）")

    attrs, dims = read_output_attrs(onnx_path, args.attrs or (5 + len(classes) - 1))
    print(f"  输出形状：{dims or '未知'} → 通道数 {attrs}")

    version = args.version or f"0.{date.today().strftime('%Y%m%d')}"
    manifest = {
        "schema": "slbg-manifest/1",
        "name": args.name,
        "version": version,
        "task": "detect",
        "model": os.path.basename(onnx_path),
        "input": {
            "name": "images",
            "width": args.imgsz,
            "height": args.imgsz,
            "layout": "NCHW",
            "letterbox": True,
            "pad": 114,
            "normalize": "0-1",
            "color": "RGB",
        },
        "output": {"name": "output0", "layout": "CHW", "attrs": attrs},
        "classes": classes,
        "thresholds": {"score": args.score, "iou": args.iou},
        "metrics": {
            "precision": args.precision,
            "recall": args.recall,
            "map50": args.map50,
            "map50_95": args.map50_95,
        },
        "trainedAt": date.today().isoformat(),
        "source": f"ultralytics export from {os.path.basename(weights)}",
        "notes": "由 training/export_onnx.py 自动生成。前端按此文件加载模型与类别，改模型请改这里。",
    }

    if args.no_copy:
        out_manifest = os.path.join(os.path.dirname(onnx_path), "manifest.json")
        with open(out_manifest, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, ensure_ascii=False, indent=2)
        print(f"  manifest：{out_manifest}")
        return

    os.makedirs(MODELS, exist_ok=True)
    target = os.path.join(MODELS, os.path.basename(onnx_path))
    shutil.copy2(onnx_path, target)
    with open(os.path.join(MODELS, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    print(f"  已部署：{target}")
    print(f"  已写入：{os.path.join(MODELS, 'manifest.json')}")
    print(f"  类别（{len(classes)}）：" + ", ".join(f"{c['id']}:{c['name']}" for c in classes))
    print("\n下一步：重启 server/serve.py（或刷新页面），到「识别引擎」页点「跑一次」验证。")


if __name__ == "__main__":
    main()
