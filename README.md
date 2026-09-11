# pi-trace

`@qiubai-lab/pi-trace` 是独立的 Pi 本地执行追踪 package。它默认关闭；开启后监听 Pi 公共扩展 API 暴露的 Session、Agent、Turn、Provider、消息、thinking、工具、compaction 和 tree 生命周期，并把完整可观察 payload 追加到一个 SQLite WAL 数据库。

采集不依赖 Web Server，不注册 Pi Slash Command。`qb-trace server` 提供可选的本机个人只读 HTTP API、实时事件流和 Web UI；Server 不参与采集或原始事件写入，仅维护可丢弃、可重建的执行索引。

## 要求

- Linux 或 macOS
- Node.js 22.19 或更新版本
- `~/.local/bin` 已加入 `PATH`

## 安装 Pi package

从 GitHub 安装到个人 Pi 配置：

```sh
pi install https://github.com/qiubai-lab/pi-trace.git
pi list
```

本地开发安装：

```sh
pi install /root/projects/pi-trace
```

也可以不修改设置，仅加载当前工作区：

```sh
pi -ne -e /root/projects/pi-trace
```

## 安装独立命令

进入 `pi list` 显示的实际 package 目录，然后执行：

```sh
npm run install:cli
```

脚本创建以下用户级链接：

```text
~/.local/bin/qb-trace -> <pi-trace-package-root>/bin/qb-trace
```

重复执行是幂等的。脚本只会覆盖自己已有的链接，或迁移旧版 `*/pi-plugins/bin/qb-trace` 链接；其他文件和符号链接一律拒绝覆盖。

开发仓库中也可以直接运行：

```sh
./bin/qb-trace status
```

## 从 pi-plugins 迁移

1. 关闭所有正在运行的 Pi 实例，避免旧、新扩展同时加载并产生重复事件。
2. 更新或移除包含旧 QB Trace 的 `pi-plugins` 安装。
3. 单独安装 `pi-trace`：`pi install https://github.com/qiubai-lab/pi-trace.git`。
4. 在新 package 目录执行 `npm run install:cli`；安装器会安全地迁移原 `pi-plugins` CLI 链接。
5. 运行 `qb-trace status`，确认原开关、数据库、schema 和事件数量仍可读取。
6. 启动 Pi。原 Trace 数据无需复制或重建。

迁移不会修改或删除 `~/.pi/agent/qb-trace/`。如果旧 package 仍配置为加载 QB Trace，请不要同时启动新 package。

## 使用

```sh
qb-trace on       # 开启所有已加载 pi-trace 的当前及后续 Pi 实例
qb-trace off      # 停止新增事件，不删除历史数据
qb-trace status   # 显示路径、schema、大小、事件数、错误和数据缺口
qb-trace prune --older-than 30d --dry-run  # 预览删除范围
qb-trace prune --older-than 30d            # 删除 30 天前的事件
qb-trace prune --all                       # 删除全部事件并回收磁盘空间
qb-trace server                    # 启动本机只读 Web 服务
qb-trace server --port 8123 --open # 指定端口并打开浏览器
```

运行中的 Pi 实例会在两秒内感知 `on/off`，无需 reload。Pi 的 TUI footer 会以独立状态行显示类似 `● trace on · 3,438 events · 49.5 MB` 的全局事件数量和实际 SQLite 占用；统计最多每五秒刷新，其他运行模式不显示该提示。独立 CLI 不要求 Pi 或 Server 正在运行。

### 手动清理

`prune` 必须明确指定 `--older-than <Nh|Nd>` 或 `--all`，二者不能同时使用。`--dry-run` 只报告匹配事件、payload 大小和剩余数量，不改变 recording。实际 prune 如果发现 recording 为开启，会自动暂时关闭，等待运行实例停止接收并刷新队列，删除和压缩完成后再恢复开启；无需手工执行 `qb-trace off/on`。如果等待期间其他进程或用户显式更改了 recording 状态，prune 不会覆盖该决定，并会报告最终保留的状态。

