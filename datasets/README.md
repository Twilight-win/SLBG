# datasets/ —— 公开数据集

这里放**提交进仓库**的数据集：已脱敏、已获授权、可直接用于 YOLO 重训。
本地采集的原始数据放 `data/captures/`（默认 `.gitignore` 忽略，不入库）。

## 目录约定

```
datasets/<词条或数据集名>/
├── images/            *.jpg
├── labels/            *.txt        YOLO 格式：class cx cy w h（归一化 0–1）
└── meta.json          元数据（见下）
```

如果数据是由 `training/prepare_dataset.py` 生成的，还会有 `data.yaml` 与 `classes.json`
（后者是前端 manifest 类别的来源）。

## meta.json 格式

```json
{
  "signId": "number-6",
  "word": "六",
  "kind": "static",
  "signers": ["S001"],
  "source": "web-capture",
  "license": "CC BY-SA 4.0",
  "notes": "示例：拇指与小指伸直，其余三指弯曲",
  "images": [
    { "file": "images/001.jpg", "signer": "S001", "bbox": [0.44, 0.50, 0.24, 0.31], "step": 1 }
  ]
}
```

字段说明：
- `signId`：必须与前端词库 `app/js/data/signs.js` 里的 `id` 一致，否则该类别不会进入题池；
- `signer`：**编号**，不要写真名；
- `bbox`：`[x_center, y_center, w, h]`，归一化到 0–1；
- `step`：分步动作时表示第几步（静态手型填 1）；
- `source`：`web-capture`（站点采集）/ `upload`（上传）/ `external`（外部授权素材）。

## 当前内容

- `gesture_number_6/`：数字 6（六）。当前官方 YOLO 唯一的类别，样本待社区补充。
  模型侧类名建议统一为 `gesture_number_6`（旧版曾写作 `gesture_6`，容易误读）。

## 提交前请确认

- [ ] 出镜者已书面同意以 CC BY-SA 4.0 公开；
- [ ] 无真实姓名、无设备信息、无背景隐私（门牌、证件、聊天界面）；
- [ ] 每个词 ≥ 3 位不同拍摄者、`prepare_dataset.py` 会按拍摄者划分验证集。
