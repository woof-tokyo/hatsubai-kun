/**
 * IPartnerFinancialsService（Steamworks パートナー財務API）クライアント。
 * - ホストは api.steampowered.com（partner.steam-api.com ではない）
 * - キーは「ファイナンシャルAPIグループ」発行の専用キー（他サービスは403）
 * - 2026-06-12 に実データで検証済みの3エンドポイントのみ実装
 * キーをログ・例外メッセージに含めないこと。
 */
import { sleep } from "./client.js";

const HOST = "https://api.steampowered.com";
const SERVICE = "IPartnerFinancialsService";
const REQUEST_TIMEOUT_MS = 15_000;

export interface SalesLineItem {
  date: string;
  line_item_type: string;
  packageid?: number;
  bundleid?: number;
  package_sale_type?: string;
  platform?: string;
  country_code: string;
  base_price?: string;
  sale_price?: string;
  currency?: string;
  gross_units_sold: number;
  gross_units_returned: number;
  gross_sales_usd: string;
  gross_returns_usd: string;
  net_tax_usd: string;
  primary_appid: number;
  net_units_sold: number;
  net_sales_usd: string;
}

export interface DetailedSalesResponse {
  results?: SalesLineItem[];
  app_info?: { appid: number; app_name: string }[];
  package_info?: unknown[];
  country_info?: unknown[];
  partner_info?: { partnerid: number; partner_name: string }[];
  max_id: string;
}

export interface WishlistActions {
  wishlist_adds: number;
  wishlist_deletes: number;
  wishlist_purchases: number;
  wishlist_gifts: number;
  wishlist_adds_windows: number;
  wishlist_adds_mac: number;
  wishlist_adds_linux: number;
}

export interface WishlistDay {
  appid: number;
  date: string;
  wishlist_summary: WishlistActions;
  country_summary?: { country_code: string; summary_actions: WishlistActions }[];
}

async function partnerGet(
  key: string,
  method: string,
  params: Record<string, string | number>,
): Promise<any> {
  const url = new URL(`/${SERVICE}/${method}/v1/`, HOST);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

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
      if (res.status === 403) {
        throw new Error(
          `Steam パートナーAPIが 403 を返しました。STEAM_PUBLISHER_KEY が` +
            `「ファイナンシャルAPIグループ」のキーであること、財務権限があることを確認してください。`,
        );
      }
      if (!res.ok) throw new Error(`Steam パートナーAPI ${res.status} (${method})`);
      const json = await res.json();
      return json?.response ?? {};
    } catch (err) {
      if (err instanceof Error && err.message.includes("403")) throw err;
      if (attempt === 3) throw new Error(`Steam パートナーAPI 呼び出し失敗 (${method})`);
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(`Steam パートナーAPI 呼び出し失敗 (${method})`);
}

/** 売上データが存在する日付の一覧（YYYY/MM/DD 形式で返る）。 */
export async function getChangedDates(key: string): Promise<string[]> {
  const r = await partnerGet(key, "GetChangedDatesForPartner", { highwatermark: 0 });
  return (r.dates ?? []).map((d: string) => d.replace(/\//g, "-"));
}

/** 指定日の売上明細（highwatermark_id ページングを内部で集約）。 */
export async function getDetailedSales(
  key: string,
  date: string,
): Promise<{ items: SalesLineItem[]; appNames: Map<number, string> }> {
  const items: SalesLineItem[] = [];
  const appNames = new Map<number, string>();
  let watermark = "0";

  for (let page = 0; page < 50; page++) {
    const r: DetailedSalesResponse = await partnerGet(key, "GetDetailedSales", {
      date,
      highwatermark_id: watermark,
    });
    for (const a of r.app_info ?? []) appNames.set(a.appid, a.app_name);
    const batch = r.results ?? [];
    items.push(...batch);
    const next = String(r.max_id ?? "0");
    if (batch.length === 0 || next === watermark || next === "0") break;
    watermark = next;
    await sleep(250);
  }
  return { items, appNames };
}

/**
 * 指定日の app_info だけを軽量取得（自分のタイトル列挙用。明細ページングはしない）。
 * GetDetailedSales の先頭ページに、その日売上のあった全タイトルの appid/app_name が入る。
 */
export async function getAppNamesForDate(
  key: string,
  date: string,
): Promise<Map<number, string>> {
  const r: DetailedSalesResponse = await partnerGet(key, "GetDetailedSales", {
    date,
    highwatermark_id: "0",
  });
  const m = new Map<number, string>();
  for (const a of r.app_info ?? []) m.set(a.appid, a.app_name);
  return m;
}

/** 指定アプリ・指定日のウィッシュリスト日次レポート。 */
export async function getWishlistDay(
  key: string,
  appid: number,
  date: string,
): Promise<WishlistDay> {
  return partnerGet(key, "GetAppWishlistReporting", { appid, date });
}