Prune 只删除 `trace_events`，不会删除 `recording_controls`、`config.json` 或 `diagnostics/`。自动暂停和恢复会以 `qb-trace-cli:prune` 来源写入开关审计。删除在一个事务内完成；每次实际 prune 成功后都会默认 checkpoint WAL 并执行 `VACUUM` 以缩小主文件。旧脚本中的 `--vacuum` 仍兼容，但不再是启用压缩的必要条件。`VACUUM` 需要额外临时磁盘和独占访问。如果删除已经提交但压缩失败，命令会明确报告部分成功并返回非零状态，同时仍会尝试恢复原 recording 状态；此时不要在未检查范围的情况下重复执行更宽泛的 prune。

### 本机 Web 服务

```sh
qb-trace server [--host 127.0.0.1] [--port 7432] [--open]
```

Server 只允许 `127.0.0.1`、`localhost` 或 `::1`，启动时生成临时 Bearer Token，并打印形如 `http://127.0.0.1:7432/#token=...` 的 URL。Token 位于 URL fragment，不会发送给 HTTP Server；页面将其移入当前标签页的 session storage。关闭 Server 后 Token 失效。

Web UI 是 React 执行分析工作台，而不是仅展示聊天记录：

- **执行 / 对话 / 事件**三视图共享选择。默认展示 Run/Turn 导航、操作列表、同步时间瀑布和全局活动概览。点活动区间或 Turn 可缩小时间尺度。
- **搜索与定位**：按工具、路径、来源及关联内容搜索；筛选操作类型、失败和不完整状态。默认每窗 100 条，DOM 虚拟化；结构导航最多展示 500 个分组，超出部分仍可通过搜索、窗口和深链接定位。
- **常驻 Inspector**：按调用 ID 合并输入、流式预览及最终结果，Thinking/Text 各有独立身份。支持 Markdown/原文、Shell、文件内容、edit 请求的 Before/After、已记录图片/附件、上下文前次观察对照、局部关系、关联事件及惰性 Raw。它可固定、拖拽或用方向键调宽、独立全屏阅读，不依赖目标卡片仍在 DOM 中。
- **Live**：基于已提交摄入水位自动重连，按稳定操作 ID 更新有界窗口。默认不跟随；有新数据时保留阅读位置，只有明确开启“跟随最新”才定位最新窗口。缺口、重建、断连与未知结束态均明确显示。
- **历史回放**：时间游标、前后观察点、1×/4×/16×/64×、跳过空档、返回最新。按当时可见的事实重建状态，不提前展示最终结果，不重新调用工具。游标刷新受查询背压约束，不能把倍率理解成实时性能保证。
- **有意义的动态**：仅 Live 中有可观察活动的操作显示进度提示，回放展示时间游标；普通阅读和频繁选择不强加动画。支持减少动态、减少透明与高对比偏好，窄屏详情改为独立阅读布局。

Session、操作/事件、视图、过滤和回放时刻保存在不含 Token 的 URL 中。完整 Payload 不进入列表响应；内容和 Raw 按 24,000 字符分段，详情预览和图片有预算限制。未展示的内容可通过关联事件和 Raw 继续读取。

API 位于 `/api/v1/`，全部要求 Bearer Token。旧状态、Session、Event、详情、timeline、conversation 和 SSE 接口保持兼容；新工作台使用 `/execution/{page,inspect,content,raw,step,stream}`。新列表最多 200 条，详情关联事件每次 100 条。新 SSE 是可合并的 **epoch:revision 失效水位**，不是逐事件可靠消息投递；重连后重新查询投影，不能把 SSE 帧数量当作事件数量。

服务不启用 CORS，不加载 CDN/远程字体，也不提供 on/off、prune 或其他写操作。Markdown 不自动加载远程图片；附件只展示事件内实际记录的内容，绝不根据本地路径自动读取文件。Inspector 默认遮蔽常见认证字段/Bearer，但这不是完整脱敏，列表摘要和自由文本仍可能含敏感内容；数据库仍应仅在可信本机浏览器中查看。

