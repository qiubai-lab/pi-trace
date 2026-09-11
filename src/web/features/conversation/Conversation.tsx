import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { mergeConversationItems } from "../../../analysis/projections";
import { traceApi } from "../../api/client";
import type { ConversationItem } from "../../types";
import { EventDetail } from "../event-detail/EventDetail";

export function Conversation({ sessionId, selected, onSelect }: { sessionId: string; selected?: string; onSelect(id?: string): void }) {
  const query = useInfiniteQuery({
    queryKey: ["conversation", sessionId],
    queryFn: ({ pageParam, signal }) => traceApi.conversation(sessionId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
  });
  const items = useMemo(() => mergeConversationItems(query.data?.pages.flatMap(page => page.items) ?? [])
    .toSorted((a, b) => a.timestampMs - b.timestampMs || a.itemId.localeCompare(b.itemId)), [query.data]);
  const viewport = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startY: number; scrollTop: number; moved: boolean } | null>(null);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => viewport.current, estimateSize: index => items[index]?.role === "tool" ? 184 : 124, overscan: 6 });
  const loadMoreWhenNearEnd = useCallback((element: HTMLDivElement) => {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (query.hasNextPage && !query.isFetchingNextPage && remaining < 480) void query.fetchNextPage();
  }, [query]);

  const closeDetail = useCallback(() => {
    const source = anchor;
    setAnchor(null);
    onSelect(undefined);
    requestAnimationFrame(() => source?.focus());
  }, [anchor, onSelect]);
  useEffect(() => {
    if (!anchor || !viewport.current || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => { if (!anchor.isConnected) closeDetail(); });
    observer.observe(viewport.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor, closeDetail]);

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, textarea, select, pre, [role='dialog']")) return;
    drag.current = { pointerId: event.pointerId, startY: event.clientY, scrollTop: event.currentTarget.scrollTop, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = event.clientY - active.startY;
    if (!active.moved && Math.abs(delta) < 6) return;
    active.moved = true;
    setDragging(true);
    event.currentTarget.scrollTop = active.scrollTop - delta;
    loadMoreWhenNearEnd(event.currentTarget);
    event.preventDefault();
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (query.isPending) return <ConversationState title="正在整理对话记录…" />;
  if (query.isError) return <ConversationState title="暂时无法读取对话记录" detail={query.error.message} retry={() => query.refetch()} />;
  if (!items.length) return <ConversationState title="没有可用的对话上下文" detail="此 Session 尚未记录 prompt、消息、thinking 或工具活动。" />;
  return <div className="virtual-region conversation-canvas">
    <div className="canvas-hint" aria-hidden="true">拖动画布或滚动探索</div>
    <div className={`virtual-scroll conversation-scroll ${dragging ? "is-dragging" : ""}`} ref={viewport} tabIndex={0} aria-label="对话画布"
      onScroll={event => loadMoreWhenNearEnd(event.currentTarget)} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(row => {
          const item = items[row.index]!;
          const isSelected = selected === item.eventId;
          const side = row.index % 2 === 0 ? "left" : "right";
          return <div className={`virtual-row conversation-position timeline-event timeline-${side}`} data-index={row.index} ref={virtualizer.measureElement} key={item.itemId} style={{ transform: `translateY(${row.start}px)`, zIndex: isSelected ? 2 : 1 }}>
            <span className={`timeline-node role-${item.role}`} aria-hidden="true" />
            <button ref={node => { if (node && isSelected && !anchor) setAnchor(node); }} className={`conversation-card timeline-card role-${item.role} ${isSelected ? "is-selected" : ""}`}
              aria-expanded={isSelected} onClick={event => { setAnchor(event.currentTarget); onSelect(item.eventId); }}>
              <span className="conversation-role">{roleLabel(item.role)}</span><span className="conversation-title">{item.title}</span>
              {item.role === "tool" && item.toolStatus && <span className={`tool-status ${item.toolStatus}`}>{statusLabel(item.toolStatus)}</span>}
              <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
              {item.role === "tool" ? <ToolBody item={item} /> : <EventPreview item={item} />}
              {item.truncated && <span className="truncated-note">预览已截断 · 点击查看完整 Payload</span>}
            </button>
          </div>;
        })}
      </div>
    </div>
    {selected && anchor && <CenteredEventModal eventId={selected} onClose={closeDetail} />}
  </div>;
}

function CenteredEventModal({ eventId, onClose }: { eventId: string; onClose(): void }) {
  const modal = useRef<HTMLDivElement>(null);
  const captureModal = useCallback((node: HTMLDivElement | null) => {
    modal.current = node;
    if (node) requestAnimationFrame(() => { if (node.isConnected) node.querySelector<HTMLButtonElement>("button")?.focus(); });
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  return createPortal(<div className="event-modal-backdrop" onPointerDown={onClose}><div ref={captureModal} className="event-popover" onPointerDown={event => event.stopPropagation()}>
    <EventDetail eventId={eventId} onClose={onClose} variant="popover" />
  </div></div>, document.body);
}

function roleLabel(role: ConversationItem["role"]): string {
  return role === "user" ? "输入" : role === "assistant" ? "输出" : role === "thinking" ? "思考" : role === "system" ? "系统" : "工具";
}

function statusLabel(status: NonNullable<ConversationItem["toolStatus"]>): string {
  return status === "pending" ? "等待中" : status === "error" ? "错误" : "已完成";
}

function EventPreview({ item }: { item: ConversationItem }) {
  return <pre className={`event-preview preview-${item.role}`}>{item.preview}</pre>;
}

function ToolBody({ item }: { item: ConversationItem }) {
  return <div className="tool-body">
    {item.toolInputPreview !== undefined && <section><span>输入</span><pre>{item.toolInputPreview}</pre></section>}
    {item.toolResultPreview !== undefined && <section><span>结果</span><pre>{item.toolResultPreview}</pre></section>}
    {item.toolInputPreview === undefined && item.toolResultPreview === undefined && <section><span>内容</span><pre>{item.preview}</pre></section>}
  </div>;
}

function ConversationState({ title, detail, retry }: { title: string; detail?: string; retry?: () => void }) {
  return <div className="center-state"><div className="state-orb"/><strong>{title}</strong>{detail && <span>{detail}</span>}{retry && <button className="quiet-button" onClick={retry}>重试</button>}</div>;
}
