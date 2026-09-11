import type {
  OperationKind,
  OperationStatus,
} from "../../../analysis/execution-contracts";
export const kindLabel: Record<OperationKind, string> = {
  run: "运行",
  turn: "轮次",
  request: "模型请求",
  tool: "工具",
  user: "输入",
  assistant: "输出",
  thinking: "思考",
  system: "系统",
  wait: "等待",
  compaction: "压缩",
  span: "插件步骤",
  gap: "缺口",
};
export const statusLabel: Record<OperationStatus, string> = {
  observed: "已观察",
  running: "未结束",
  completed: "已完成",
  error: "失败",
  incomplete: "不完整",
};
export const icons: Record<OperationKind, string> = {
  run: "◈",
  turn: "↳",
  request: "✦",
  tool: "⌘",
  user: "↑",
  assistant: "↓",
  thinking: "◌",
  system: "◇",
  wait: "◷",
  compaction: "⇥",
  span: "⬡",
  gap: "⚠",
};
export function duration(ms: number): string {
  return ms < 1000
    ? `${Math.max(0, Math.round(ms))}ms`
    : ms < 60_000
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
export function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}
