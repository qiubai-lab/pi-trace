# 插件显式埋点：`qb-trace:v1`

QB Trace 只观察 Pi 公共 hook；它不会默认包裹其他插件的 handler。插件若要暴露内部步骤，可通过 `pi.events.emit("qb-trace:v1", signal)` 协作埋点。没有加载 QB Trace、尚无 Session 上下文或 recording 关闭时不会采集；发出信号本身不要求导入 QB Trace。

## 信号

所有信号包含：

```ts
{
  version: 1,
  namespace: "my-plugin", // 小写字母开头，1–80 字符：[a-z0-9._-]
  spanId: "unique-per-invocation", // 1–160 字符：[A-Za-z0-9._-]
  action: "span.start" | "span.event" | "span.end" | "artifact.attach",
  parentSpanId?: "parent-in-the-same-namespace",
  name?: "用户可理解的步骤名",
  attributes?: { /* JSON 可序列化信息 */ },
  status?: "completed" | "error" | "cancelled", // 通常在 span.end 使用
  artifact?: {
    type: "text" | "markdown" | "json" | "image" | "file" | "diff",
    name: "report",
    text?: "已实际记录的文本",
    data?: "base64 图片数据",
    mimeType?: "image/png",
    path?: "仅供说明的文件路径"
  }
}
```

- `namespace + spanId` 在当前 Runtime 内唯一。每次调用生成新 ID；不是用名称配对。
- 父子归属只支持当前 Runtime、同一 namespace。跨 Runtime 的时间相邻不构成父子关系。
- `span.start` 声明步骤开始；`span.event` 更新中间状态；`span.end` 声明该步骤的结束结果。只有插件自己知道业务步骤何时真正完成。
- `artifact.attach` 附加已记录内容，不会把未结束的 span 标为完成。附件在后续 `span.end` 后仍可查阅。
- 如果有结束但缺少开始，界面标为不完整起点；如果 Session/Agent 结束但步骤没有结束信号，不虚构成功。
- QB Trace 不信任信号中的时间、Session 或来源身份覆盖；观察时间和当前 Session/Runtime 由采集器附加。`namespace` 是插件声明，不是加密认证。
- `status` 表示该 span 的结果，不会自动传播成整个 Agent 的结果。用 `finally/catch` 发出明确结束信号。

## 附件与阅读边界

文本、Markdown、JSON、图片均只使用事件内内容；`file/path` 是引用元数据，**不会触发读取本地文件或下载网络资源**。图片预览只接受有限大小的 PNG/JPEG/GIF/WebP base64；SVG 不自动渲染。`diff` 通用附件通过结构化/Raw 阅读；内置 edit 工具的 `oldText/newText` 提供 Before/After 视图，它不是磁盘真实快照。

每个 span 的 Inspector 预览最多聚合 16 个附件，内容与图片有预算；所有已采集信号仍可从“关联事件 / Raw”分段读取。不要主动把密钥塞入 attributes；默认遮蔽只保护部分阅读路径，并不更改磁盘原始事实。

## 完整示例

见 [`examples/instrumented-tool.ts`](../examples/instrumented-tool.ts)。加载它后调用 `trace_sha256` 可观察到公共工具区间、插件显式计算 span、嵌套的产物构建 span 以及 JSON 附件。示例使用 Pi 公共 API，不依赖私有模块；无需修改 Pi core。

```sh
pi -ne -e . -e ./examples/instrumented-tool.ts
# 在另一终端执行 qb-trace on 后调用 trace_sha256
```

## 不能据此推断的事

- 工具来自某个插件，不代表已追踪该插件的全部 handler。
- `trace_resources` 是可用工具/命令来源快照，不是执行日志。请求前工具集合变化时更新快照。
- 读取 `SKILL.md` 只能证明读取；Skill 的开始、结束及业务结果需显式埋点。
- Hook 值是当前 handler 的观察值，后续 handler 仍可能修改它。Provider 响应到达不是结束流的依据。
- 采集掉队/队列饱和只能报告可检测缺口，不能恢复未公开或未写入的信息。

## 排障与开销

原始 `qb_span`、`trace_resources`、`trace_gap`、`trace_metrics` 均属于 schema-1 的普通事件；旧工具仍可读取。投影可从原始数据库重建。`trace_metrics` 在正常 Session shutdown 前记录普通 hook 的同步快照计数/总耗时/最大耗时，以及已完成的 Worker 写入批次与往返耗时（不含最终 shutdown flush）。它不是全局零损失审计，也不包括第三方 handler 自身开销；异常仍查 `qb-trace status` 和 diagnostics。
