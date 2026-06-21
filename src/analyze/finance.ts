import type { SalesLineItem, WishlistDay } from "../steam/partner.js";

export interface SalesAggregate {
  from: string;
  to: string;
  totals: {
    net_units: number;
    gross_units: number;
    returned_units: number;
    net_sales_usd: number;
    gross_sales_usd: number;
  };
  byApp: {
    appid: number;
    app_name: string;
    net_units: number;
    net_sales_usd: number;
  }[];
  byCountry: { country_code: string; net_units: number; net_sales_usd: number }[];
  byDate: { date: string; net_units: number; net_sales_usd: number }[];
  byPlatform: { platform: string; net_units: number; net_sales_usd: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 売上明細を 期間合計 / アプリ別 / 国別 / 日別 に集計する。 */
export function aggregateSales(
  items: SalesLineItem[],
  appNames: Map<number, string>,
  from: string,
  to: string,
): SalesAggregate {
  const totals = {
    net_units: 0,
    gross_units: 0,
    returned_units: 0,
    net_sales_usd: 0,
    gross_sales_usd: 0,
  };
  const byApp = new Map<number, { units: number; usd: number }>();
  const byCountry = new Map<string, { units: number; usd: number }>();
  const byDate = new Map<string, { units: number; usd: number }>();
  const byPlatform = new Map<string, { units: number; usd: number }>();

  for (const it of items) {
    const net = Number(it.net_sales_usd) || 0;
    const gross = Number(it.gross_sales_usd) || 0;
    totals.net_units += it.net_units_sold || 0;
    totals.gross_units += it.gross_units_sold || 0;
    totals.returned_units += it.gross_units_returned || 0;
    totals.net_sales_usd += net;
    totals.gross_sales_usd += gross;

    const app = byApp.get(it.primary_appid) ?? { units: 0, usd: 0 };
    app.units += it.net_units_sold || 0;
    app.usd += net;
    byApp.set(it.primary_appid, app);

    const c = byCountry.get(it.country_code) ?? { units: 0, usd: 0 };
    c.units += it.net_units_sold || 0;
    c.usd += net;
    byCountry.set(it.country_code, c);

    const d = byDate.get(it.date) ?? { units: 0, usd: 0 };
    d.units += it.net_units_sold || 0;
    d.usd += net;
    byDate.set(it.date, d);

    const plat = (it.platform || "Unknown").trim() || "Unknown";
    const p = byPlatform.get(plat) ?? { units: 0, usd: 0 };
    p.units += it.net_units_sold || 0;
    p.usd += net;
    byPlatform.set(plat, p);
  }

  return {
    from,
    to,
    totals: {
      ...totals,
      net_sales_usd: r2(totals.net_sales_usd),
      gross_sales_usd: r2(totals.gross_sales_usd),
    },
    byApp: [...byApp.entries()]
      .map(([appid, v]) => ({
        appid,
        app_name: appNames.get(appid) ?? String(appid),
        net_units: v.units,
        net_sales_usd: r2(v.usd),
      }))
      .sort((a, b) => b.net_sales_usd - a.net_sales_usd),
    byCountry: [...byCountry.entries()]
      .map(([country_code, v]) => ({
        country_code,
        net_units: v.units,
        net_sales_usd: r2(v.usd),
      }))
      .sort((a, b) => b.net_sales_usd - a.net_sales_usd),
    byDate: [...byDate.entries()]
      .map(([date, v]) => ({ date, net_units: v.units, net_sales_usd: r2(v.usd) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byPlatform: [...byPlatform.entries()]
      .map(([platform, v]) => ({ platform, net_units: v.units, net_sales_usd: r2(v.usd) }))
      .sort((a, b) => b.net_sales_usd - a.net_sales_usd),
  };
}

export interface WishlistAggregate {
  appid: number;
  from: string;
  to: string;
  totals: { adds: number; deletes: number; purchases: number; gifts: number; net: number };
  byDate: { date: string; adds: number; deletes: number; purchases: number; net: number }[];
  byCountry: { country_code: string; adds: number; deletes: number }[];
  platform: { windows: number; mac: number; linux: number };
}

/** 日次ウィッシュリストレポートを期間で集計する。 */
export function aggregateWishlist(
  days: WishlistDay[],
  appid: number,
  from: string,
  to: string,
): WishlistAggregate {
  const totals = { adds: 0, deletes: 0, purchases: 0, gifts: 0, net: 0 };
  const platform = { windows: 0, mac: 0, linux: 0 };
  const byCountry = new Map<string, { adds: number; deletes: number }>();
  const byDate: WishlistAggregate["byDate"] = [];

  for (const day of days) {
    const s = day.wishlist_summary;
    if (!s) continue;
    totals.adds += s.wishlist_adds;
    totals.deletes += s.wishlist_deletes;
    totals.purchases += s.wishlist_purchases;
    totals.gifts += s.wishlist_gifts;
    platform.windows += s.wishlist_adds_windows ?? 0;
    platform.mac += s.wishlist_adds_mac ?? 0;
    platform.linux += s.wishlist_adds_linux ?? 0;
    byDate.push({
      date: day.date,
      adds: s.wishlist_adds,
      deletes: s.wishlist_deletes,
      purchases: s.wishlist_purchases,
      net: s.wishlist_adds - s.wishlist_deletes,
    });
    for (const c of day.country_summary ?? []) {
      const e = byCountry.get(c.country_code) ?? { adds: 0, deletes: 0 };
      e.adds += c.summary_actions.wishlist_adds;
      e.deletes += c.summary_actions.wishlist_deletes;
      byCountry.set(c.country_code, e);
    }
  }
  totals.net = totals.adds - totals.deletes;

  return {
    appid,
    from,
    to,
    totals,
    platform,
    byDate: byDate.sort((a, b) => a.date.localeCompare(b.date)),
    byCountry: [...byCountry.entries()]
      .map(([country_code, v]) => ({ country_code, ...v }))
      .sort((a, b) => b.adds - a.adds),
  };
}

/** YYYY-MM-DD 同士の日付範囲を列挙（両端含む）。 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
