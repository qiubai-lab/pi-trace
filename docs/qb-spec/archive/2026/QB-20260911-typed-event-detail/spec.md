---
id: QB-20260911-typed-event-detail
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# 类型化事件详情弹窗

## Goal
以事件语义组件替代统一 JSON 首屏，使用户输入、系统上下文、思考、assistant 输出和工具调用可快速阅读；始终保留原始 Payload 和通用 fallback 以保证记录可审计。

## Requirements
- REQ-001：默认结构化详情按事件类型渲染输入、输出、思考、系统上下文和工具调用，而不是直接显示格式化 JSON。
- REQ-002：工具详情显示方法名、状态、输入和结果；错误状态优先可见。
- REQ-003：结构化解析不完整、未知事件或无效 JSON 时，安全回退到可阅读的通用内容/格式化 JSON；`原始内容`始终可切换。
- REQ-004：保留现有按需请求、锚定弹窗、关闭、键盘焦点恢复和大 Payload worker 格式化行为。

## Behavior Delta
### MODIFIED
- REQ-001：事件详情默认视图从统一 JSON 阅读器改为事件类型化摘要组件。

## Acceptance Criteria
- AC-001 [REQ-001]：用户、系统、thinking、assistant 与工具事件在结构化视图中显示语义化标题和正文。
- AC-002 [REQ-002]：工具结果详情显示工具名、状态、输入和结果区域。
- AC-003 [REQ-003]：无效 JSON 与未知事件仍显示通用内容，且原始内容切换完整保留 Payload。
- AC-004 [REQ-004]：现有详情弹窗加载、关闭与完整原始大 Payload 测试通过。

## Implementation
- [x] 添加纯前端事件详情解析模型与安全 fallback。
- [x] 重构 EventDetail 默认视图为语义化详情组件，保留元数据和 Raw。
- [x] 更新测试，执行受影响测试、构建、类型检查和浏览器验证。

## Verification evidence
- AC-001、AC-002：浏览器验证工具结果弹窗显示 `read`、已完成状态与独立结果区；EventDetail 测试验证用户输入与工具详情。
- AC-003：浏览器验证“原始内容”切换仍显示完整 Payload；测试验证无效 JSON fallback。
- AC-004：`npm test` 通过（16 files / 56 tests），包括现有详情弹窗关闭与大 Payload 原始内容覆盖；`npm run typecheck` 通过，且测试前 Web build 成功。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001, AC-002, AC-003 | EventDetail 单元测试与浏览器各类型检查 |
| AC-004 | 既有详情弹窗测试、构建与类型检查 |

## Quality check
前端解析仅用于展示，不改变原始记录或 API 契约；无法识别的输入保持可访问的 fallback。