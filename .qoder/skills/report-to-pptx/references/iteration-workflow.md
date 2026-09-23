# PPT 初稿后的可执行迭代

由助手操作 `scripts/review.py`，用户继续用自然语言反馈。它只管理版本、待办、差异和确认，不会自动修改 PPT，也不能代替用户验收。

## 交付闭环

1. 生成并验证实际 PPTX，工作 `presentation.json` 要与这一版对应。
2. 使用 `register` 登记初稿，记录配置快照、版本目录文件指纹、实际 PPT 页数和原生静态文本字符数。
3. 先交付 PPTX，再问遗漏、篇幅和重点；用户有意见时分条 `feedback`，保留对应页的稳定 ID/标题及不要改的内容。
4. 改前 `status` 检查是否有手工修改、哪些反馈未处理、下一版编号；必要时先合并手工修改。
5. 修改后生成新版本，`register --base ... --change ...`；历史 open 意见会继承到新版，不会因为重新生成而消失。
6. 逐条核对后 `resolve`，向用户交付新版与差异，再邀请反馈。
7. 只有用户明确同意且没有 open 意见时才记录 accepted。没有回复就是待反馈，不循环生成或催问。

## 命令示例

下面的 `<skill-dir>`、`<project>` 替换为实际目录。反馈 ID 必须用工具返回值，示例 `v001-f001` 不是可随意假定的 ID。

```bash
python3 "<skill-dir>/scripts/review.py" status "<project>"
python3 "<skill-dir>/scripts/review.py" register "<project>" v001
python3 "<skill-dir>/scripts/review.py" feedback "<project>" v001 --kind too_much --scope "background" --text "背景太长，方法解释不足" --keep "结果页和配色不动"
```

一条反馈含多个独立问题时可以拆分登记，例如背景太长与方法不足分别登记为 `too_much`、`missing`。适用分类还有 `too_little/focus/layout/accuracy/media/other`。

默认入口是 `dist/v001/<slug>-v001.pptx`。已有自定义文件名使用 `--artifact "答辩稿.pptx"` 指定，相对于版本目录，不允许指向项目外部。基调预览不作为内容初稿登记。

```bash
python3 "<skill-dir>/scripts/review.py" register "<project>" v002 --base v001 --change "精简背景，补方法解释，结果页与配色保留"
python3 "<skill-dir>/scripts/review.py" resolve "<project>" v002 v001-f001 --note "已合并重复背景并核对备注"
python3 "<skill-dir>/scripts/review.py" diff "<project>" v001 v002
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 accepted --confirmation "这版可以定稿"
```

`--confirmation` 必须记录真实用户原话。程序只能要求非空记录，不能识别发言者、判断语义或证明用户真的同意，助手不得为通过校验伪造确认。

## 修改范围与版本保护

- `scope` 用页面稳定 ID 和标题，不能只靠插页前的旧页码。自然语言范围不是自动定位指令。
- `keep` 记录必须保留的内容；助手需要实际检查结果，不能以已记录就声称语义未改变。
- 只允许对最新登记版本追加反馈或改状态，避免旧版本分叉导致意见丢失。旧版反馈需先确认在新版是否仍成立，再登记到新版。
- 新版必须显式提供最新版本 `--base` 及至少一条 `--change`；旧配置快照和旧文件指纹不覆盖。
- `next_version` 同时避开 dist 中已有目录和已登记版本，包含未完成目录；仅给建议，不预占版本。
- 指纹覆盖 PPTX、备注和附件等整个版本目录，不跟随符号链接，忽略 Finder `.DS_Store`。不是成品备份，仍须保留旧版和原件。
- 交付后文件发生变化时，`status` 返回 `effective_status=modified_after_review`；历史 accepted 只代表登记时的文件，不能代表手改后的文件。
- 遇到手改，先比对、合并到新版本，再登记 `--reconcile-note "已对照用户手改版保留哪些内容"`。工具不自动合并，不覆盖手改，不把填了说明视为自动验证。

## 待办与状态

反馈状态为 `open/resolved/waived`，新版默认继承全部历史意见。resolved 是助手已处理、等待用户审阅；不是用户已确认。原版没有修订产物时不能标记 resolved，只能有明确原话的 waived。

```bash
python3 "<skill-dir>/scripts/review.py" state "<project>" v001 blocked_on_materials --note "需要用户补交实际对照数据"
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 paused --note "用户说先暂停"
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 awaiting_feedback --note "用户恢复审阅"
python3 "<skill-dir>/scripts/review.py" resolve "<project>" v002 v001-f001 --waive --note "用户决定暂不修改" --confirmation "这项不用改了"
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 delivered_without_review --note "按用户要求" --confirmation "直接交付，不用再问"
```

accepted 只能从 awaiting_feedback 进入，且无 open 意见、成品与工作配置都匹配快照。paused、blocked_on_materials、delivered_without_review 都不是定稿；accepted 后收到新意见会重新进入 revising，旧确认事件保留。

## 差异报告的边界

`diff` 对比冻结快照，不用当前可能已改的文件代替历史事实：

- 配置页面新增、删去、内容字段变化与重排；没有配置的模板页不推断为已完整比较。
- 文件新增、删去和 SHA256 变化；附件和备注变化也可发现。
- 实际 PPT 页数、原生静态文字字符数；并非截图内的文字，不等于信息量或讲述时长。

需要先人工读真实页内容，才能判断“太多/太少是否解决”。没有实际渲染，不会把 `rendered=false` 变成 true，也不沿用旧版视觉验收。

## 存储与异常

仅写 `review/history.json`，格式为 `content-review/v1`；记录版本、基线、状态、产物、文件指纹、统计、`config_snapshot`、变更、反馈、事件和确认。配置快照与历史在同一份 JSON 中原子更新，不再要求额外写 `<version>-config.json`；已有手工记录和快照原样保留，遇到不兼容格式会停止并要求人工迁移。

不修改工作配置、原件、成品，也不执行素材或联网。只复用本 Skill 的静态检查器检查 PPTX，不替代全包检查、Office 渲染和媒体播放验收。审阅记录可能含内部意见，不放入 dist 或分享包。

JSON 配置最大 1 MiB，历史最大 32 MiB，扫描交付目录最多 4100 项/12 层/4 GiB。超限停止。并发写入由 `write.lock` 阻止，临时文件原子替换保证旧记录完整；异常退出留下锁时先确认无活跃操作，再经用户确认处理，不自动抢锁。

两个 Skill 各自携带相同审阅工具，分别调用本地 HTML 或 PPT 检查器，因此可以独立安装，不依赖另一 Skill 目录。
