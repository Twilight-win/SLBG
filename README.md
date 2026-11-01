# Sign Language-Based Game（SLBG）

一个**打开网页就能玩**的手语学习游戏站：摄像头比出手势 → 深度学习模型实时识别 → 玩游戏得反馈、攒进度。
社区可以自己加词、自己采集数据、自己训练，把"只有 1 个手势"慢慢长成一套手语词库。

- **零安装**：静态网站，浏览器打开即玩，不需要下载 App 或安装 Python。
- **真深度学习**：YOLOv8n（ONNX）在浏览器内推理 + MediaPipe 手部关键点 + 浏览器内训练的 TinyMLP。
- **数据不出设备**：所有进度、样本、照片只存在你自己的浏览器里，没有后端、不上传。
- **免费托管**：GitHub Pages 静态托管，无服务器费用。

> 当前模型状态：官方 YOLO 训练了 **1 个类别（数字 6）**。其他词条约 15 个是"知识卡"，
> 需要先用「词工坊 → 端侧训练营」自己训练后才能进入识别类游戏。这是刻意的：
> 旧版 bug 就是词库列了词、模型却不认识，还照样出题。

---

## 快速开始

### 玩家：直接用
打开站点首页 → 点「游戏」→ 选一个游戏 → 允许摄像头 → 比手势。

完整说明见 [`docs/使用说明.md`](docs/使用说明.md)。

### 本地预览（推荐，改代码或跑采集时用）

```bash
# 在项目根目录
python server/serve.py          # 零依赖静态服务
# 浏览器打开 http://127.0.0.1:8123/
```

> 直接双击 `index.html`（`file://`）不行：浏览器会禁止读取模型文件、禁止调用摄像头。

### 部署到 GitHub Pages

1. 把本仓库推到 GitHub（Public）；
2. 仓库 **Settings → Pages → Build and deployment → Source**：`Deploy from a branch`；
3. 选择分支 `master`、目录 `/ (root)` → Save；
4. 等 1–2 分钟，访问 `https://<用户名>.github.io/SLBG/`。

仓库根目录已有 `.nojekyll`，不会被 Jekyll 过滤掉 `vendor/` 等目录。
Pages 自带 HTTPS，摄像头权限可以正常使用。

---

## 目录结构

```
index.html            站点入口（GitHub Pages 从根目录发布）
app/                  前端：css / js / models / vendor / assets
  js/core/            路由、本地存储、UI 组件
  js/data/            词库、自建词条、IndexedDB、ZIP 打包
  js/engine/          YOLO 推理、MediaPipe 关键点、能力中心、端侧 TinyMLP
  js/games/           六种玩法 + 端侧训练营
  js/views/           页面（首页 / 游戏 / 词工坊 / 词典 / 引擎 / 我的）
  models/             best.onnx + manifest.json（模型类别的唯一真相）
datasets/             提交进仓库的公开数据集
data/captures/        本地采集落盘（默认不提交，含人脸隐私）
training/             训练环境（独立 venv，网站运行不需要）
server/serve.py       本地静态服务 + 采集落盘接口
tools/                冒烟测试等脚本
docs/                 使用说明 / 数据贡献指南 / 维护者指南 / 架构说明
```

三个环境互不交叉：前端（无依赖）／训练（独立 venv）／数据（`datasets/` + `data/captures/`）。

---

## 数据怎么存、会不会丢

| 数据 | 位置 | 会不会丢 | 备份方式 |
|---|---|---|---|
| 进度（XP、等级、连续天数、徽章、复习计划） | localStorage | 换浏览器 / 清缓存 / 换设备会丢 | 「我的 → 导出完整备份」生成 JSON |
| 自建词条 | localStorage（随进度一起） | 同上 | 同上；也可「导出数据包」单独分享 |
| 端侧模型与样本 | localStorage | 同上 | 「我的 → 导出完整备份」含模型 |
| 自建词条上传的示例图 | IndexedDB | 同上 | 「词工坊 → 导出数据包」 |
| 官方数据集与模型 | 仓库 `datasets/`、`app/models/` | 不会丢 | Git |

恢复：新设备上打开站点 → 「我的 → 导入备份」选择 JSON 文件。
详见 [`docs/使用说明.md`](docs/使用说明.md#进度保存在哪里)。

---

## 怎么贡献数据

1. 站点里：词工坊建词 → 训练营录样本 → 「导出数据包」得到 ZIP；
2. 或在「数据任务」游戏里连拍（图片 + YOLO 框标注）；
3. fork 仓库 → 放进 `datasets/<词条>/` → 提 Pull Request；
4. 维护者审核后合入，下轮重训 YOLO，全站就认识这个词。

详见 [`docs/数据贡献指南.md`](docs/数据贡献指南.md)。

---

## 隐私与授权

- 默认不收集、不上传任何数据，也没有账号系统。
- 采集的拍摄者字段请用编号（如 `S001`），**不要写真名**。
- 真人照片默认不进仓库；入库前必须获得出镜者书面授权并在 PR 中声明。
- 文档中涉及本机路径一律写 `<项目根目录>`，不写具体用户名。

## 许可

- 代码：MIT
- 数据集与示例素材：CC BY-SA 4.0（提交者需确认有权以该许可公开）
