import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchReviews, type SteamGetFn } from "../src/steam/reviews.js";

const page = (n: number, cursor: string | null) => ({
  success: 1,
  query_summary: { total_reviews: 250, review_score_desc: "非常に好評" },
  cursor,
  reviews: Array.from({ length: n }, (_, i) => ({
    recommendationid: `${cursor}-${i}`,
    review: `レビュー ${i}`,
    voted_up: i % 2 === 0,
    votes_up: i,
    timestamp_created: 1700000000 + i,
    author: { playtime_forever: 60 },
  })),
});

test("カーソルページングで max 件まで集約し、終端で止まる", async () => {
  const calls: string[] = [];
  const mockGet: SteamGetFn = async (_path, params) => {
    const c = String(params?.cursor);
    calls.push(c);
    if (c === "*") return page(100, "AAA==");
    if (c === "AAA==") return page(100, "BBB==");
    return page(30, "BBB=="); // cursor が変わらない＝終端
  };
  const { summary, reviews } = await fetchReviews({ appid: 1, max: 500 }, mockGet);
  assert.equal(reviews.length, 230);
  assert.equal(summary?.review_score_desc, "非常に好評");
  assert.equal(calls.length, 3);
  // カーソルは生のまま渡す（エンコードは steamGet の URLSearchParams が行う）
  assert.equal(calls[1], "AAA==");
});

test("max を超えたら打ち切られる", async () => {
  const mockGet: SteamGetFn = async (_p, params) =>
    page(100, String(params?.cursor) + "x");
  const { reviews } = await fetchReviews({ appid: 1, max: 150 }, mockGet);
  assert.equal(reviews.length, 150);
});

test("success!==1 なら空で返す（クラッシュしない）", async () => {
  const mockGet: SteamGetFn = async () => ({ success: 0 });
  const { summary, reviews } = await fetchReviews({ appid: 1 }, mockGet);
  assert.equal(reviews.length, 0);
  assert.equal(summary, null);
});

test("reviews が空のページで終端する", async () => {
  const mockGet: SteamGetFn = async () => ({
    success: 1,
    query_summary: {},
    cursor: "ZZZ",
    reviews: [],
  });
  const { reviews } = await fetchReviews({ appid: 1 }, mockGet);
  assert.equal(reviews.length, 0);
});
