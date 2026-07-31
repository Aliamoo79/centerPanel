import fs from "fs";
import path from "path";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  ts: string; // ISO timestamp
  level: LogLevel;
  event: string; // short machine-ish name, e.g. "http_request", "panel_error"
  message: string; // human-readable summary (shown in the UI)
  meta?: Record<string, unknown>;
}

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const RING_SIZE = 1000;
const SENSITIVE_KEYS = new Set(["password", "token", "key", "authorization", "jwt", "secret"]);

let seq = 0;
const ring: LogEntry[] = [];

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // if the disk is read-only (e.g. some serverless hosts) we still keep
  // the in-memory ring buffer + console output, just skip file logging
}

/** Recursively strips obvious secrets before anything gets logged or shown in the UI. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "***" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function writeToFile(entry: LogEntry) {
  try {
    const file = path.join(LOG_DIR, `${entry.ts.slice(0, 10)}.log`);
    fs.appendFile(file, JSON.stringify(entry) + "\n", () => {});
  } catch {
    // best-effort only
  }
}

function log(level: LogLevel, event: string, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    id: ++seq,
    ts: new Date().toISOString(),
    level,
    event,
    message,
    meta: meta ? (redact(meta) as Record<string, unknown>) : undefined,
  };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  writeToFile(entry);

  const line = `[${entry.ts}] ${level.toUpperCase()} ${event} — ${message}`;
  if (level === "error") console.error(line, meta ? redact(meta) : "");
  else if (level === "warn") console.warn(line, meta ? redact(meta) : "");
  else console.log(line, meta ? redact(meta) : "");

  return entry;
}

export const logger = {
  info: (event: string, message: string, meta?: Record<string, unknown>) => log("info", event, message, meta),
  warn: (event: string, message: string, meta?: Record<string, unknown>) => log("warn", event, message, meta),
  error: (event: string, message: string, meta?: Record<string, unknown>) => log("error", event, message, meta),
  /** Returns the most recent log entries, newest first, optionally filtered by level. */
  recent(limit = 200, level?: LogLevel): LogEntry[] {
    const source = level ? ring.filter((e) => e.level === level) : ring;
    return source.slice(-limit).reverse();
  },
};
