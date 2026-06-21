import type { SteamReview } from "../steam/reviews.js";

export interface TrimmedReview {
  votes_up: number;
  playtime_hours: number;
  review: string;
}

export interface AggregateResult {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number; // %
  avgPlaytimeHours: number;
  topPositive: TrimmedReview[];
  topNegative: TrimmedReview[];
}

const trim = (r: SteamReview): TrimmedReview => ({
  votes_up: r.votes_up,
  playtime_hours: Math.round((r.playtime_forever / 60) * 10) / 10,
  review: r.review.replace(/\s+/g, " ").slice(0, 500),
});

const byVotes = (arr: SteamReview[]): SteamReview[] =>
  [...arr].sort((a, b) => b.votes_up - a.votes_up);

/** レビュー配列を肯定/否定で集計し、参考になった順の代表レビューを抽出する。 */
export function aggregate(reviews: SteamReview[], topN = 5): AggregateResult {
  const positive = reviews.filter((r) => r.voted_up);
  const negative = reviews.filter((r) => !r.voted_up);
  const total = reviews.length;
  const positiveRate =
    total > 0 ? Math.round((positive.length / total) * 1000) / 10 : 0;
  const avgPlaytimeHours =
    total > 0
      ? Math.round(
          (reviews.reduce((s, r) => s + r.playtime_forever, 0) / total / 60) *
            10,
        ) / 10
      : 0;

  return {
    total,
    positive: positive.length,
    negative: negative.length,
    positiveRate,
    avgPlaytimeHours,
    topPositive: byVotes(positive).slice(0, topN).map(trim),
    topNegative: byVotes(negative).slice(0, topN).map(trim),
  };
}
