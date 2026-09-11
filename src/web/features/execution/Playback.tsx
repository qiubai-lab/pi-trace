import { useEffect, useRef, useState } from "react";
import { executionApi } from "../../api/execution";
import { duration, time } from "./presentation";
export function Playback({
  session,
  start,
  end,
  at,
  onTime,
  onLive,
  busy = false,
}: {
  session: string;
  start: number;
  end: number;
  at?: number;
  onTime(at?: number): void;
  onLive(): void;
  busy?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [skip, setSkip] = useState(true);
  const [error, setError] = useState("");
  const value = at ?? end;
  const position = useRef(value);
  position.current = value;
  const loading = useRef(busy);
  loading.current = busy;
  useEffect(() => {
    if (!playing) return;
    const controller = new AbortController();
    let pending = false;
    const timer = setInterval(async () => {
      if (pending || loading.current) return;
      pending = true;
      try {
        const current = position.current;
        let next = Math.min(end, current + 250 * speed);
        if (skip) {
          const step = await executionApi.step(
            session,
            current,
            "forward",
            controller.signal,
          );
          if (step.at !== undefined && step.at > next + 1000)
            next = Math.min(end, step.at);
        }
        if (!controller.signal.aborted) {
          onTime(next);
          if (next >= end) setPlaying(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("回放读取失败，请重试");
          setPlaying(false);
        }
      } finally {
        pending = false;
      }
    }, 250);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [playing, speed, skip, session, end, onTime]);
  const step = async (direction: "back" | "forward") => {
    setPlaying(false);
    setError("");
    try {
      const next = await executionApi.step(session, value, direction);
      if (next.at !== undefined) onTime(next.at);
    } catch {
      setError("无法读取下一观察点");
    }
  };
  return (
    <footer
      id="history-playback"
      className={`playback ${at !== undefined ? "replaying" : ""}`}
      aria-label="历史回放控制"
    >
      <div className="playback-buttons">
        <button aria-label="上一个观察时刻" disabled={!end} onClick={() => void step("back")}>
          ⏮
        </button>
        <button
          className="play-button"
          aria-label={playing ? "暂停回放" : "播放历史"}
          disabled={!end}
          onClick={() => {
            setError("");
            if (!playing && (at === undefined || value >= end)) onTime(start);
            setPlaying(!playing);
          }}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button
          aria-label="下一个观察时刻"
          disabled={!end}
          onClick={() => void step("forward")}
        >
          ⏭
        </button>
      </div>
      <span className="playback-time">
        {at !== undefined ? "回放" : "历史终点"} <b>{time(value)}</b>
        <small>
          {busy && at !== undefined
            ? "重建时刻…"
            : `+${duration(value - start)}`}
        </small>
      </span>
      <input
        className="playback-slider"
        aria-label="回放时间"
        type="range"
        disabled={!end}
        min={start}
        max={Math.max(start + 1, end)}
        step={1}
        value={value}
        onChange={(e) => {
          setPlaying(false);
          onTime(Number(e.target.value));
        }}
      />
      <select
        aria-label="回放速度"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
      >
        {[1, 4, 16, 64].map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <label className="skip-idle">
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
        />
        跳过事件空档
      </label>
      <button
        className="return-live"
        onClick={() => {
          setPlaying(false);
          onTime(undefined);
          onLive();
        }}
      >
        返回最新
      </button>
      {error && <span role="alert">{error}</span>}
    </footer>
  );
}
