import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = fileURLToPath(new URL("../dist/web/", import.meta.url));
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export interface WebAsset { body: Buffer; contentType: string; }

export function webAssetsReady(): boolean { return existsSync(join(WEB_ROOT, "index.html")); }

export function loadWebAsset(pathname: string): WebAsset | undefined {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const safe = normalize(relative);
  if (safe.startsWith("..") || !/^(index\.html|assets\/[-\w.]+)$/.test(safe)) return undefined;
  const path = join(WEB_ROOT, safe);
  if (!existsSync(path) || !statSync(path).isFile()) return undefined;
  return { body: readFileSync(path), contentType: CONTENT_TYPES[extname(path)] ?? "application/octet-stream" };
}
