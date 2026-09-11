---
id: QB-20260911-chinese-homepage-refresh
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# 中文主页与视觉焕新

## Goal
将 QB Trace Web 的会话主页改为紧凑、克制且易扫读的中文界面；保留 `QB Trace`、`Session`、`Payload`、provider、model 和原始事件类型等专有技术表达，并以适度、可访问的动效强化层级与直接反馈。

## Scope
- 本地化 Web 可见界面文案，专有技术内容保持英文。
- 重构会话主页、顶栏和列表视觉层级，保持现有检索、选择、加载和键盘导航行为。
- 为主页增加短暂的入场、交互反馈和列表过渡，并为系统动效/透明度/对比度偏好提供回退。

## Non-goals
- 不修改 HTTP API、记录数据、Session 路由或分析语义。
- 不引入远程字体、图片或新的运行时依赖。

## Requirements
- REQ-001：未选中 Session 时，主页所有通用可见文案使用中文；`QB Trace`、`Session`、`Payload`、provider、model、ID、路径和事件技术值保留英文。
- REQ-002：主页以紧凑的会话总览、可搜索列表和清晰的状态信息呈现 Session，同时保留搜索、打开、加载更多、错误重试及键盘上下导航行为。
- REQ-003：主页交互提供即时按压/悬停反馈和简短、克制的入场/列表动效，只使用 `transform` 与 `opacity` 等低成本属性；不阻塞输入。
- REQ-004：动效与半透明效果必须尊重 `prefers-reduced-motion`、`prefers-reduced-transparency` 与 `prefers-contrast`。

## Behavior Delta
### MODIFIED
- REQ-001：会话主页由英文通用界面文案改为中文，原先的专有技术表达保持英文。
- REQ-002：会话主页由宽松的列表页改为更紧凑、层级更明确的会话浏览界面；既有数据读取与操作路径不变。
- REQ-003：静态主页增加非阻塞的状态与交互动效。

## Acceptance Criteria
- AC-001 [REQ-001]：打开首页时，用户可见的通用标题、搜索提示、状态、空态、错误态和按钮为中文，且 `Session`、`Payload` 等专有词未被翻译。
- AC-002 [REQ-002]：搜索、点击 Session、键盘方向键切换会话项和返回 Session 列表仍可用。
- AC-003 [REQ-003, REQ-004]：主页具有可见但克制的入场/按压/悬停反馈；减少动效偏好下不产生空间位移动画，且透明度与高对比度回退规则存在。

## Implementation
- [x] 更新 Web 主页、会话概览、会话对话与详情的通用可见文案；保留专有技术值。
- [x] 重构主页布局与设计 token，建立紧凑的品牌栏、总览区域、搜索栏和会话列表样式。
- [x] 添加基于 compositor 的短动效及可访问性 media-query 回退。
- [x] 扩充受影响的界面测试并运行类型检查、Web 构建和相关测试。

## AC-to-check mapping
| Acceptance | Check |
| --- | --- |
| AC-001 | React 首页测试断言中文文案与专有词；浏览器检查 |
| AC-002 | 现有 Session workbench 测试覆盖打开与返回，补充中文标签断言 |
| AC-003 | `design.test.ts` 静态检查偏好回退，浏览器检查默认与 reduced-motion 状态 |

## Verification evidence
- AC-001：更新的 React 测试验证中文首页和详情文案；浏览器在模拟 Session 数据下显示中文通用文案，并保留 `Session`、provider、model 与 `Payload`。
- AC-002：`npm test` 通过（16 files / 55 tests），覆盖 Session 选择、返回、搜索相关界面及对话交互；浏览器显示紧凑会话列表。
- AC-003：`npm run typecheck` 通过；`npm test` 中的 Web build 通过。浏览器确认会话行使用 `row-enter` 动画，且样式含 reduced-motion 回退。

## Quality check
目标、范围和非目标明确；每项 REQ 均有 AC 覆盖。此次变更只影响 Web 展示层，现有 API 与会话操作契约不变；不需要额外架构或核心行为测试保护。
