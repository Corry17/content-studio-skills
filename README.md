# 内容网页与汇报 PPT 工作室

两个 Qoder Agent Skill：把资料做成可分享的 **H5 / HTML**，或可编辑的 **汇报 / 答辩 PPTX**。另附**离线网页版工作室** [`web-studio/`](web-studio/index.html)：在浏览器里直接填内容、选风格或基调，一键生成 H5 或 PPTX，全程本地运行、不上传数据。

- 不限于总结：支持答辩、汇报、课程、作品集、资料导航和自定义内容。
- 内置 **12 种网页风格** 与 **12 种 PPT 基调**，也可以完全自定义。
- 读取指定素材文件夹，管理图片、视频、音频、附件与外链，交付可整包移动的离线文件。
- 初稿之后主动收集反馈，按“缺内容 / 内容太多 / 内容太少 / 重点与版式”分条迭代，保留版本与手工修改，由使用者确认定稿。

## 两个 Skill

| Skill | 用途 | 主要产物 |
| --- | --- | --- |
| [`summary-to-html`](.qoder/skills/summary-to-html/SKILL.md) | 网页答辩、总结、作品集、资料导航 | `dist/v001/index.html` + `resources.html` + 素材包 |
| [`report-to-pptx`](.qoder/skills/report-to-pptx/SKILL.md) | 工作汇报、项目评审、开题与毕业答辩 | 可编辑 `dist/v001/<slug>-v001.pptx`，含演讲备注 |

调用示例：

```text
/summary-to-html 读取 projects/my-project，按我的大纲制作网页。
第三章放视频，结尾提供论文下载，先让我选样式。

/report-to-pptx 读取 ppt-projects/my-report，做 15 分钟答辩。
正式克制、米白底、深灰字，不加动画，附演讲备注。
```

## 快速开始

1. **放入技能**：把 `.qoder/skills/summary-to-html` 和 `.qoder/skills/report-to-pptx` 复制到你项目的 `.qoder/skills/`，或复制到个人全局 `~/.qoder/skills/`（如目录权限允许）。
2. **准备素材**：在技能项目目录（如 `projects/<slug>/`）放入文件，并在 `BRIEF.txt` 用自然语言写要求；配置可以由助手代填，不需要手写 JSON。
3. **选择样式**：网页用浏览器打开 [`style-preview.html`](style-preview.html) 比较 12 种风格；PPT 用 Powerpoint/WPS 打开 [`tone-preview.pptx`](ppt-projects/my-report/preview/v002/tone-preview.pptx) 比较 12 种基调。
4. **迭代交付**：助手生成初稿后，直接说“第三节太长”“缺操作示例”“这版可以定稿”即可。

PPT 技能首次使用需要安装依赖（仅 PptxGenJS，不装全局软件）：

```bash
npm install --prefix "<skill-dir>" --ignore-scripts --no-audit --no-fund
```

## 网页版工作室（直接生成，不走对话）

打开 [`web-studio/index.html`](web-studio/index.html)（双击即可，纯离线、不上传）：

1. 左侧填写标题与内容板块：段落、要点、表格、图片（本地压缩）、演讲备注。
2. 右侧选择 12 种网页风格或 12 种 PPT 基调，实时预览；风格不只是配色——还可调整阅读宽度、排版密度、要点样式、标题字体与封面布局（网页），以及封面结构、标题字体与信息密度（PPT）；下载单文件 `index.html`，或生成原生 `.pptx`（含备注）。
3. 「导出配置」备份全部内容；「导出 presentation.json」放进 `ppt-projects/<slug>/` 后，可交给 `/report-to-pptx` 继续做图表、附件、迭代与审阅。

网页版是快速出稿入口；图表、视频、素材文件夹扫描与审阅流程仍走对话。页面内的 PPT 示意不是 Office 实际渲染，生成文件请用 PowerPoint / WPS 复核。

## 让助手操作的命令

以下命令由助手在交付过程中执行，使用者不需要自己记。`<skill-dir>` 指技能实际安装目录。

