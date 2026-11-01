#!/usr/bin/env python3
"""训练静态手型检测模型（YOLOv8n）。

环境：training 自己的虚拟环境（见 training/README.md），与 server/ 的标准库环境隔离。

    python training/train_yolo.py --data datasets/slbg_v1/data.yaml --epochs 100
    python training/train_yolo.py --data ... --epochs 100 --imgsz 320 --model yolov8s.pt --deploy

训练完成后用 export_onnx.py 导出并写 manifest，前端会自动读到新模型。
"""
from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="data.yaml 路径")
    ap.add_argument("--model", default="yolov8n.pt", help="预训练权重")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=320, help="必须与导出/推理尺寸一致（前端按 manifest 读）")
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default=None, help="例如 0 或 cpu；默认自动")
    ap.add_argument("--project", default=os.path.join(ROOT, "training", "runs"))
    ap.add_argument("--name", default="gesture")
    ap.add_argument("--deploy", action="store_true", help="训练后直接调用 export_onnx.py 部署到 app/models")
    args = ap.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("未安装 ultralytics。请先创建训练环境：")
        print("  python -m venv .venv/training && .venv/training/Scripts/pip install -r training/requirements.txt")
        sys.exit(2)

    data = args.data if os.path.isabs(args.data) else os.path.join(ROOT, args.data)
    if not os.path.isfile(data):
        print(f"找不到数据集配置：{data}")
        print("先运行：python training/prepare_dataset.py --out datasets/slbg_v1")
        sys.exit(1)

    print(f"数据：{data}")
    print(f"模型：{args.model} · imgsz {args.imgsz} · epochs {args.epochs} · batch {args.batch}")

    model = YOLO(args.model)
    result = model.train(
        data=data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        exist_ok=True,
        verbose=True,
    )

    metrics = model.val(data=data, imgsz=args.imgsz)
    save_dir = getattr(result, "save_dir", None) or os.path.join(args.project, args.name)
    print("\n=== 验证结果 ===")
    try:
        box = metrics.box
        print(f"  mAP50     : {box.map50:.4f}")
        print(f"  mAP50-95  : {box.map:.4f}")
        print(f"  precision : {box.mp:.4f}")
        print(f"  recall    : {box.mr:.4f}")
    except Exception as exc:
        print(f"  指标读取失败：{exc}")
    print(f"  权重目录   : {save_dir}")

    if args.deploy:
        best = os.path.join(str(save_dir), "weights", "best.pt")
        if not os.path.isfile(best):
            print(f"找不到权重：{best}")
            sys.exit(1)
        os.system(f'"{sys.executable}" "{os.path.join(ROOT, "training", "export_onnx.py")}" '
                  f'--weights "{best}" --classes "{os.path.join(os.path.dirname(data), "classes.json")}" --imgsz {args.imgsz}')
    else:
        print("\n下一步：")
        print(f'  python training/export_onnx.py --weights "{os.path.join(str(save_dir), "weights", "best.pt")}" '
              f'--classes "{os.path.join(os.path.dirname(data), "classes.json")}"')


if __name__ == "__main__":
    main()
