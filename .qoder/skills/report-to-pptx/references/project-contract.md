# PPT 项目与交付契约

## 目录和命名

```text
ppt-projects/my-report/
├── BRIEF.txt                       # 自然语言需求
├── presentation.json               # 助手代填的页面内容与样式
├── materials/
│   ├── docs/                       # 论文、报告、大纲
│   ├── templates/                  # 学校或公司的 PPT 模板
│   ├── images/                     # 图片、图表截图、视频封面
│   ├── data/                       # 图表的原始数据
│   ├── videos/                     # 演示视频
│   └── files/                      # 要分享的附件
├── preview/v001/tone-preview.pptx   # 真实基调样张
├── review/history.json             # 反馈、配置快照与文件指纹；不对外分享
└── dist/v001/
    ├── my-report-v001.pptx          # 可编辑成品
    ├── speaker-notes.txt            # 若启用备注，另存逐页讲述内容
    ├── build-report.json            # 页数、基调、附件清单和验收状态
    └── assets/                     # 同包外部附件，不是已嵌入图片
```

- 项目 slug 和页面 id 使用 1–48 位小写英文字母、数字、连字符，首尾为字母/数字。显示标题支持中文。
- 原件可以保留中文、空格、括号；建议 `img-01-method-v01.png`、`doc-01-thesis-v03.pdf`，但不强制批量改名。
- 生成版本为 `v001`～`v999`；预览与正式版各自版本化。目录存在时拒绝覆盖，用户显式要求编辑现有成品时另走版本副本流程。
- 外部附件复制成 `assets/file-<内容摘要>.扩展名`。相同内容可共用副本，不包含用户名或本机绝对路径。
- 分享时发送完整 `dist/v001` 文件夹或手动压缩为 ZIP；只在没有外部附件时才可以只发送 PPTX。该骨架不自动发布或上传。

## 配置

JSON 使用 UTF-8，最大 1 MiB；正文不作为代码执行。自然语言要求优先由助手理解再填配置。

| 字段 | 说明 |
| --- | --- |
| schema_version | 固定 1 |
| slug / title | 文件标识 / 中文题目 |
| purpose / audience | 任意用途与受众，非固定场景枚举 |
| duration_minutes | 正数或 null，仅用于编辑时规划节奏 |
| presenter | 用户提供的署名，可空，不编造人员信息 |
| tone | ask / 12 种基调 ID（见 tone-presets.md）/ custom |
| tone_notes | 自定义语言基调、信息密度等；由助手落实，不是生成器自动理解的文本 |
| custom_tone | 覆盖配色、正文与标题字体、coverLayout、panelStyle，字段见基调规范 |
| aspect_ratio | 16:9 或 4:3；其他比例需扩展布局 |
| template | 无模板为 null；有模板时是给助手的路径提示，骨架拒绝忽略模板并要求改走编辑流程 |
| speaker_notes | 默认 true；开启时每页必须填写 notes |
| slides | 有序页面清单；正式生成要求 1–200 页 |

每页共同字段：`id/layout/title`，可选 `subtitle/notes/source/links`。标题最多 56 字符；超过时先编辑或拆页，不会自动截断。`source` 是页脚短引用，完整来源可在备注中展开。

| layout | 附加字段 | 骨架边界 |
| --- | --- | --- |
| cover / section / closing | 使用 title / subtitle | 原生标题、说明和署名 |
| points | points 字符串数组 | 最多 4 项，每项最多 64 字符 |
| two-column | columns 数组，两项各含 title / points | 每栏最多 3 项，保持正文可读 |
| image | image / caption / points | PNG/JPEG 嵌入，保留比例；caption 必填 |
| table | table.headers / table.rows | 最多 5 列、5 行正文，原生表格；source 必填 |
| chart | chart.kind / categories / series / unit | 原生 bar/line，最多 8 分类、3 序列；source 与单位必填 |

以上是随附骨架的容量约束，不是用户能力上限。自定义排版、流程图、更多数据或模板复制，助手可以扩展生成代码；不能丢掉不支持字段假装已经处理。

页面示例：

```json
{
  "id": "method",
  "layout": "two-column",
  "title": "方案从问题和验证两个层面展开",
  "columns": [
    { "title": "问题侧", "points": ["填写实际问题", "填写约束与现有证据"] },
    { "title": "验证侧", "points": ["填写实际方法", "填写验证设计与边界"] }
  ],
  "notes": "这一页先解释问题，再说明验证策略；这些示例文字需用真实材料替换。",
  "source": "填写真实材料出处"
}
```

图表格式：

```json
{
  "kind": "bar",
  "categories": ["方案 A", "方案 B"],
  "series": [{ "name": "示例序列", "values": [1, 2] }],
  "unit": "示例单位"
}
```

图表数值仅展示配置结构，成品不能把它们当作真实结果；正式数据必须来自用户材料。单位与来源不能省略。

## 本地图片、视频和附件

图片示例：`"image": "materials/images/方法 图.png"`。配置保存原始路径，不先 URL 编码。执行前校验材料目录边界、文件存在性、扩展名和符号链接；不读取网络图片 URL。

每页 `links` 最多两项，二选一：

```json
[
  { "label": "完整论文", "file": "materials/files/论文原稿.pdf" },
  { "label": "项目主页（联网）", "url": "https://example.org/project" }
]
```

- `file` 会复制到同包 assets 并建立相对超链接。图片嵌入不需要同名外部副本。
- 视频采用图文页放封面 + file 链接。该行为是链接播放，不是视频内嵌；要内嵌时使用专项 Office 媒体能力并验证兼容性。
- 单附件最多 128 MiB，附件合计最多 256 MiB；更大时协商拆包。只处理用户确认分享的材料。
- 只允许常见文档、数据、图片、视频、音频和 ZIP；不执行 `.exe/.sh/.js` 等，不把 HTML/SVG 的活动内容直接放入交付。
- HTTP(S) 外链允许存在，但不自动抓取。不得包含用户名、密码或用户未授权的签名凭证。
- PowerPoint/WPS/Keynote 的外部链接行为因环境而异，可能弹安全提示；不能保证浏览器式一键内览。

## 命令与结果

```bash
node "<skill-dir>/scripts/build.cjs" init "ppt-projects/my-report"
node "<skill-dir>/scripts/build.cjs" preview "ppt-projects/my-report" v001
node "<skill-dir>/scripts/build.cjs" build "ppt-projects/my-report" v001
python3 "<skill-dir>/scripts/check_pptx.py" "ppt-projects/my-report/dist/v001/my-report-v001.pptx"
```

- `init` 只建立新目录和空配置，不会编造汇报。
- `preview` 优先用已填写内容的前 3 页，没内容时用清楚标记的演示文案；十二种基调各一组，默认共 36 页。
- `build` 要求基调已选择，内容已填写；不接受 `tone=ask`。设置模板后停止并指向模板流程。
- 生成器先完成校验和内存生成，再创建新版本。IO 错误可能留下未完成目录，要明确检查，不覆盖重试。
- `build-report.json` 中 `rendered=false` 表示生成器未做 Office 渲染，不能将其改成 true 来代替真正验收。
- 检查器只读 PPTX，不解压到任意目录，不执行文件；检查关系完整性、对象边界、原生文字、备注、外链与同包附件。

## 最后验收

模板一致性、标题与数据忠实度、原生编辑性、字体、投影阅读、所有页面的裁切/遮挡，以及备注和真实媒体播放都需要分别检查。缺少渲染环境时如实交付结构检查结果，后续在目标 Office 中验证，不能宣称已经逐页打开。
