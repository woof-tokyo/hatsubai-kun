import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSales, aggregateWishlist, dateRange } from "../src/analyze/finance.js";
import type { SalesLineItem, WishlistDay } from "../src/steam/partner.js";

const item = (over: Partial<SalesLineItem>): SalesLineItem => ({
  date: "2026-06-01",
  line_item_type: "Package",
  country_code: "JP",
  gross_units_sold: 1,
  gross_units_returned: 0,
  gross_sales_usd: "10.00",
  gross_returns_usd: "0",
  net_tax_usd: "0",
  primary_appid: 100,
  net_units_sold: 1,
  net_sales_usd: "7.00",
  ...over,
});

test("売上集計: 合計・アプリ別・国別・日別", () => {
  const names = new Map([[100, "Game A"], [200, "Game B"]]);
  const agg = aggregateSales(
    [
      item({}),
      item({ country_code: "US", net_sales_usd: "14.00", net_units_sold: 2, date: "2026-06-02" }),
      item({ primary_appid: 200, net_sales_usd: "3.50" }),
    ],
    names,
    "2026-06-01",
    "2026-06-02",
  );
  assert.equal(agg.totals.net_units, 4);
  assert.equal(agg.totals.net_sales_usd, 24.5);
  assert.equal(agg.byApp[0].app_name, "Game A"); // 21.0 で1位
  assert.equal(agg.byApp[0].net_sales_usd, 21);
  assert.equal(agg.byCountry[0].country_code, "US");
  assert.deepEqual(agg.byDate.map((d) => d.date), ["2026-06-01", "2026-06-02"]);
});

test("売上集計: 空でもクラッシュしない", () => {
  const agg = aggregateSales([], new Map(), "2026-06-01", "2026-06-01");
  assert.equal(agg.totals.net_units, 0);
  assert.deepEqual(agg.byApp, []);
});

const wday = (date: string, adds: number, deletes: number, cc = "JP"): WishlistDay => ({
  appid: 1,
  date,
  wishlist_summary: {
    wishlist_adds: adds,
    wishlist_deletes: deletes,
    wishlist_purchases: 0,
    wishlist_gifts: 0,
    wishlist_adds_windows: adds,
    wishlist_adds_mac: 0,
    wishlist_adds_linux: 0,
  },
  country_summary: [
    {
      country_code: cc,
      summary_actions: {
        wishlist_adds: adds,
        wishlist_deletes: deletes,
        wishlist_purchases: 0,
        wishlist_gifts: 0,
        wishlist_adds_windows: adds,
        wishlist_adds_mac: 0,
        wishlist_adds_linux: 0,
      },
    },
  ],
});

test("ウィッシュリスト集計: ネット増減と国別", () => {
  const agg = aggregateWishlist(
    [wday("2026-06-01", 3, 1, "JP"), wday("2026-06-02", 0, 2, "US")],
    1,
    "2026-06-01",
    "2026-06-02",
  );
  assert.equal(agg.totals.adds, 3);
  assert.equal(agg.totals.deletes, 3);
  assert.equal(agg.totals.net, 0);
  assert.equal(agg.byDate[0].net, 2);
  assert.equal(agg.byDate[1].net, -2);
  assert.equal(agg.byCountry[0].country_code, "JP"); // adds 順
});

test("dateRange: 両端を含み、逆順は空", () => {
  assert.deepEqual(dateRange("2026-06-01", "2026-06-03"), [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
  ]);
  assert.deepEqual(dateRange("2026-06-03", "2026-06-01"), []);
});
