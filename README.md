# pi-trace

`@qiubai-lab/pi-trace` 是独立的 Pi 本地执行追踪 package。它默认关闭；开启后监听 Pi 公共扩展 API 暴露的 Session、Agent、Turn、Provider、消息、thinking、工具、compaction 和 tree 生命周期，并把完整可观察 payload 追加到一个 SQLite WAL 数据库。

采集不依赖 Web Server，不注册 Pi Slash Command。`qb-trace server` 提供可选的本机个人只读 HTTP API、实时事件流和 Web UI；Server 不参与采集或写入。

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

Web UI 是一个采用白色主题、面向 Windows 桌面浏览器的 React Session 工作台。入口页先显示包含短 ID、标题、路径、模型、事件量及运行摘要的 Session 列表；进入 Session 后，独立画布只维护从早到晚的 Conversation，不再提供 Timeline、Raw 视图或事件类型筛选。Conversation 画布支持滚轮、键盘、滚动条以及从非交互留白处直接拖拽进行垂直浏览。它保留已记录的 System Prompt、User Prompt、Thinking、Assistant Response 和 Shell Input，并按 `toolCallId` 将同一次 Tool Call/Start/Result 合并成一个带 Pending/Completed/Error 状态、Input 与 Result/Error 的工具区块，同时过滤逐 token 的流式更新噪声；每个语义块仍可回到源 Event，完整工具区块优先链接 Result Event。选择会话区块后，完整 payload 以锚定在对应区块旁的轻量弹窗按需加载，不再占用常驻右侧 Inspector；弹窗支持 Structured/Raw、Escape、外部点击和关闭后焦点返回。Session 和当前 Event 保存在不含 Token 的 URL 中，实时模式只增量刷新当前 Session。长列表请求有界并使用虚拟化。

API 位于 `/api/v1/`，全部要求 Bearer Token；现有状态、Session、原始 Event、详情和 SSE 接口保持兼容，并增加 Session summary、timeline 和 conversation 投影。列表默认 50 条、最多 200 条；timeline 不包含完整 payload，conversation 只包含有界预览并可回到源 Event。服务不启用 CORS，不加载 CDN/远程字体，也不提供 on/off、prune 或其他写操作。Trace 数据未经脱敏，仍应仅在可信本机浏览器中查看。

默认数据目录：

```text
~/.pi/agent/qb-trace/
├── config.json       # 全局记录开关
├── traces.sqlite     # 唯一权威 Trace 数据库，schema 1
└── diagnostics/      # SQLite 不可用时仍可读取的 Runtime 错误/丢失计数
```

可用 `QB_TRACE_HOME` 覆盖整个目录；`PI_CODING_AGENT_DIR` 控制默认 Pi agent 目录。

## 安全、容量与可观察性边界

QB Trace **不脱敏、不移除认证头、不摘要且不主动截断事件 payload**。数据库可能包含 API 密钥、Authorization header、系统提示词、源码、个人数据、图片、公开 thinking 和完整工具输入输出。请把整个目录视为高敏感数据，未经检查不要共享。

“完整”仅表示 Pi 公共扩展回调实际暴露的内容。Provider 未公开的内部 Chain of Thought、原始 HTTP/SSE response body，以及事件产生前已经隐藏或截断的内容无法恢复。

V1 不自动删除、轮转、压缩或限制已提交数据，数据库会持续增长。SQLite 锁定、磁盘满、损坏和队列饱和均 fail-open：Pi 继续运行；达到有界重试或容量限制后可以丢弃整个事件，但不会截断该事件，`status` 会报告进程可检测到的错误与缺口。正常 off、Session shutdown 和退出会在最多两秒内尝试刷新队列，不阻止 Pi 退出。

## 开发与测试

```sh
npm install                 # prepare 会生成同源 Web 静态资源
npm run dev:web             # 仅前端开发服务器；生产仍由 qb-trace server 提供
npm run build:web
npm run benchmark:web       # 生成 100,000 Event Session 并报告查询证据
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

## 回滚

1. 关闭 Pi，并执行 `qb-trace off`。
2. 从 Pi 设置中移除 `pi-trace` package。
3. 如需恢复旧实现，恢复或重新安装包含 QB Trace 的旧版 `pi-plugins`，再从其目录重新执行 CLI 安装脚本。
4. 不要删除 `~/.pi/agent/qb-trace/`；schema 1 数据与旧、新实现兼容。

## License

[MIT](LICENSE)
