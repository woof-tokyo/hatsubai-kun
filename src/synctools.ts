/**
 * 同期ツール（push型）。
 * STEAM_PUBLISHER_KEY（取得）と 有効な HATSUBAIKUN_KEY（送信）の両方がそろうときだけ登録される。
 *
 * 設計の肝: Steam財務キーはこのPCから出ない。
 * パートナー財務APIへの問い合わせはローカルで行い、発売くんサーバーへ送るのは
 * 集計済みの「数値だけ」（本数・金額・WL増減など）。鍵そのものは絶対に送らない。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getChangedDates,
  getDetailedSales,
  getWishlistDay,
  type SalesLineItem,
  type WishlistDay,
} from "./steam/partner.js";
import { aggregateSales, aggregateWishlist, dateRange } from "./analyze/finance.js";
import { syncSales, deleteSalesSnapshot } from "./platform/client.js";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");
const MAX_RANGE_DAYS = 92;

/** YYYY-MM-DD を n 日ずらす（負で過去）。 */
function shiftDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 今日（UTC）の YYYY-MM-DD。 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 同時実行数を制限して非同期処理を並列実行する（結果は入力順）。
 * Steamのレート制限対策に同時数を抑える。失敗時の再試行は各fetch側に任せる。
 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function reply(text: string, data: unknown) {
  return {
    content: [
      { type: "text" as const, text },
      {
        type: "text" as const,
        text: "```json\n" + JSON.stringify(data, null, 2) + "\n```",
      },
    ],
  };
}

