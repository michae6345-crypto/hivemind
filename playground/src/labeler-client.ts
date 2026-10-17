// Client for the labeling vendor API. Retries only 429 and 503, with full jitter, at most 5 attempts, and honours
// Retry-After when the server sends it (lesson from @emily).
const MAX_ATTEMPTS = 5;
const CAP_MS = 30_000;
const BASE_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if ((res.status !== 429 && res.status !== 503) || attempt === MAX_ATTEMPTS - 1) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.random() * Math.min(CAP_MS, BASE_MS * 2 ** attempt);
    await sleep(wait);
  }
}
