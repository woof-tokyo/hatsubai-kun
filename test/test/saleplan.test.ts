import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectLastDiscountDate,
  validateSalePlan,
} from "../src/analyze/saleplan.js";
import type { SalesLineItem } from "../src/steam/partner.js";

const sale = (date: string, base: string, salePrice: string): SalesLineItem => ({
  date,
  line_item_type: "Package",
  country_code: "JP",
  base_price: base,
  sale_price: salePrice,
  gross_units_sold: 1,
  gross_units_returned: 0,
  gross_sales_usd: "1",
  gross_returns_usd: "0",
  net_tax_usd: "0",
  primary_appid: 1,
  net_units_sold: 1,
  net_sales_usd: "1",
});

test("割引販売の検出: sale_price < base_price の最新日", () => {
  const items = [
    sale("2026-05-01", "1000", "1000"), // 定価
    sale("2026-05-10", "1000", "700"), // 割引
    sale("2026-05-12", "1000", "700"), // 割引（最新）
    sale("2026-05-20", "1000", "1000"),
  ];
  assert.equal(detectLastDiscountDate(items), "2026-05-12");
  assert.equal(detectLastDiscountDate([sale("2026-05-01", "1000", "1000")]), null);
});

const base = {
  startDate: "2026-07-01",
  endDate: "2026-07-07",
  percent: 30,
  today: "2026-06-13",
  releaseDate: "2025-01-01",
  lastDiscountDate: null as string | null,
};

test("正常なプランは ok", () => {
  const v = validateSalePlan({ ...base });
  assert.equal(v.ok, true);
  assert.deepEqual(v.issues, []);
});

test("30日クールダウン違反を検出", () => {
  const v = validateSalePlan({ ...base, lastDiscountDate: "2026-06-20" });
  assert.equal(v.ok, false);
  assert.match(v.issues[0], /30日間/);
});

test("クールダウン明けは ok", () => {
  const v = validateSalePlan({ ...base, lastDiscountDate: "2026-05-01" });
  assert.equal(v.ok, true);
});

test("リリース後30日ルールを検出", () => {
  const v = validateSalePlan({ ...base, releaseDate: "2026-06-20" });
  assert.equal(v.ok, false);
  assert.match(v.issues.join(), /リリース/);
});

test("期間14日超・割引率範囲外・過去開始日を検出", () => {
  const v = validateSalePlan({
    ...base,
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    percent: 96,
  });
  assert.equal(v.ok, false);
  assert.equal(v.issues.length, 3); // 期間超過 + 率超過 + 過去開始
});

test("20%未満はウィッシュリスト通知なしのメモが付く", () => {
  const v = validateSalePlan({ ...base, percent: 15 });
  assert.equal(v.ok, true);
  assert.match(v.notes.join(), /自動通知は送られません/);
});