export function registerSyncTools(
  server: McpServer,
  opts: { publisherKey: string; hkKey: string },
): void {
  const { publisherKey, hkKey } = opts;

  server.registerTool(
    "sync_sales_to_dashboard",
    {
      title: "売上・WLを発売くんダッシュボードに同期",
      description:
        "自分の売上とウィッシュリストを期間集計し、その『数値だけ』を発売くんのWebダッシュボードへ送って" +
        "グラフ表示できるようにする。Steam財務キーはこのPCから出ず、発売くんのサーバーには送信されない" +
        "（送られるのは集計済みの本数・金額・WL増減などの数値のみ）。" +
        "Webの「売上・WL分析」画面に反映される。" +
        "\n累計（発売来すべて）を見たいときは all_time:true を指定する（from/to不要）。" +
        "期間指定は最大92日、all_time は売上のある全日付を取得する。",
      inputSchema: {
        from: DATE.optional().describe("開始日 YYYY-MM-DD（all_time時は不要）"),
        to: DATE.optional().describe("終了日 YYYY-MM-DD（all_time時は不要）"),
        all_time: z
          .boolean()
          .optional()
          .describe("発売来の累計を集計する（売上のある全日付。from/toは無視）"),
        wishlist_appids: z
          .array(z.number().int())
          .optional()
          .describe("ウィッシュリストも同期する自分のAppID（任意・複数可）"),
        wishlist_from: DATE.optional().describe(
          "WL取得の開始日 YYYY-MM-DD（プレローンチも遡りたいとき。all_time時の既定は売上開始の約1年前）",
        ),
      },
    },
    async ({ from, to, all_time, wishlist_appids, wishlist_from }) => {
      // 売上のある全日付（財務APIが返す。空でない日のみ）。
      const changed = (await getChangedDates(publisherKey)).slice().sort();

      let salesDates: string[];
      let effFrom: string;
      let effTo: string;
      if (all_time) {
        if (changed.length === 0) throw new Error("売上データが1件もありません");
        effFrom = changed[0];
        effTo = changed[changed.length - 1];
        salesDates = changed; // 全期間：売上のある全日付を取得
      } else {
        if (!from || !to) throw new Error("from と to を指定してください（または all_time:true）");
        const allDays = dateRange(from, to);
        if (allDays.length === 0) throw new Error("from は to 以前の日付にしてください");
        if (allDays.length > MAX_RANGE_DAYS)
          throw new Error(`期間が長すぎます（最大 ${MAX_RANGE_DAYS} 日）。累計は all_time:true で。`);
        const requested = new Set(allDays);
        salesDates = changed.filter((d) => requested.has(d));
        effFrom = from;
        effTo = to;
      }

      // --- 売上をローカルで取得・集計（鍵はここから出ない）---
      // 並列プールで高速化（429/5xxは partnerGet 側がバックオフ再試行）。
      const items: SalesLineItem[] = [];
      const appNames = new Map<number, string>();
      const salesResults = await mapPool(salesDates, 4, (date) =>
        getDetailedSales(publisherKey, date),
      );
      for (const r of salesResults) {
        items.push(...r.items);
        for (const [id, name] of r.appNames) appNames.set(id, name);
      }
      const sales = aggregateSales(items, appNames, effFrom, effTo);

      // --- ウィッシュリスト（任意・指定AppIDごと）---
      // WLは日次取得（売上のような"変更のある日"一覧が無い）。
      // all_time時はプレローンチも拾うため売上開始の約1年前から今日まで。安全上限3年。
      const WL_HARD_CAP = 1095; // 3年
      let wlStart: string;
      let wlEnd: string;
      if (all_time) {
        wlStart = wishlist_from ?? shiftDays(effFrom, -365);
        wlEnd = todayUtc();
      } else {
        wlStart = wishlist_from ?? (from as string);
        wlEnd = to as string;
      }
      let wlDays = dateRange(wlStart, wlEnd);
      let wlTruncated = false;
      if (wlDays.length > WL_HARD_CAP) {
        wlDays = wlDays.slice(-WL_HARD_CAP);
        wlTruncated = true;
      }
      const wishlist = [];
      for (const appid of wishlist_appids ?? []) {
        // 日次取得を並列プールで高速化（同時6・順序は問わない）。
        const settled = await mapPool(wlDays, 6, async (date) => {
          try {
            return await getWishlistDay(publisherKey, appid, date);
          } catch {
            // データの無い日（ストアページ公開前など）はスキップ
            return null;
          }
        });
        const days = settled.filter((d): d is WishlistDay => d !== null);
        wishlist.push(aggregateWishlist(days, appid, wlDays[0], wlDays[wlDays.length - 1]));
      }

      // --- 送信ペイロード（数値のみ。鍵は含めない）---
      const payload = { range: { from: effFrom, to: effTo, all_time: !!all_time }, sales, wishlist };
      const r = await syncSales(hkKey, payload);

      const text =
        `ダッシュボードに同期しました（${all_time ? "累計 " : ""}${effFrom}〜${effTo}）。\n` +
        `純売上 $${sales.totals.net_sales_usd} / ${sales.totals.net_units}本` +
        (wishlist.length ? ` / WL ${wishlist.length}タイトル（${wlDays[0]}〜${wlDays[wlDays.length - 1]}）` : "") +
        (wlTruncated ? `\n※ WLは安全上限により直近${WL_HARD_CAP}日分のみ集計。` : "") +
        `\nWebの「売上・WL分析」画面で確認できます。\n` +
        `※ 送信したのは集計済みの数値のみ。財務キーはこのPCから送られていません。`;
      return reply(text, {
        synced_at: r.snapshot?.synced_at ?? null,
        all_time: !!all_time,
        range: { from: effFrom, to: effTo },
        totals: sales.totals,
        days_with_sales: salesDates.length,
        wishlist_titles: wishlist.length,
        wishlist_truncated: wlTruncated,
      });
    },
  );

  server.registerTool(
    "clear_dashboard_sales",
    {
      title: "ダッシュボードの売上データを削除",
      description:
        "発売くんのWebダッシュボードに同期済みの売上・WLの数値を、サーバーから完全に削除する。",
      inputSchema: {},
    },
    async () => {
      const r = await deleteSalesSnapshot(hkKey);
      return reply(
        r.ok
          ? "ダッシュボードの売上データを削除しました。"
          : "削除対象の売上データはありませんでした。",
        r,
      );
    },
  );
}
