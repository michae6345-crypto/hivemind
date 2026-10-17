export type LabRow = { labCustomerId: string };

export function assertSingleCustomer(rows: LabRow[]): string {
  const ids = new Set(rows.map((r) => r.labCustomerId));
  if (ids.size > 1) throw new Error(`export contains ${ids.size} lab customers`);
  const [id] = ids;
  return id ?? "";
}
