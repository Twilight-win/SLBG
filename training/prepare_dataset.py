#!/usr/bin/env python3
"""把 data/captures 里的采集数据整理成 YOLO 数据集。

关键设计：**按拍摄者（signer）整组划分 train/val**。
同一个人的手型、肤色、袖子、背景高度相似，如果随机划分，验证集会"见过"
训练集里的同一只手，指标虚高。按人划分才能得到可信的跨人指标。

用法（在 training 的虚拟环境里）：
    python training/prepare_dataset.py --out datasets/slbg_v1
    python training/prepare_dataset.py --out datasets/slbg_v1 --val-ratio 0.25 --min-per-class 30
"""
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURES = os.path.join(ROOT, "data", "captures")


def load_captures():
    items = []
    if not os.path.isdir(CAPTURES):
        return items
    for root, _dirs, files in os.walk(CAPTURES):
        for name in files:
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    meta = json.load(fh)
            except Exception:
                continue
            if not isinstance(meta, dict):
                continue
            img = os.path.join(CAPTURES, meta.get("image") or "")
            if not meta.get("bbox") or not os.path.isfile(img):
                continue
            items.append({
                "signId": str(meta.get("signId") or "unknown"),
                "signer": str(meta.get("signer") or "匿名"),
                "bbox": meta["bbox"],
                "image": img,
                "label": str(meta.get("label") or meta.get("signId")),
            })
    return items


def class_name(sign_id: str) -> str:
    """number-6 -> gesture_6，与仓库现有模型的命名保持一致；其它词条 -> gesture_xxx。"""
    base = sign_id[7:] if sign_id.startswith("number-") else sign_id
    return "gesture_" + base.replace("-", "_")


def yolo_box(bbox):
    x, y, w, h = [float(v) for v in bbox[:4]]
    return x + w / 2, y + h / 2, w, h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="datasets/slbg_v1", help="输出目录（相对仓库根）")
    ap.add_argument("--val-ratio", type=float, default=0.2)
    ap.add_argument("--min-per-class", type=int, default=20, help="低于该数量的类别会被跳过")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    out_dir = os.path.join(ROOT, args.out)
    items = load_captures()
    if not items:
        print(f"没有可用的带框采集数据：{CAPTURES}")
        print("先在网站的「数据任务」里采集几张（需检出手部框才会带标注）。")
        sys.exit(1)

    by_class = defaultdict(list)
    for it in items:
        by_class[it["signId"]].append(it)

    kept = {k: v for k, v in sorted(by_class.items()) if len(v) >= args.min_per_class}
    skipped = {k: len(v) for k, v in by_class.items() if len(v) < args.min_per_class}
    if not kept:
        print(f"没有任何类别达到 --min-per-class={args.min_per_class}：")
        for k, n in sorted(skipped.items()):
            print(f"  {k}: {n} 张")
        sys.exit(1)

    names = [class_name(k) for k in kept]
    cls = [{"id": i, "name": class_name(k), "signId": k, "zh": kept[k][0]["label"]} for i, k in enumerate(kept)]

    rng = random.Random(args.seed)
    splits = {"train": [], "val": []}
    for sign_id, rows in kept.items():
        signers = sorted({r["signer"] for r in rows})
        rng.shuffle(signers)
        n_val = max(1, round(len(signers) * args.val_ratio)) if len(signers) > 1 else 0
        val_signers = set(signers[:n_val])
        for r in rows:
            splits["val" if r["signer"] in val_signers else "train"].append(r)

    # 只有一个拍摄者时 val 会为空，ultralytics 直接报错。
    # 这里挪最后一张到 val 保证能训，但同时明确警告指标不可信。
    leak_warning = False
    if not splits["val"] and len(splits["train"]) > 1:
        splits["val"].append(splits["train"].pop())
        leak_warning = True

    for split in ("train", "val"):
        os.makedirs(os.path.join(out_dir, "images", split), exist_ok=True)
        os.makedirs(os.path.join(out_dir, "labels", split), exist_ok=True)

    counts = {}
    for split, rows in splits.items():
        counts[split] = len(rows)
        for r in rows:
            cid = names.index(class_name(r["signId"]))
            ext = os.path.splitext(r["image"])[1] or ".jpg"
            base = f"{r['signer']}_{os.path.splitext(os.path.basename(r['image']))[0]}{ext}"
            dst_img = os.path.join(out_dir, "images", split, base)
            shutil.copy2(r["image"], dst_img)
            cx, cy, w, h = yolo_box(r["bbox"])
            with open(os.path.join(out_dir, "labels", split, os.path.splitext(base)[0] + ".txt"), "w", encoding="utf-8") as fh:
                fh.write(f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")

    with open(os.path.join(out_dir, "data.yaml"), "w", encoding="utf-8") as fh:
        fh.write(f"path: {os.path.abspath(out_dir).replace(chr(92), '/')}\n")
        fh.write("train: images/train\nval: images/val\n")
        fh.write(f"nc: {len(names)}\n")
        fh.write("names:\n" + "\n".join(f"  {i}: {n}" for i, n in enumerate(names)) + "\n")

    with open(os.path.join(out_dir, "classes.json"), "w", encoding="utf-8") as fh:
        json.dump(cls, fh, ensure_ascii=False, indent=2)

    print(f"数据集已生成：{out_dir}")
    print(f"  类别 {len(names)}：{', '.join(names)}")
    print(f"  train {counts['train']} 张 / val {counts['val']} 张（按拍摄者整组划分）")
    if skipped:
        print("  跳过（样本不足）：" + ", ".join(f"{k}({n})" for k, n in sorted(skipped.items())))
    if leak_warning:
        print("\n  ⚠ 只有一个拍摄者，验证集与训练集来自同一人。")
        print("    指标会明显虚高，只用于确认流程能跑通，不要写进报告。")
        print("    建议再找 1–2 位同学各采 30 张，重新生成数据集。")


if __name__ == "__main__":
    main()
