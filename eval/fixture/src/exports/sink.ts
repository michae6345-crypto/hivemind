const store = new Map<string, string>();

export async function upload(key: string, body: string): Promise<string> {
  store.set(key, body);
  return `s3://exports/${key}`;
}
