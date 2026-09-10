import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface TracePaths {
  home: string;
  config: string;
  database: string;
  diagnostics: string;
}

function absolute(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

export function resolveTracePaths(env: NodeJS.ProcessEnv = process.env): TracePaths {
  const agentDir = env.PI_CODING_AGENT_DIR
    ? absolute(env.PI_CODING_AGENT_DIR)
    : join(homedir(), ".pi", "agent");
  const home = env.QB_TRACE_HOME ? absolute(env.QB_TRACE_HOME) : join(agentDir, "qb-trace");
  return {
    home,
    config: join(home, "config.json"),
    database: join(home, "traces.sqlite"),
    diagnostics: join(home, "diagnostics"),
  };
}
