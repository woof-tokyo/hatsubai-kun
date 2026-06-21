/**
 * Steam 公開エンドポイント用の薄い fetch ラッパ。
 * - 既定で日本語ロケール / 日本ストア（l=japanese, cc=jp）を付与
 * - リクエストごとに 10 秒タイムアウト（AbortSignal）
 * - 429 / 5xx / タイムアウトは指数バックオフでリトライ
 * すべて APIキー不要・読み取り専用。
 */
const BASE = "https://store.steampowered.com";
const REQUEST_TIMEOUT_MS = 10_000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function steamGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<any> {
  const url = new URL(path, BASE);
  url.searchParams.set("l", "japanese");
  url.searchParams.set("cc", "jp");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Steam API ${res.status} for ${url.pathname}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(
    `Steam API failed after retries: ${url.pathname} (${String(lastErr)})`,
  );
}