```bash
# 网页
python3 "<skill-dir>/scripts/project_tool.py" scan projects/<slug>
python3 "<skill-dir>/scripts/project_tool.py" prepare projects/<slug> --version v001
python3 "<skill-dir>/scripts/validate_html.py" projects/<slug>/dist/v001/index.html --package-root projects/<slug>/dist/v001
python3 "<skill-dir>/scripts/project_tool.py" pack projects/<slug> --version v001
python3 "<skill-dir>/scripts/review.py" register projects/<slug> v001

# PPT
node "<skill-dir>/scripts/build.cjs" init ppt-projects/<slug>
node "<skill-dir>/scripts/build.cjs" build ppt-projects/<slug> v001
python3 "<skill-dir>/scripts/check_pptx.py" ppt-projects/<slug>/dist/v001/<slug>-v001.pptx
python3 "<skill-dir>/scripts/review.py" register ppt-projects/<slug> v001
```

`review.py` 负责登记快照、记录反馈、比较版本与确认定稿，只写项目内 `review/`，不修改成品、配置或原始素材。

## 目录结构

```text
.
├── .qoder/skills/
│   ├── summary-to-html/           # 网页技能
│   │   ├── SKILL.md
│   │   ├── assets/                # 12 风格预览页、项目模板
│   │   ├── references/            # 风格、项目契约、媒体、迭代流程
│   │   └── scripts/               # 素材工具、检查器、审阅工具与测试
│   └── report-to-pptx/            # PPT 技能
│       ├── SKILL.md
│       ├── assets/                # 基调令牌、项目模板
│       ├── references/            # 基调、项目契约、迭代流程
│       ├── package.json           # 仅 PptxGenJS 依赖
│       └── scripts/               # 生成骨架、检查器、审阅工具与测试
├── style-preview.html             # 12 种网页风格交互预览
├── web-studio/                    # 网页版工作室：浏览器内直接生成 H5 与 PPTX
├── projects/my-project/           # 网页项目模板（BRIEF + 配置）
├── ppt-projects/my-report/        # PPT 项目模板 + v001/v002 基调样张
├── examples/media-demo/           # 图片、音频、文本附件示例包（含 ZIP）
└── 使用说明.md                    # 面向使用的完整说明
```

## 主要特性

**网页（summary-to-html）**

- 12 种风格：商务简报、纸感杂志、暗色科技、数据报告、暖色手记、极简演示、极简白纸、学术报告、瑞士网格、作品画廊、蓝图工程、柔彩轻读。
- 长页阅读 / 翻页演示两种形态；手机适配、键盘操作、打印回退、无脚本可读。
- 素材三态：仅供分析、页面内展示、附件下载；相对链接整包可移动。
- 小型 UTF-8 文本附带安全预览，下载原件字节不变。

**PPT（report-to-pptx）**

- 12 种基调，可组合颜色、标题字体、封面结构与分栏样式。
- 原生文字、表格与图表，默认无动画，备注可另存讲稿。
- 有机构模板时优先沿用模板；生成骨架不会忽略模板从零重建。
- 演讲备注、相对附件链接与页数统计。

**共同能力**

- `review.py` 迭代闭环：未处理意见自动带入下一版，交付后手工修改会被识别，定稿需要明确确认记录。
- 上线前静态检查：结构、链接、媒体引用、敏感文件、越界路径与符号链接。

## 运行测试

```bash
python3 -B -m unittest discover -s .qoder/skills/summary-to-html/scripts -p 'test_*.py'
python3 -B -m unittest discover -s .qoder/skills/report-to-pptx/scripts -p 'test_*.py'
npm test --prefix .qoder/skills/report-to-pptx
node web-studio/smoke-test.cjs
```

## 已知限制与待办

见 [TODO.md](TODO.md)。要点：PPT 尚未在 Office 客户端完成渲染验收；视频播放需用真实素材验证；技能当前安装在项目内，尚未全局安装。

## 说明

- 本项目是 Qoder Agent Skill 集合，不是官方产品，依赖 Qoder 技能机制与 Python 3.9+、Node.js 18+（仅 PPT 生成）。
- 仓库不包含任何个人素材、公司文档或私有审阅记录；`.gitignore` 会跳过工作项目中的 `materials/` 与 `review/`。
- 示例中的文案、图表数值均为展示结构的演示内容，不是真实研究或业务数据。
