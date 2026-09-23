# 可执行的交付审阅与迭代

此流程由助手操作；用户继续用自然语言反馈，不要求用户填写表格或运行命令。`review.py` 是记录与保护工具，不会自动理解评论、修改内容或代替用户同意。

## 日常闭环

1. 生成并验证实际成品，更新与成品对应的工作配置。
2. `register` 登记本版，冻结配置、文件指纹和基础内容统计。初始状态为 `awaiting_feedback`。
3. 交付文件和内容概况，主动问是否有遗漏、过多或过少，等待用户反馈。
4. 对每条反馈执行 `feedback`，保留范围和“不许改”的要求；多个问题分条记录。
5. 改前运行 `status`，检查手工改动；按 `next_version` 建立新版本，不覆盖旧文件。
6. 修改配置及内容，完成检查后 `register --base ... --change ...`；未处理意见自动继承，不会自动清空。
7. 逐条核实后 `resolve`，说明在哪一版如何处理；给用户看差异和新版，再收反馈。
8. 用户明确接受后才 `state ... accepted --confirmation ...`。如果仍有 open 反馈，先处理或根据用户原话明确撤回。

## 基本命令

`<skill-dir>` 使用本 Skill 安装目录，`<project>` 使用用户指定的项目。HTML 项目读取 `project.json`；PPT 项目读取 `presentation.json`，必须使用对应 Skill 内的脚本。

```bash
python3 "<skill-dir>/scripts/review.py" status "<project>"
python3 "<skill-dir>/scripts/review.py" register "<project>" v001
python3 "<skill-dir>/scripts/review.py" feedback "<project>" v001 --kind missing --scope "method" --text "方法部分缺少解释" --keep "结论和配色不改"
```

`register` 的默认入口是 `dist/v001/index.html` 或 `dist/v001/<slug>-v001.pptx`；非标准文件名通过 `--artifact "文件名.pptx"` 指定，相对于版本目录，不能指向材料或项目外部。预览样张不登记为内容初稿。

缺素材时先把已有意见记为待办，再标记阻塞：

```bash
python3 "<skill-dir>/scripts/review.py" state "<project>" v001 blocked_on_materials --note "缺少对照实验原始数据，已向用户询问"
```

完成定向修改后：

```bash
python3 "<skill-dir>/scripts/review.py" register "<project>" v002 --base v001 --change "补充方法解释；结论和配色保持不变"
python3 "<skill-dir>/scripts/review.py" resolve "<project>" v002 v001-f001 --note "已在 method 章节补充步骤并核对原材料"
python3 "<skill-dir>/scripts/review.py" diff "<project>" v001 v002
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 accepted --confirmation "这版可以定稿"
```

反馈 ID 以工具实际返回值为准；上面的 `v001-f001` 仅是示例。不能为通过工具校验而捏造用户确认；`--confirmation` 必须对应真实对话。工具只能要求非空确认记录，不能验证发言者身份或判断原话是否真的代表同意，这仍由助手负责。

## 反馈分类

| kind | 含义 | 编辑时要分清 |
| --- | --- | --- |
| missing | 遗漏、需补充 | 已有材料漏用，还是需补交新材料 |
| too_much | 内容太多 | 主线过长、重复，还是单页密度高 |
| too_little | 内容太少 | 缺解释、证据还是案例，不靠空话凑量 |
| focus | 重点不对 | 回到受众目标和评价标准 |
| layout | 排版/基调问题 | 是否仅改视觉，不动事实 |
| accuracy | 内容错误 | 核查来源、数值、术语和口径 |
| media | 图片/视频/附件问题 | 核查真实文件和播放/打开方式 |
| other | 其他 | 记录具体范围和预期 |

`scope` 优先采用稳定章节/页面 ID，并补充标题；自然语言范围不会被程序自动映射到页码。`keep` 记录必须保留的内容，助手需在修改后逐项复核，程序不保证语义上未改变。

## 状态与回退

- `awaiting_feedback`：版本已交付，等用户审阅，不等于所有历史问题已解决。
- `revising`：收到修改意见或已恢复修改。
- `blocked_on_materials`：等待具体资料；待办继续保留。
- `accepted`：用户明确接受，且无 open 反馈、当前文件与配置都匹配登记快照。
- `paused`：用户暂缓，不是定稿。
- `delivered_without_review`：用户要求直接交付不再询问；需保存真实要求，不等于已验收。

```bash
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 paused --note "用户说先暂停"
python3 "<skill-dir>/scripts/review.py" state "<project>" v002 awaiting_feedback --note "用户恢复审阅"
python3 "<skill-dir>/scripts/review.py" resolve "<project>" v002 v001-f001 --waive --note "用户决定暂不补充" --confirmation "这一项不用补了，保持原样"
```

撤回是 waived，不伪装成 resolved。原版本尚未生成修订文件时只能明确撤回，不能声称修改已完成。接受后收到新反馈会重新进入 revising，原确认事件仍留在历史中。

## 差异与手工修改保护

- `status` 只读，不会生成空记录；返回待办、实际统计、下一版建议及 `artifact_drift`。
- `next_version` 同时避开已登记版本和 dist 内已存在的版本，包括未完成的目录；只是建议，不预占目录。
- 文件指纹覆盖当前版本目录（包含附件与备注，不含 Finder 的 `.DS_Store`）。缺失、新增或改变都会被识别。
- 若交付后用户改了文件，`effective_status` 为 `modified_after_review`；以前的 accepted 仅是原快照的历史状态，不再代表当前文件。
- 不自动回滚或覆盖手工修改。先比对、合并到新版本，再登记时附 `--reconcile-note "已核对并保留哪些手工改动"`。此说明是人工复核记录，不是自动合并功能。
- `diff` 比较登记时的配置及文件快照：新增、删除、修改、顺序变化，和 HTML 章节数/PPT 实际页数、静态字符数变化。配置未写明的章节内容不能推断为已完整比较。
- 字符数不等于字数、信息量或时长；HTML 统计还可能包含导航与隐藏文本。不能据此宣称“刚好讲 15 分钟”或质量提高。

## 存储与安全边界

状态存放在 `review/history.json`，标识为 `content-review/v1`。每版记录含 `version/base_version/status/artifact/files/stats/config_snapshot/changes/feedback/events/confirmation`；配置快照与历史一起原子写入，避免两个文件更新不同步。不再要求另写 `<version>-config.json`；旧手工快照保留，不删除、不强制迁移。

只写 review，不改原件、工作配置或成品；也不会自动创建 PPT/HTML、抓取网址或执行素材。首次读取旧格式记录时停止并提示人工迁移，不能覆盖。默认限制 JSON 配置 1 MiB、历史 32 MiB，交付目录 4100 项/12 层/4 GiB；超限报错，不静默截断。

写入使用独占 `write.lock` 和临时文件原子替换。并发写入直接报错；异常退出留下锁时先确认没有活跃操作，再由用户确认后处理锁，不自动抢锁。指纹用于发现变化，不是成品备份；请继续保留旧版本和原件。

登记只复用对应 Skill 的静态检查器检查入口产物，不替代全包检查、Office 渲染、真实媒体播放或用户内容验收。`rendered=false` 不应凭空改成 true。审阅记录可能包含私密反馈和配置，不进入 dist 或分享 ZIP。
