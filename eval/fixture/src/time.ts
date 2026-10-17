export function toUtcIso(value: Date | number | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
