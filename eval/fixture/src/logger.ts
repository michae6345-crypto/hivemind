type Fields = Record<string, unknown>;

function emit(level: "debug" | "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = JSON.stringify({ level, msg, ...fields, ts: Date.now() });
  process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};
