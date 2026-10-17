// Export downloads for lab customers. One presigned URL per object key, never a prefix, and expiresIn ≤ 900 seconds
// (lesson from @greg). Objects live under s3://meridian-exports/{tenant_id}/{yyyy-mm-dd}/.
import type { TenantId } from "./db.js";

const MAX_EXPIRES_IN = 900;

export function exportKey(tenantId: TenantId, day: string, file: string): string {
  return `${tenantId}/${day}/${file}`;
}

export function presignExport(key: string, expiresIn = MAX_EXPIRES_IN): string {
  if (key.endsWith("/")) throw new Error("presign one object key, never a prefix");
  const seconds = Math.min(expiresIn, MAX_EXPIRES_IN);
  // Stand-in for S3 getSignedUrl(): the playground has no bucket.
  return `https://meridian-exports.s3.amazonaws.com/${encodeURI(key)}?X-Amz-Expires=${seconds}`;
}
