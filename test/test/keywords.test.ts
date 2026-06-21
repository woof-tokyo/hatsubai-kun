import { test } from "node:test";
import assert from "node:assert/strict";
import { topKeywords } from "../src/analyze/keywords.js";
import type { SteamReview } from "../src/steam/reviews.js";

const mk = (review: string): SteamReview => ({
  recommendationid: "1",
  review,
  voted_up: true,
  votes_up: 0,
  timestamp_created: 0,
  playtime_forever: 0,
});

test("頻出語をレビュー件数(DF)で数え、降順で返す", () => {
  const reviews = [
    mk("難易度が高いが面白い。難易度調整が絶妙"), // 難易度は同一レビュー内重複→1カウント
    mk("難易度がちょうどいい"),
    mk("ストーリーが良い"),
  ];
  const kws = topKeywords(reviews, 10);
  const find = (w: string) => kws.find((k) => k.word === w);
  assert.equal(find("難易度")?.count, 2);
  assert.equal(find("ストーリー")?.count, 1);
  assert.ok(kws[0].count >= kws[kws.length - 1].count);
});

test("ストップワード・短すぎる語は除外される", () => {
  const kws = topKeywords([mk("この ゲーム は とても 面白い です")], 10);
  const words = kws.map((k) => k.word);
  assert.ok(!words.includes("ゲーム"));
  assert.ok(!words.includes("です"));
});

test("英単語は小文字化されて3文字以上のみ拾う", () => {
  const kws = topKeywords([mk("BOSS戦が良い。boss is hard. ok")], 10);
  const boss = kws.find((k) => k.word === "boss");
  assert.equal(boss?.count, 1); // 同一レビュー内なので1
  assert.ok(!kws.some((k) => k.word === "ok"));
});

test("空配列でもクラッシュしない", () => {
  assert.deepEqual(topKeywords([], 10), []);
});
