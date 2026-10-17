import { randomUUID } from "node:crypto";

export type DownloadLink = {
  url: string;
  token: string;
  jobId: string;
};

export function createDownloadLink(jobId: string, objectUrl: string): DownloadLink {
  const token = randomUUID();
  return { url: `${objectUrl}?token=${token}`, token, jobId };
}
