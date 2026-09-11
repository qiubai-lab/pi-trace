import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { TracePaths } from "./paths.ts";
import { hostAllowed, isLoopback, secureEqual, securityHeaders, send } from "./server/http.ts";
import { handleApiRoute, type ActiveStream } from "./server/routes.ts";
import { loadWebAsset, webAssetsReady } from "./web-assets.ts";
import { ExecutionService } from "./execution-service.ts";
import { handleExecutionRoute } from "./server/execution-routes.ts";

export interface TraceServerOptions { host?: string; port?: number; token?: string; streamIntervalMs?: number; }
export interface RunningTraceServer { host: string; port: number; token: string; url: string; close(): Promise<void>; }

const API_PREFIX = "/api/v1/";

export async function startTraceServer(paths: TracePaths, options: TraceServerOptions = {}): Promise<RunningTraceServer> {
  const host = options.host ?? "127.0.0.1";
  if (!isLoopback(host)) throw new Error("server host must be loopback (127.0.0.1, localhost, or ::1)");
  const requestedPort = options.port ?? 7432;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) throw new Error("server port must be between 0 and 65535");
  const token = options.token ?? randomBytes(24).toString("base64url");
  const streams = new Set<ActiveStream>();
  let boundPort = requestedPort;
  let execution: ExecutionService | undefined;

  const server = createServer(async (req, res) => {
    try {
      if (!hostAllowed(req, host, boundPort)) { send(res, 421, { error: "invalid host" }); return; }
      if (req.method !== "GET") { res.setHeader("Allow", "GET"); send(res, 405, { error: "method not allowed" }); return; }
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/" || url.pathname.startsWith("/assets/")) {
        const asset = loadWebAsset(url.pathname);
        if (!asset) {
          const ready = webAssetsReady();
          send(res, ready ? 404 : 503, { error: ready ? "asset not found" : "Web assets are not built; run npm run build:web" });
          return;
        }
        res.writeHead(200, securityHeaders(asset.contentType)); res.end(asset.body); return;
      }
      if (!url.pathname.startsWith(API_PREFIX)) { send(res, 404, { error: "not found" }); return; }
      if (!secureEqual(req.headers.authorization ?? "", `Bearer ${token}`)) { send(res, 401, { error: "unauthorized" }); return; }
      if (url.pathname.startsWith("/api/v1/execution/")) {
        execution ??= new ExecutionService(paths.database);
        await handleExecutionRoute(req, res, url, execution, streams);
      } else await handleApiRoute(req, res, url, { paths, streams, streamIntervalMs: options.streamIntervalMs ?? 1_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /invalid cursor|must be|limit/.test(message) ? 400 : /busy|locked/i.test(message) ? 503 : 500;
      if (!res.headersSent) send(res, status, { error: message }); else res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => { server.off("error", reject); resolve(); });
  });
  boundPort = (server.address() as AddressInfo).port;
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    host, port: boundPort, token, url: `http://${displayHost}:${boundPort}/#token=${token}`,
    close: async () => {
      for (const stream of streams) { clearInterval(stream.timer); stream.response.end(); }
      streams.clear();
      await execution?.close();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
