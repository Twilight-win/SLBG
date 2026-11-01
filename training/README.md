# training/ —— 训练环境（环境 B）

**这个目录不属于网站运行时**。网站跑起来完全不需要它；只有"要给模型换新数据"时才用。

## 环境

```bash
cd "<项目根目录>"
python -m venv .venv/training
.venv/training/Scripts/python -m pip install -U pip
.venv/training/Scripts/pip install -r training/requirements.txt
```

之后所有命令都用 `.venv/training/Scripts/python`（PowerShell 写 `.venv\training\Scripts\python.exe`）。

**为什么必须隔离**：ultralytics 会拉 torch（2 GB+），且对 numpy/opencv 版本挑剔。
装进系统 Python 很容易和别的东西打架；而站点服务（`server/serve.py`）零依赖，
根本不需要这些包，混在一起只会让"起不来"的原因变模糊。

## 三个脚本

| 脚本 | 作用 | 输入 | 输出 |
|---|---|---|---|
| `prepare_dataset.py` | 采集数据 → YOLO 数据集（按人划分） | `data/captures/` | `datasets/<name>/` + `data.yaml` + `classes.json` |
| `train_yolo.py` | 训练 + 验证 | `data.yaml` | `training/runs/<name>/weights/best.pt` |
| `export_onnx.py` | 导出 ONNX + 写 manifest + 部署 | `best.pt` + `classes.json` | `app/models/best.onnx` + `manifest.json` |

## 一条命令走完

```bash
# 1) 整理
.venv/training/Scripts/python training/prepare_dataset.py --out datasets/slbg_v1

# 2) 训练并自动部署
.venv/training/Scripts/python training/train_yolo.py \
  --data datasets/slbg_v1/data.yaml --epochs 100 --imgsz 320 --deploy
```

`--deploy` 会在训练结束后调用 `export_onnx.py`，把模型和 manifest 直接放进 `app/models/`。
刷新浏览器即可生效，不需要重新构建前端。

## 参数速查

```bash
prepare_dataset.py
  --out datasets/slbg_v1   输出目录
  --val-ratio 0.2              验证集比例（按拍摄者整组留出）
  --min-per-class 20           低于该数量的类别跳过
  --seed 42

train_yolo.py
  --data .../data.yaml
  --model yolov8n.pt           预训练权重
  --epochs 100
  --imgsz 320                  必须与前端推理尺寸一致
  --batch 16
  --device 0 | cpu
  --deploy                     训练后自动导出部署

export_onnx.py
  --weights .../best.pt
  --classes .../classes.json
  --imgsz 320
  --version 0.2.0
  --map50 0.93 --map50-95 0.71 --precision 0.94 --recall 0.88   写进 manifest 的指标
  --score 0.35 --iou 0.45      前端阈值
  --no-copy                    只导出，不复制到 app/models
```

详细流程与坑见 [`../docs/数据集与训练.md`](../docs/数据集与训练.md)。
