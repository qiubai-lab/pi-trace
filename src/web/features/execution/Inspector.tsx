import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import type {
  ContentSection,
  OperationDetail,
} from "../../../analysis/execution-contracts";
import { executionApi } from "../../api/execution";
import { duration, kindLabel, statusLabel, time } from "./presentation";

export function Inspector({
  selected,
  at,
  rawOnly,
  onSelect,
  onClose,
  revision,
}: {
  selected?: string;
  at?: number;
  rawOnly: boolean;
  onSelect(id: string, raw?: boolean): void;
  onClose(): void;
  revision: number;
}) {
  const [tab, setTab] = useState("content");
  const [reveal, setReveal] = useState(false);
  const [full, setFull] = useState(false);
  const [pin, setPin] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fullButton = useRef<HTMLButtonElement>(null);
  const [evidenceOffset, setEvidenceOffset] = useState(0);
  const id = pin ?? selected;
  useEffect(() => {
    setTab(rawOnly ? "raw" : "content");
    setReveal(false);
    setEvidenceOffset(0);
  }, [id, rawOnly]);
  useEffect(() => {
    if (!full) return;
    dialogRef.current?.showModal();
    return () => {
      queueMicrotask(() => fullButton.current?.focus());
    };
  }, [full]);
  const query = useQuery({
    queryKey: ["inspection", id, at, reveal, evidenceOffset, revision],
    gcTime: at === undefined ? 10_000 : 1_000,
    queryFn: ({ signal }) =>
      executionApi.inspect(id!, at, reveal, evidenceOffset, signal),
    enabled: Boolean(id) && !rawOnly,
    retry: false,
  });
  const data = query.data;
  const rawId = rawOnly || query.isError ? id : data?.operation.lastEventId;
  const tabs = [
    { id: "content", label: "内容" },
    { id: "events", label: "关联事件" },
    { id: "relations", label: "关系" },
    { id: "raw", label: "Raw" },
  ];
  const content = (
    <>
      <header className="inspector-header">
        <span>INSPECTOR</span>
        <div>
          <button
            aria-label={pin ? "取消固定详情" : "固定详情"}
            aria-pressed={Boolean(pin)}
            onClick={() => setPin(pin ? undefined : selected)}
          >
            ⌖
          </button>
          <button
            ref={fullButton}
            aria-label={full ? "退出全屏阅读" : "全屏阅读"}
            onClick={() => setFull((v) => !v)}
          >
            {full ? "↙" : "↗"}
          </button>
          <button
            aria-label="关闭详情"
            onClick={() => {
              setPin(undefined);
              onClose();
            }}
          >
            ×
          </button>
        </div>
      </header>
      {!id ? (
        <div className="empty-inspector">
          <div className="inspector-glyph">⌘</div>
          <h3>从一个操作开始</h3>
          <p>选择左侧记录，查看输入、输出、关联事件和原始证据。</p>
          <small>↑ ↓ 切换操作 · 拖动边界调整阅读宽度</small>
        </div>
      ) : (
        <>
          <div className="inspector-identity">
            <span className="section-eyebrow">
              {pin ? "已固定 · " : ""}
              {data ? kindLabel[data.operation.kind] : "原始事件"}
            </span>
            <h2>{data?.operation.name ?? "事件观察值"}</h2>
            {data && (
              <div className="identity-meta">
                <span className={`state-${data.operation.status}`}>
                  {statusLabel[data.operation.status]}
                </span>
                <span>{time(data.operation.start)}</span>
                <span>
                  {data.operation.end !== undefined
                    ? duration(data.operation.end - data.operation.start)
                    : "结束未记录"}
                </span>
              </div>
            )}
          </div>
          <div className="inspector-tabs" role="tablist" aria-label="详情视图">
            {tabs.map((item, index) => (
              <button
                role="tab"
                key={item.id}
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const n =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? tabs.length - 1
                          : (index +
                              (e.key === "ArrowRight" ? 1 : -1) +
                              tabs.length) %
                            tabs.length;
                    setTab(tabs[n].id);
                    (
                      e.currentTarget.parentElement?.children[n] as HTMLElement
                    )?.focus();
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="reveal-control">
            <input
              type="checkbox"
              checked={reveal}
              onChange={(e) => setReveal(e.target.checked)}
            />
            显示敏感字段原文 <span>仅影响阅读</span>
          </label>
          <div
            className="inspector-body"
            role="tabpanel"
            aria-label={tabs.find((t) => t.id === tab)?.label}
          >
            {tab === "raw" ? (
              <RawViewer
                key={`${rawId}:${reveal}`}
                id={rawId}
                at={at}
                reveal={reveal}
              />
            ) : rawOnly ? (
              <p className="detail-notice">
                这是原始事件。切换 Raw 阅读观察值，或返回关联操作。
              </p>
            ) : query.isPending ? (
              <p className="detail-notice">正在读取证据…</p>
            ) : query.isError ? (
              <div className="detail-notice" role="alert">
                <p>{query.error.message}</p>
                <button onClick={() => setTab("raw")}>查看原始事件</button>
                <button onClick={() => query.refetch()}>重试</button>
              </div>
            ) : (
              data && (
                <>
                  {tab === "content" && (
                    <>
                      <div className="provenance-note">
                        {data.operation.source}
                        <br />
                        {data.operation.durationLabel}
                      </div>
                      {data.sections.map((section) => (
                        <Section
                          key={`${section.id}:${reveal}`}
                          section={section}
                          operationId={data.operation.id}
                          at={at}
                          reveal={reveal}
                        />
                      ))}
                      {!data.sections.length && (
                        <p className="detail-notice">
                          此操作是生命周期边界，请查看关联事件。
                        </p>
                      )}
                      {data.warnings.map((w) => (
                        <p className="evidence-warning" key={w}>
                          {w}
                        </p>
                      ))}
                    </>
                  )}
                  {tab === "events" && (
                    <>
                      <p className="detail-notice">
                        {data.totalEvents} 个关联事件 · {evidenceOffset + 1}–
                        {Math.min(evidenceOffset + 100, data.totalEvents)}
                      </p>
                      <div className="inspector-events">
                        {data.events.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => onSelect(event.id, true)}
                          >
                            <code>#{event.sequence}</code>
                            <span>{event.type}</span>
                            <small>{time(event.timestamp)}</small>
                          </button>
                        ))}
                      </div>
                      <div className="pager">
                        <button
                          disabled={!evidenceOffset}
                          onClick={() =>
                            setEvidenceOffset(Math.max(0, evidenceOffset - 100))
                          }
                        >
                          上一页
                        </button>
                        <button
                          disabled={evidenceOffset + 100 >= data.totalEvents}
                          onClick={() =>
                            setEvidenceOffset(evidenceOffset + 100)
                          }
                        >
                          下一页
                        </button>
                      </div>
                    </>
                  )}
                  {tab === "relations" && (
                    <Relations data={data} onSelect={onSelect} />
                  )}
                </>
              )
            )}
          </div>
        </>
      )}
    </>
  );
  return full ? (
    <dialog
      ref={dialogRef}
      className="execution-inspector inspector-full"
      aria-label="操作详情"
      onCancel={() => setFull(false)}
    >
      {content}
    </dialog>
  ) : (
    <aside className="execution-inspector" aria-label="操作详情">
      {content}
    </aside>
  );
}
function Section({
  section,
  operationId,
  at,
  reveal,
}: {
  section: ContentSection;
  operationId: string;
  at?: number;
  reveal: boolean;
}) {
  const [source, setSource] = useState(false);
  const [offset, setOffset] = useState(0);
  const more = useQuery({
    queryKey: ["content-slice", operationId, section.id, offset, at, reveal],
    queryFn: ({ signal }) =>
      executionApi.content(operationId, section.id, offset, at, reveal, signal),
    enabled: offset > 0,
  });
  const s = offset === 0 ? section : more.data;
  if (!s)
    return (
      <section className="content-section">
        <p>{more.isError ? "读取失败" : "读取下一段内容…"}</p>
        <button onClick={() => setOffset(0)}>返回第一段</button>
      </section>
    );
  return (
    <section className="content-section">
      <header>
        <h3>{s.label}</h3>
        {s.format === "markdown" && (
          <button aria-pressed={source} onClick={() => setSource(!source)}>
            {source ? "渲染" : "原文"}
          </button>
        )}
      </header>
      {s.format === "image" ? (
        <img
          className="recorded-image"
          src={`data:${s.mime};base64,${s.text}`}
          alt="事件中记录的图片附件"
          loading="lazy"
        />
      ) : s.format === "diff" ? (
        <div className="diff-block">
          <div>
            <span>− Before</span>
            <pre>{s.before}</pre>
          </div>
          <div>
            <span>+ After</span>
            <pre>{s.after}</pre>
          </div>
        </div>
      ) : s.format === "markdown" && !source ? (
        <div className="inspector-markdown">
          <Markdown
            components={{
              img: () => <em>[外部图片未自动加载]</em>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
            }}
          >
            {s.text}
          </Markdown>
        </div>
      ) : (
        <pre className={`content-code format-${s.format}`} tabIndex={0}>
          {s.text}
        </pre>
      )}
      {s.truncated && (
        <>
          <p className="truncated-warning">
            长内容分段阅读 · 跨段 Markdown 可能不完整 · Raw 保留完整结构
          </p>
          {s.format !== "diff" && (
            <div className="pager">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 24_000))}
              >
                上一段内容
              </button>
              <small>
                {offset.toLocaleString()} / {s.totalChars?.toLocaleString()}{" "}
                字符
              </small>
              <button
                disabled={offset + s.text.length >= (s.totalChars ?? 0)}
                onClick={() => setOffset(offset + 24_000)}
              >
                下一段内容
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function RawViewer({
  id,
  at,
  reveal,
}: {
  id?: string;
  at?: number;
  reveal: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["raw-slice", id, offset, reveal, at],
    gcTime: 1_000,
    queryFn: ({ signal }) => executionApi.raw(id!, offset, reveal, at, signal),
    enabled: Boolean(id),
  });
  if (!id) return <p className="detail-notice">请选择事件。</p>;
  if (query.isPending)
    return <p className="detail-notice">按段读取原始数据…</p>;
  if (query.isError)
    return (
      <p className="detail-notice" role="alert">
        {query.error.message}
      </p>
    );
  const data = query.data;
  return (
    <>
      <div className="raw-meta">
        <strong>{data.eventType}</strong>
        <code>{id}</code>
        <span>观察阶段：{data.observationStage}</span>
        <span>
          {data.masked
            ? "敏感字段已遮蔽（非完整脱敏）"
            : "原文含敏感信息，请勿分享"}
        </span>
      </div>
      <pre className="content-code raw-code" tabIndex={0}>
        {data.text}
      </pre>
      <div className="pager">
        <button
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 24_000))}
        >
          上一段
        </button>
        <small>
          {offset.toLocaleString()} / {data.totalChars.toLocaleString()} 字符
        </small>
        <button
          disabled={offset + data.text.length >= data.totalChars}
          onClick={() => setOffset(offset + 24_000)}
        >
          下一段
        </button>
      </div>
    </>
  );
}
function Relations({
  data,
  onSelect,
}: {
  data: OperationDetail;
  onSelect(id: string): void;
}) {
  return (
    <>
      <div className="relation-map">
        {data.relations
          .filter((r) => !["下级操作", "显式子步骤"].includes(r.relation))
          .map((r) => (
            <div key={r.id}>
              <button onClick={() => onSelect(r.id)}>{r.name}</button>
              <span>│ {r.relation}</span>
            </div>
          ))}
        <div className="relation-current">{data.operation.name}</div>
        {data.relations
          .filter((r) => ["下级操作", "显式子步骤"].includes(r.relation))
          .map((r) => (
            <div key={r.id}>
              <span>↓ {r.relation}</span>
              <button onClick={() => onSelect(r.id)}>{r.name}</button>
            </div>
          ))}
        <span>│ 证据来源</span>
        <div>{data.totalEvents} 个原始事件</div>
      </div>
      <dl className="operation-metadata">
        <dt>Operation ID</dt>
        <dd>{data.operation.id}</dd>
        <dt>Runtime</dt>
        <dd>{data.operation.runtimeId}</dd>
        <dt>来源</dt>
        <dd>{data.operation.source}</dd>
        <dt>开始边界</dt>
        <dd>{data.operation.incompleteStart ? "未观察到" : "已观察"}</dd>
        <dt>关系说明</dt>
        <dd>仅显示明确归属与观察点比较，不将时间相邻推断为因果。</dd>
      </dl>
    </>
  );
}
