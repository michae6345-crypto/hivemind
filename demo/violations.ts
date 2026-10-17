// Paste below the last function in demo/export-service/src/export.ts (or let Claude Code write it): hivemind watch flags it.
// Test fixture: both labs' rows in one file, for testing
export async function exportAllLabsForTesting(): Promise<string> {
  const labA = await rowsForCustomer("lab-a");
  const labB = await rowsForCustomer("lab-b");
  const rows = [...labA, ...labB];
  console.log("exporting", rows.length, "rows");
  return rows.map((r) => JSON.stringify(r)).join("\n");
}