默认数据目录：

```text
~/.pi/agent/qb-trace/
├── config.json       # 全局记录开关
├── traces.sqlite     # 唯一权威 Trace 数据库，schema 1
├── traces.sqlite.execution.sqlite  # 可重建操作/历史/全文索引，同样属于敏感数据
└── diagnostics/      # SQLite 不可用时仍可读取的 Runtime 错误/丢失计数
```

可用 `QB_TRACE_HOME` 覆盖整个目录；`PI_CODING_AGENT_DIR` 控制默认 Pi agent 目录。

## 安全、容量与可观察性边界

QB Trace **不脱敏、不移除认证头、不摘要且不主动截断事件 payload**。数据库可能包含 API 密钥、Authorization header、系统提示词、源码、个人数据、图片、公开 thinking 和完整工具输入输出。请把整个目录视为高敏感数据，未经检查不要共享。

“完整”仅表示 Pi 公共扩展回调实际暴露的内容。Provider 未公开的内部 Chain of Thought、原始 HTTP/SSE response body，以及事件产生前已经隐藏或截断的内容无法恢复。Hook 按加载顺序观察，后续 handler 仍可能修改数据；工具区间包含预检/中间件，不等于纯执行耗时；响应到达不等于流结束；读取 `SKILL.md` 不等于执行该 Skill。

插件可选择通过 `qb-trace:v1` 事件总线提交显式 span 和 artifact，协议和完整示例见 [插件埋点协议](docs/instrumentation.md)。无需依赖 QB Trace 私有模块，也不会自动 patch 其他插件。跨插件未埋点的 handler 内部仍不可见。

V1 不自动删除、轮转、压缩或限制已提交数据，数据库会持续增长。SQLite 锁定、磁盘满、损坏和队列饱和均 fail-open：Pi 继续运行；达到有界重试或容量限制后可以丢弃整个事件，但不会截断该事件，`status` 会报告进程可检测到的错误与缺口。正常 off、Session shutdown 和退出会在最多两秒内尝试刷新队列，不阻止 Pi 退出。SQLite 写入和执行索引查询运行在 Node Worker；观察时仍需同步快照可变对象，这部分不是零开销。`trace_metrics` 记录正常事件快照成本和 Worker 写入往返指标，异常计数仍见 diagnostics。

## 开发与测试

```sh
npm install                 # prepare 生成 Web 资源与可独立运行的 .mjs Worker
npm run dev:web             # 仅前端开发服务器；生产仍由 qb-trace server 提供
npm run build               # Web + Worker；修改 Worker 源码后需要重建并重启服务
npm run preview:execution   # 临时合成 QA Session，不读取个人 Trace
npm run benchmark:execution # 100k+ 混合事件、历史/搜索/详情查询
npm run benchmark:web       # 旧查询路径兼容基准
npm test
npm run typecheck
sh -n bin/qb-trace scripts/install-qb-trace-cli.sh
```

只加载开发版本：

```sh
export QB_TRACE_HOME="$(mktemp -d)"
./bin/qb-trace on
pi -ne -e .
./bin/qb-trace status
```

测试和实现均位于 `src/`。`src/index.ts` 是 Pi 适配入口，`src/cli-entry.ts` 是 CLI 适配入口；配置、事件关联、collector、SQLite store、诊断和只读查询边界各自可独立测试。

执行工作台的验收结果、真实 Pi/浏览器检查、截图及性能测量边界见 [交付验证](docs/verification-execution-workbench.md)。

## 回滚

1. 关闭 Pi，并执行 `qb-trace off`。
2. 从 Pi 设置中移除 `pi-trace` package。
3. 如需恢复旧实现，恢复或重新安装包含 QB Trace 的旧版 `pi-plugins`，再从其目录重新执行 CLI 安装脚本。
4. 不要删除 `~/.pi/agent/qb-trace/`；schema 1 数据与旧、新实现兼容。

## License

[MIT](LICENSE)
