# 执行工作台交付验证

日期：2026-09-11。对应变更：`QB-20260911-execution-workbench`。

## 自动化与真实入口

- `npm run typecheck`：通过，包含 Node/Web 契约与完整埋点示例。
- `npm test`：**19 个测试文件、69 个测试通过**；命令先构建 Web 和独立 Worker。
- `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`、`git diff --check`：通过。
- `npm pack --dry-run --ignore-scripts --json`：确认包含 Web、两个 `.mjs` Worker、协议文档及埋点示例。
- 真实 `pi -ne -e . --mode rpc`：在临时 `QB_TRACE_HOME` 开启采集后发送 `get_state`，返回 success，进程正常退出；schema 1 保存 6 个事件，storage errors=0、dropped events=0。事件包括 Session 起止、resources、metrics 和记录边界。没有发送模型请求或执行工具。
- 独立 Worker 安装测试将生成文件复制到临时 `node_modules` 下实际启动，避免依赖 Node 的 TypeScript 文件剥离能力。

重点保护：独立 Thinking/Text 身份、并行 toolCallId 关联、重复错误去重、未结束/取消状态、数值序号、历史结果隔离、深层内容搜索、prune 后重建、多读者共享索引、真实提交水位、跨 Session 流隔离、鉴权/只读路由、遮蔽/分段阅读、附件限制、collector 重试/关闭和原有 CLI 行为。

## 浏览器验证

使用真实 Chromium 和生产构建，不 mock API。数据为明确标记的合成 QA fixture：初始 908 个事件、228 个操作/边界、24 个 Turn；不是一份真实模型执行记录。

`execution-workbench-v2` 检查表 7 项全部通过并 audit：

1. 执行、对话、事件视图切换；结构导航与时间瀑布。
2. 搜索 bash + 工具 + 失败得到 4 次调用，而不是 8 个重复错误事件。
3. Thinking/Text 分开选择，Shell 输入/输出/exitCode，edit Before/After，关联事件与 Raw。
4. 重载末尾工具深链接，切回前一窗口后 Inspector 仍存在，未依赖卡片 DOM。
5. 16:00:13 的 bash 只有输入，没有未来 FAIL；16× 实际推进 4 秒后，才显示最终失败输出，统计也随历史快照变化。
6. Live 连接后向隔离数据库追加一个真实提交：908→909；出现新记录通知，URL、滚动位置、旧详情未变化，默认不跟随。
7. 键盘调整 Inspector 400→420px；方向键切换详情 Tab；原生 modal 全屏、Escape 和焦点返回；760px/390px 无横向页面溢出；减少动态下全屏动画为 0s。

留存截图：

- [历史回放与类型化详情](evidence/execution-workbench/replay.png)
- [Live 追加且保留分析位置](evidence/execution-workbench/live.png)
- [390px 独立详情 / 减少动态](evidence/execution-workbench/narrow.png)

浏览器验证中发现并修复了全屏焦点隔离、初始时间范围未加载时的控件、历史计数提前使用全程统计，以及初次 Live 连接误报新事件等问题。

## 大规模查询基准

命令：`npm run benchmark:execution`。Linux x64，Node v24.19.0，QEMU Virtual CPU，8 个逻辑 CPU、8GiB 主机内存。单次测量，不是 p95/SLA，也不是浏览器 FPS。

样本：100,684 个混合事件、16.9MiB 原始 Payload、24,694 个操作。

| 路径 | 耗时 |
| --- | ---: |
| 写入样本 | 1.99s |
| 冷索引重建 | 20.04s |
| 100 条普通窗口 | 69.8ms |
| 失败筛选 | 86.8ms |
| 深目标窗口 | 69.6ms |
| 历史快照窗口 | 172.7ms |
| 空闲同步 | 0.1ms |
| 工具 Inspector | 9.9ms |

窗口响应 158,387 bytes（包括有界分组/概览），详情 2,721 bytes。索引分批构建；冷启动需要等待，不应宣传为瞬时加载。浏览器检查的是较小合成 Session；未测 10 万事件下的真实浏览器 p95/FPS 或大量多 MiB 单事件压力。

## 结构与兼容结论

原始 schema-1、payload 留存策略、CLI、loopback 鉴权与旧 v1 API 保留。新 Web 不再消费旧 Conversation/锚定弹窗路径，相关组件及专用格式化 Worker 已移除；兼容查询留在后端，有外部消费者时仍可用。领域解释在 `src/analysis`，SQLite/可重建 sidecar 在 `src/storage`，后台任务在 `src/workers`，HTTP 无 SQL，Web 无文件/数据库能力。

局部规模审查：Workbench 负责单个执行工作区的视图状态与编排，Inspector 负责详情视图，ExecutionIndex 统一拥有同一派生数据库的检查点/历史/查询。它们较大但没有继续吸收 Pi/HTTP/业务职责；未按行数制造额外转发层。后续独立查询模式或复用详情查看器明显增长时重新拆分。目录图已同步；不将本次 Agent 自选的细节自动升级为长期风格偏好。

## 限制与复验

- 只证明公开 hook 和协作埋点；不能证明未埋点 handler 内部、未公开推理或未记录步骤。
- 遮蔽是阅读辅助，不是完整脱敏。原始数据与全文 sidecar 都是敏感数据。
- SSE 是按 Session 作用域的可合并摄入失效水位，不是逐事件可靠消息队列。
- 本次真实运行环境为 Node 24/Linux/Chromium。尝试通过当前 npm 包装器选择 Node 22 时，实际仍解析到 Node 24，故 **未将其计作 Node 22 实机证据**；Node 22/macOS/其他浏览器完整矩阵尚未运行。
- 复验：`npm run build && npm test && npm run typecheck`；`npm run preview:execution` 生成隔离样本；`npm run benchmark:execution` 重跑查询基准。
