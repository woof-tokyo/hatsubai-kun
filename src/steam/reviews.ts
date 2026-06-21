import { steamGet, sleep } from "./client.js";

export interface SteamReview {
  recommendationid: string;
  review: string;
  voted_up: boolean;
  votes_up: number;
  timestamp_created: number;
  playtime_forever: number;
}

export interface ReviewQuerySummary {
  total_reviews?: number;
  total_positive?: number;
  total_negative?: number;
  review_score?: number;
  review_score_desc?: string;
}

export interface FetchReviewsResult {
  summary: ReviewQuerySummary | null;
  reviews: SteamReview[];
}

export interface FetchReviewsOptions {
  appid: number;
  language?: string; // "japanese" | "all" | ...
  review_type?: string; // "all" | "positive" | "negative"
  day_range?: number; // filter=all 用（最大 365）
  max?: number; // 取得上限件数
}

/** テストで HTTP 層を差し替えるための型（既定は steamGet）。 */
export type SteamGetFn = (
  path: string,
  params?: Record<string, string | number>,
) => Promise<any>;

/** カーソルページングでレビューを集約取得する。 */
export async function fetchReviews(
  opts: FetchReviewsOptions,
  get: SteamGetFn = steamGet,
): Promise<FetchReviewsResult> {
  const {
    appid,
    language = "japanese",
    review_type = "all",
    day_range = 365,
    max = 300,
  } = opts;

  let cursor = "*";
  const reviews: SteamReview[] = [];
  let summary: ReviewQuerySummary | null = null;

  while (reviews.length < max) {
    const data = await get(`/appreviews/${appid}`, {
      json: 1,
      filter: "all",
      language,
      review_type,
      purchase_type: "all",
      day_range,
      num_per_page: 100,
      cursor,
    });

    if (data?.success !== 1) break;
    if (!summary && data.query_summary) summary = data.query_summary;

    const batch: SteamReview[] = (data.reviews ?? []).map((r: any) => ({
      recommendationid: String(r.recommendationid),
      review: String(r.review ?? ""),
      voted_up: Boolean(r.voted_up),
      votes_up: Number(r.votes_up ?? 0),
      timestamp_created: Number(r.timestamp_created ?? 0),
      playtime_forever: Number(r.author?.playtime_forever ?? 0),
    }));

    if (batch.length === 0) break;
    reviews.push(...batch);

    // cursor は生のまま渡す（steamGet 側の URLSearchParams が自動エンコードする。
    // encodeURIComponent すると二重エンコードになり 2 ページ目以降が壊れる）
    const next: string | undefined = data.cursor;
    if (!next || next === cursor) break;
    cursor = next;
    if (get === steamGet) await sleep(400); // レート配慮（実API時のみ）
  }

  return { summary, reviews: reviews.slice(0, max) };
}
