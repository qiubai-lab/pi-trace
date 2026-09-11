---
id: QB-20260911-centered-conversation-timeline
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# 居中 Conversation 时间线

## Goal
将 Conversation 重构为居中垂直时间线：事件在时间线两侧交替排列，以固定行数的语义化预览提升扫描密度；点击事件仍以锚定气泡按需加载完整记录。

## Requirements
- REQ-001：Conversation 使用居中、连续的垂直时间线；事件节点与时间戳可辨识，桌面端事件在两侧交替，窄屏保持单侧可读布局。
- REQ-002：用户输入、系统、assistant 和 thinking 事件使用紧凑类型化卡片，仅显示固定前几行预览；点击后保留现有按需加载的完整事件气泡。
- REQ-003：工具调用卡片显示工具方法名、状态，以及输入和结果各自固定行数预览。
- REQ-004：分页、拖动、键盘访问、事件选择、懒加载和减少动效偏好保持可用。

## Behavior Delta
### MODIFIED
- REQ-001：Conversation 由非结构化错位卡片改为居中时间线浏览。
- REQ-002：事件内容由较长卡片正文改为固定行数预览，完整内容继续由点击后的详情气泡提供。
- REQ-003：工具输入与结果改为密集的独立预览区。

## Acceptance Criteria
- AC-001 [REQ-001]：桌面 Conversation 可见居中时间线、节点和两侧交替的事件卡；窄屏无横向溢出。
- AC-002 [REQ-002]：非工具事件只展示固定行数预览；点击事件打开完整记录气泡。
- AC-003 [REQ-003]：工具事件显示方法名、状态、输入和结果预览，且每部分行数受限。
- AC-004 [REQ-004]：现有 Conversation 测试的选择、关闭焦点恢复、分页和拖动画布行为继续通过。

## Implementation
- [x] 重组 Conversation 行标记为时间线、节点与左右事件卡。
- [x] 添加密度优先的预览组件和响应式时间线样式。
- [x] 更新 Conversation 测试并执行受影响测试、构建、类型检查与浏览器验证。

## Verification evidence
- AC-001：浏览器桌面视图确认居中时间线、节点与左右交替卡片；390px 视图为无横向溢出的单侧轨道布局。
- AC-002：浏览器确认非工具预览的 `webkitLineClamp` 为 3，并验证点击用户事件可打开完整事件详情气泡。
- AC-003：浏览器确认工具卡展示 `read`、完成状态和各自三行受限的输入/结果预览。
- AC-004：`npm test` 通过（16 files / 55 tests），包含 Conversation 拖动、自动分页、选择、详情关闭与焦点恢复；`npm run typecheck` 通过，且测试前 Web build 成功。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001, AC-003 | 浏览器桌面与窄屏检查 |
| AC-002, AC-004 | Conversation React 测试与浏览器气泡检查 |

## Quality check
变更限于 Web Conversation 展示层；投影、cursor 数据读取和详情按需加载 API 均不变。