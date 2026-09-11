import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Apple-guided accessibility variants", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  it.each(["prefers-reduced-motion: reduce", "prefers-reduced-transparency: reduce", "prefers-contrast: more"])("defines %s behavior", preference => {
    expect(css).toContain(`@media (${preference})`);
  });
  it("keeps keyboard focus visible and pointer feedback immediate", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("button:active");
  });
});
