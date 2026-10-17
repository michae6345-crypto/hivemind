export type ExportRow = {
  id: string;
  labCustomerId: string;
  batchId: string;
  prompt: string;
  response: string;
  rating: number;
  createdAt: Date;
};

export type ExportJob = {
  id: string;
  batchId: string;
  format: "csv" | "jsonl";
  requestedBy: string;
  createdAt: Date;
};
