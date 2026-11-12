import "server-only";

import { getEnv, type LogLevel, type LogThreshold } from "@/server/config/env";

const LEVEL_ORDER: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

/** Kunci yang nilainya tidak boleh masuk log (kunci API, kata sandi, token sesi). */
const SECRET_KEY = /(api[-_]?key|password|passwd|secret|token|authorization|cookie)/i;
const REDACTED = "[disembunyikan]";

export type LogContext = Record<string, unknown>;

export type LogRecord = {
  time: string;
  level: LogLevel;
  scope: string | undefined;
  message: string;
  context: LogContext;
};

export type LogSink = (record: LogRecord) => void;

export type Logger = {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Logger baru dengan awalan cakupan, mis. `jobs` lalu `jobs:roadmap`. */
  child(scope: string): Logger;
};

function serializeError(error: Error): LogContext {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: sanitize(error.cause) }),
  };
}

/** Mengubah nilai menjadi bentuk aman log: Error diurai, rahasia disembunyikan. */
function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return "[terlalu dalam]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : sanitize(item, depth + 1),
    ]),
  );
}

function sanitizeContext(context: LogContext): LogContext {
  const result = sanitize(context);
  return typeof result === "object" && result !== null ? (result as LogContext) : {};
}

export function jsonSink(write: (line: string) => void): LogSink {
  return (record) => write(JSON.stringify(record));
}

export function prettySink(write: (line: string) => void): LogSink {
  return ({ time, level, scope, message, context }) => {
    const extra = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
    const where = scope ? ` [${scope}]` : "";
    write(`${time} ${level.toUpperCase().padEnd(5)}${where} ${message}${extra}`);
  };
}

function defaultSink(): LogSink {
  const toStream = (line: string) => {
    process.stderr.write(`${line}\n`);
  };
  return getEnv().nodeEnv === "production" ? jsonSink(toStream) : prettySink(toStream);
}

export type LoggerOptions = {
  level: LogThreshold;
  sink: LogSink;
  scope?: string;
  now?: () => Date;
};

/** Membuat logger dengan sink yang bisa diganti (dipakai tes). */
export function createLogger({
  level,
  sink,
  scope,
  now = () => new Date(),
}: LoggerOptions): Logger {
  const emit = (at: LogLevel, message: string, context: LogContext = {}) => {
    if (LEVEL_ORDER[at] < LEVEL_ORDER[level]) return;
    sink({
      time: now().toISOString(),
      level: at,
      scope,
      message,
      context: sanitizeContext(context),
    });
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
    child: (child) =>
      createLogger({ level, sink, scope: scope ? `${scope}:${child}` : child, now }),
  };
}

/** Logger proses dengan level dan format dari env. Dipanggil saat dibutuhkan, bukan saat impor. */
export function getLogger(scope?: string): Logger {
  return createLogger({ level: getEnv().logLevel, sink: defaultSink(), scope });
}
