---
id: QB-20260911-conversation-infinite-scroll
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# Conversation 无限滚动与极简滚动条

## Goal
移除 Conversation 底部的“继续载入后续上下文”按钮；在用户滚动接近已载入内容尾端时自动请求下一页，并将滚动条改为无轨道背景的低干扰细滚动条。

## Requirements
- REQ-001：Conversation 有下一页时不显示底部载入按钮；滚动接近尾端时仅在未请求状态下自动载入下一页。
- REQ-002：自动载入保留已有 cursor 分页、合并和虚拟化行为，不重复并发请求或改变事件选择行为。
- REQ-003：Conversation 滚动条无可见轨道背景，保留可辨识、可操作的细滑块和高对比度可访问性。

## Behavior Delta
### MODIFIED
- REQ-001：分页由显式底部按钮改为接近内容尾端时的自动加载。
- REQ-003：Conversation 滚动条由浏览器默认轨道改为透明轨道与自定义滑块。

## Acceptance Criteria
- AC-001 [REQ-001, REQ-002]：滚动接近尾端后自动请求下一页，且页面没有“继续载入后续上下文”按钮。
- AC-002 [REQ-003]：Conversation 滚动条轨道透明，滑块可见；高对比度模式有明确滑块颜色。

## Implementation
- [x] 将分页触发接入 Conversation 滚动位置并移除底部按钮。
- [x] 更新 Conversation 滚动条样式与高对比度回退。
- [x] 更新交互测试并运行受影响测试、构建和类型检查。

## Verification evidence
- AC-001：`npm test` 通过（16 files / 55 tests），Conversation 测试模拟滚动接近尾端并断言下一页合并，且不再出现底部按钮。浏览器也确认滚动后出现下一页内容、按钮计数为零。
- AC-002：浏览器计算样式确认 WebKit 轨道为透明、滑块可见；Firefox `scrollbar-color` 使用透明轨道。CSS 高对比度规则显式覆盖滑块颜色。
- `npm run typecheck` 通过，且测试前 Web build 通过。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001 | Conversation React 测试与浏览器滚动检查 |
| AC-002 | CSS 规则与浏览器样式检查 |

## Quality check
改动只影响 Web 查询触发和展示；cursor API、事件选择与 Conversation 数据投影保持不变。