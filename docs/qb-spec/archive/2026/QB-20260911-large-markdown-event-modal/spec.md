---
id: QB-20260911-large-markdown-event-modal
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# 大型 Markdown 事件审阅弹窗

## Goal
将时间线事件详情改为居中、大尺寸审阅弹窗；为 prompt、input、response 及工具内容提供安全的 Markdown 渲染与单独文本原文视图，提升长内容审阅体验。

## Requirements
- REQ-001：由时间线打开的事件详情在视口居中显示为足够大的模态弹窗，而非锚定的小气泡。
- REQ-002：用户输入、assistant 输出、系统上下文、thinking 和工具输入/结果默认以安全 Markdown 渲染；代码块、列表、标题和链接保持可读。
- REQ-003：每个语义内容块可单独切换 Markdown 渲染与文本原文；整个事件仍保留原始 Payload 视图。
- REQ-004：关闭、Escape、焦点恢复、按需请求、大 Payload fallback、减少动效和窄屏可用性保持有效。

## Behavior Delta
### MODIFIED
- REQ-001：事件详情从锚定小气泡变为居中审阅模态。
- REQ-002：文本内容从等宽纯文本默认显示改为 Markdown 审阅视图，并增加块级文本原文切换。

## Acceptance Criteria
- AC-001 [REQ-001]：点击事件后弹窗居中，具有审阅级宽高且背景被适度弱化。
- AC-002 [REQ-002, REQ-003]：Markdown 标题、列表和代码块被渲染；每个内容块可切换“文本原文”，原始 Payload 仍可打开。
- AC-003 [REQ-004]：关闭、Escape、焦点恢复、无效 JSON fallback 及窄屏布局测试通过。

## Implementation
- [ ] 添加本地 Markdown 渲染依赖与块级显示模式。
- [ ] 将事件详情弹窗改为居中审阅模态并重设样式。
- [ ] 更新测试并执行受影响测试、构建、类型检查和浏览器验证。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001, AC-002 | EventDetail 测试与浏览器模态检查 |
| AC-003 | 现有关闭/焦点测试、无效 JSON 测试、窄屏浏览器检查 |

## Quality check
Markdown 仅渲染本地已记录文本，不启用原始 HTML；原始 Payload 作为审计 fallback 始终保留。