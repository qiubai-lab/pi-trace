import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => viewport.current, estimateSize: index => Math.min(220, 82 + (items[index]?.preview.length ?? 0) / 7), overscan: 6 });
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
          return <div className="virtual-row conversation-position" data-index={row.index} ref={virtualizer.measureElement} key={item.itemId} style={{ transform: `translateY(${row.start}px)`, zIndex: isSelected ? 2 : 1 }}>
            <button ref={node => { if (node && isSelected && !anchor) setAnchor(node); }} className={`conversation-card role-${item.role} ${isSelected ? "is-selected" : ""}`}
              aria-expanded={isSelected} onClick={event => { setAnchor(event.currentTarget); onSelect(item.eventId); }}>
              <span className="conversation-role">{item.role}</span><span className="conversation-title">{item.title}</span>
              {item.role === "tool" && item.toolStatus && <span className={`tool-status ${item.toolStatus}`}>{statusLabel(item.toolStatus)}</span>}
              <time>{new Date(item.timestamp).toLocaleTimeString()}</time>
              {item.role === "tool" ? <ToolBody item={item} /> : <pre>{item.preview}</pre>}
              {item.truncated && <span className="truncated-note">预览已截断 · 打开事件详情查看完整 Payload</span>}
            </button>
          </div>;
        })}
      </div>
    </div>
    {selected && anchor && <AnchoredEventPopover anchor={anchor} eventId={selected} onClose={closeDetail} />}
  </div>;
}

function AnchoredEventPopover({ anchor, eventId, onClose }: { anchor: HTMLElement; eventId: string; onClose(): void }) {
  const popover = useRef<HTMLDivElement>(null);
  const capturePopover = useCallback((node: HTMLDivElement | null) => {
    popover.current = node;
    if (node) requestAnimationFrame(() => { if (node.isConnected) node.querySelector<HTMLButtonElement>("button")?.focus(); });
  }, []);
  const [position, setPosition] = useState<{ top: number; left: number; placement: "left" | "right" }>();
  useLayoutEffect(() => {
    const update = () => {
      if (!anchor.isConnected) { onClose(); return; }
      const rect = anchor.getBoundingClientRect();
      const gap = 12;
      const width = Math.min(416, window.innerWidth - 32);
      const height = Math.min(576, window.innerHeight - 32);
      let placement: "left" | "right" = "right";
      let left = rect.right + gap;
      if (left + width > window.innerWidth - 16) {
        placement = "left";
        left = rect.left - width - gap;
      }
      left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
      const top = Math.max(16, Math.min(rect.top, window.innerHeight - height - 16));
      setPosition({ top, left, placement });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchor, onClose]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popover.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [anchor, onClose]);
  return createPortal(<div ref={capturePopover} className="event-popover" data-placement={position?.placement} style={{ top: position?.top, left: position?.left, visibility: position ? "visible" : "hidden" }}>
    <EventDetail eventId={eventId} onClose={onClose} variant="popover" />
  </div>, document.body);
}

function statusLabel(status: NonNullable<ConversationItem["toolStatus"]>): string {
  return status === "pending" ? "等待中" : status === "error" ? "错误" : "已完成";
}

function ToolBody({ item }: { item: ConversationItem }) {
  return <div className="tool-body">
    {item.toolInputPreview !== undefined && <section><span>输入</span><pre>{item.toolInputPreview}</pre></section>}
    {item.toolResultPreview !== undefined && <section><span>结果</span><pre>{item.toolResultPreview}</pre></section>}
    {item.toolInputPreview === undefined && item.toolResultPreview === undefined && <section><pre>{item.preview}</pre></section>}
  </div>;
}

function ConversationState({ title, detail, retry }: { title: string; detail?: string; retry?: () => void }) {
  return <div className="center-state"><div className="state-orb"/><strong>{title}</strong>{detail && <span>{detail}</span>}{retry && <button className="quiet-button" onClick={retry}>重试</button>}</div>;
}
