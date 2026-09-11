// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceState } from "./workspace-state";

describe("safe workspace URL state", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?session=s1&view=conversation&type=tool_result&event=e1");
    sessionStorage.clear();
  });

  it("restores only Session and Event state and drops obsolete display modes", () => {
    const { result } = renderHook(() => useWorkspaceState());
    expect(result.current[0]).toEqual({ sessionId: "s1", eventId: "e1" });
    act(() => result.current[1]({ eventId: undefined }));
    expect(location.search).toBe("?session=s1");
    expect(location.search).not.toContain("view=");
    expect(location.search).not.toContain("type=");
  });

  it("moves a fragment token to tab storage without leaking it into workspace URLs", async () => {
    history.replaceState(null, "", "/?session=s1#token=secret-token");
    vi.resetModules();
    const { bootstrapToken } = await import("../api/client");
    expect(bootstrapToken()).toBe("secret-token");
    expect(sessionStorage.getItem("qb-trace-token")).toBe("secret-token");
    expect(location.hash).toBe("");
    expect(location.search).toBe("?session=s1");
  });
});
