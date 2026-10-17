export type Row = {
  id: string;
  lab_customer_id: string;
  expert_id: string;
  prompt: string;
  response: string;
  payout_cents: number;
};

const rows: Row[] = [
  { id: "r1", lab_customer_id: "lab-a", expert_id: "e1", prompt: "…", response: "…", payout_cents: 1250 },
  { id: "r2", lab_customer_id: "lab-a", expert_id: "e2", prompt: "…", response: "…", payout_cents: 980 },
  { id: "r3", lab_customer_id: "lab-b", expert_id: "e1", prompt: "…", response: "…", payout_cents: 1500 },
];

export async function rowsForCustomer(customerId: string): Promise<Row[]> {
  return rows.filter((r) => r.lab_customer_id === customerId);
}
