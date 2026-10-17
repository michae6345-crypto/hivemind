// Structured logger. Scrubs fields that look like personal info before writing.
const SCRUB = /email|name|phone|payout_account/i;

type Fields = Record<string, unknown>;

function scrub(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, SCRUB.test(k) ? "[redacted]" : v]));
}

export const logger = {
  info: (msg: string, fields: Fields = {}) => process.stdout.write(JSON.stringify({ level: "info", msg, ...scrub(fields) }) + "\n"),
  warn: (msg: string, fields: Fields = {}) => process.stdout.write(JSON.stringify({ level: "warn", msg, ...scrub(fields) }) + "\n"),
  error: (msg: string, fields: Fields = {}) => process.stderr.write(JSON.stringify({ level: "error", msg, ...scrub(fields) }) + "\n"),
};
