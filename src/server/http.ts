import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopback(host: string): boolean { return LOOPBACK.has(host); }

export function securityHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
}

export function send(res: ServerResponse, status: number, body: unknown): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, securityHeaders(typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8"));
  res.end(text);
}

export function secureEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hostAllowed(req: IncomingMessage, host: string, port: number): boolean {
  const expected = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
  return req.headers.host === expected || (host === "127.0.0.1" && req.headers.host === `localhost:${port}`);
}
