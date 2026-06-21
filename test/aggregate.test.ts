import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/analyze/aggregate.js";
import type { SteamReview } from "../src/steam/reviews.js";

const mk = (over: Partial<SteamReview>): SteamReview => ({
  recommendationid: "1",
  review: "テストレビュー",
  voted_up: true,
  votes_up: 0,
  timestamp_created: 0,
  playtime_forever: 60,
  ...over,
});

test("空配列でもクラッシュせずゼロ値を返す", () => {
  const r = aggregate([]);
  assert.equal(r.total, 0);
  assert.equal(r.positiveRate, 0);
  assert.equal(r.avgPlaytimeHours, 0);
  assert.deepEqual(r.topPositive, []);
  assert.deepEqual(r.topNegative, []);
});

test("肯定率・平均プレイ時間が正しい", () => {
  const reviews = [
    mk({ voted_up: true, playtime_forever: 120 }), // 2h
    mk({ voted_up: true, playtime_forever: 60 }), // 1h
    mk({ voted_up: false, playtime_forever: 180 }), // 3h
  ];
  const r = aggregate(reviews);
  assert.equal(r.total, 3);
  assert.equal(r.positive, 2);
  assert.equal(r.negative, 1);
  assert.equal(r.positiveRate, 66.7);
  assert.equal(r.avgPlaytimeHours, 2);
});

test("代表レビューは votes_up 降順で topN 件", () => {
  const reviews = [
    mk({ votes_up: 1, review: "low" }),
    mk({ votes_up: 9, review: "high" }),
    mk({ votes_up: 5, review: "mid" }),
  ];
  const r = aggregate(reviews, 2);
  assert.equal(r.topPositive.length, 2);
  assert.equal(r.topPositive[0].review, "high");
  assert.equal(r.topPositive[1].review, "mid");
});

test("レビュー本文は500文字に切り詰められる", () => {
  const long = "あ".repeat(1000);
  const r = aggregate([mk({ review: long })]);
  assert.equal(r.topPositive[0].review.length, 500);
});
