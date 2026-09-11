---
id: QB-20260911-compact-conversation-context
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# 紧凑对话上下文条

## Goal
移除 Conversation 页面中独立的“当前 Session”概览和“对话记录”标题组件，将必要的身份、统计与实时控制合并为单一薄条，给对话内容更多可视空间。

## Requirements
- REQ-001：已选择 Session 时，只显示一个紧凑的上下文薄条；不再显示独立的 Session 概览区或对话标题区。
- REQ-002：薄条保留当前 Session 的可识别路径、关键事件统计和实时更新开关，且不改变返回、实时更新或 Conversation 选择行为。
- REQ-003：薄条适应窄视口，优先保留路径和操作，隐藏非关键统计而不产生横向溢出。

## Behavior Delta
### MODIFIED
- REQ-001：Conversation 页面由两个信息区改为单一薄条。

## Acceptance Criteria
- AC-001 [REQ-001]：选择 Session 后，页面只出现一个包含上下文的薄条，不显示“当前 Session”或“对话记录”标题内容。
- AC-002 [REQ-002]：薄条显示 Session 路径、至少事件数和实时更新控制；现有返回与实时更新操作继续有效。
- AC-003 [REQ-003]：窄视口下薄条不发生横向溢出，非关键统计按优先级隐藏。

## Implementation
- [x] 将 SessionOverview 与 Conversation toolbar 合并为单一紧凑组件。
- [x] 更新 Conversation 页面样式与响应式规则。
- [x] 更新界面测试，运行受影响测试、构建和类型检查。

## Verification evidence
- AC-001：浏览器确认单一上下文条高度为 48px，且旧的 Session 概览与对话标题均不再出现。
- AC-002：`npm test` 通过（16 files / 55 tests）；Session workbench 测试验证路径、事件统计和实时控制；浏览器确认上下文条可见这些内容。
- AC-003：浏览器在 390px 视口下确认上下文条 `scrollWidth` 与 `clientWidth` 均为 390px；非关键内容已隐藏。`npm run typecheck` 通过，且测试前 Web build 通过。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001, AC-002 | React Session workbench 测试与浏览器检查 |
| AC-003 | CSS 响应式规则与浏览器窄视口检查 |

## Quality check
范围局限于 Web 展示层；Session 数据查询与交互契约保持不变。每项需求均有可观察验收。