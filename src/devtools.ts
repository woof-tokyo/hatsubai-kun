/**
 * 開発者向けツール群（Steamworks パートナー財務API）。
 * STEAM_PUBLISHER_KEY があるときだけ登録される。
 * すべて読み取り専用。返るのは「キーの持ち主自身」の売上・ウィッシュリストデータ。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sleep } from "./steam/client.js";
import {
  getChangedDates,
  getDetailedSales,
  getAppNamesForDate,
  getWishlistDay,
  type SalesLineItem,
  type WishlistDay,
} from "./steam/partner.js";
import { aggregateSales, aggregateWishlist, dateRange } from "./analyze/finance.js";
import { getDetails } from "./steam/details.js";
import {
  detectLastDiscountDate,
  validateSalePlan,
  SALE_SETUP_STEPS,
  DISCOUNT_RULES,
} from "./analyze/saleplan.js";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");
const MAX_RANGE_DAYS = 92;

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

function clampRange(from: string, to: string): string[] {
  const days = dateRange(from, to);
  if (days.length === 0) throw new Error("from は to 以前の日付にしてください");
  if (days.length > MAX_RANGE_DAYS)
    throw new Error(`期間が長すぎます（最大 ${MAX_RANGE_DAYS} 日）`);
  return days;
}

export function registerDevTools(server: McpServer, key: string): void {
  server.registerTool(
    "list_my_steam_titles",
    {
      title: "自分のSteamタイトル一覧（財務APIから自動取得）",
      description:
        "財務API（売上明細）から、あなた自身のSteamタイトルを AppID＋ゲーム名つきで自動列挙する。" +
        "AppIDを手入力しなくても、これで登録対象（store_url含む）が分かる。" +
        "「Steamの自分のゲームを発売くんに登録して」と言われたら、まずこれを呼んでタイトルを特定し、" +
        "ユーザーに一覧を見せて確認を取ってから register_game する。" +
        "（売上のあった期間からタイトルを拾うため、lookback_days を十分に取ると取りこぼしが減る）",
      inputSchema: {
        lookback_days: z
          .number()
          .int()
          .min(7)
          .max(3650)
          .default(730)
          .describe("さかのぼる日数（既定730＝約2年。古い作品も拾いたいなら長く）"),
      },
    },
    async ({ lookback_days }) => {
      const allDates = await getChangedDates(key); // 売上のある全日付（YYYY-MM-DD）
      const cutoff = new Date(Date.now() - lookback_days * 86_400_000)
        .toISOString()
        .slice(0, 10);
      // 期間内の新しい日付から走査（APIコールは上限を設けて暴走防止）
      const dates = allDates
        .filter((d) => d >= cutoff)
        .sort()
        .reverse()
        .slice(0, 200);
      const names = new Map<number, string>();
      for (const date of dates) {
        for (const [id, name] of await getAppNamesForDate(key, date)) {
          if (!names.has(id)) names.set(id, name);
        }
        await sleep(200);
      }
      const titles = [...names.entries()]
        .map(([appid, name]) => ({
          appid,
          name,
          store_url: `https://store.steampowered.com/app/${appid}/`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const text = titles.length
        ? `あなたのSteamタイトル ${titles.length}件（過去${lookback_days}日の売上データから自動取得）:\n` +
          titles.map((t) => `- ${t.name}（AppID ${t.appid}）`).join("\n") +
          `\n\nこの中から発売くんに登録したいものを選んでください（登録は非公開の下書き→Webで公開）。`
        : `過去${lookback_days}日の売上データからタイトルを検出できませんでした。lookback_days を長くして再実行してください。`;
      return reply(text, { titles });
    },
  );

  server.registerTool(
    "get_sales_dates",
    {
      title: "売上データのある日付一覧",
      description:
        "自分のパートナーアカウントで売上が発生した日付の一覧を返す。" +
        "get_sales_report の期間を決める前の下調べに使う。",
      inputSchema: {
        recent: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(30)
          .describe("直近何件の日付を返すか"),
      },
    },
    async ({ recent }) => {
      const dates = await getChangedDates(key);
      const tail = dates.slice(-recent);
      return reply(
        `売上データのある日: 全${dates.length}日。直近${tail.length}件を返します（最新: ${dates.at(-1) ?? "なし"}）`,
        { total_days: dates.length, recent_dates: tail },
      );
    },
  );

  server.registerTool(
    "get_sales_report",
    {
      title: "売上レポート（期間集計）",
      description:
        "自分のタイトルの売上明細を期間指定で取得し、合計 / アプリ別 / 国別 / 日別に集計して返す。" +
        "金額は Steam が報告する USD ネット売上ベース。",
      inputSchema: {
        from: DATE.describe("開始日 YYYY-MM-DD"),
        to: DATE.describe("終了日 YYYY-MM-DD"),
      },
    },
    async ({ from, to }) => {
      const requested = new Set(clampRange(from, to));
      // 売上のある日だけ取得してAPI呼び出しを最小化
      const withData = (await getChangedDates(key)).filter((d) => requested.has(d));

      const items: SalesLineItem[] = [];
      const appNames = new Map<number, string>();
      for (const date of withData) {
        const r = await getDetailedSales(key, date);
        items.push(...r.items);
        for (const [id, name] of r.appNames) appNames.set(id, name);
        await sleep(250);
      }

      const agg = aggregateSales(items, appNames, from, to);
      const top = agg.byApp[0];
      const text =
        `売上レポート ${from} 〜 ${to}\n` +
        `純販売本数: ${agg.totals.net_units}本 / 純売上: $${agg.totals.net_sales_usd}` +
        `（返品 ${agg.totals.returned_units}本）\n` +
        `売上のあった日: ${withData.length}日\n` +
        (top ? `トップ: ${top.app_name}（$${top.net_sales_usd} / ${top.net_units}本）` : "期間内の売上はありません");
      return reply(text, agg);
    },
  );

  server.registerTool(
    "get_wishlist_report",
    {
      title: "ウィッシュリストレポート（期間集計）",
      description:
        "自分のタイトルの日次ウィッシュリスト（追加/削除/購入転換）を期間指定で取得し、" +
        "推移と国別内訳に集計して返す。appid は自分のタイトルのもの。",
      inputSchema: {
        appid: z.number().int().describe("自分のタイトルの AppID"),
        from: DATE.describe("開始日 YYYY-MM-DD"),
        to: DATE.describe("終了日 YYYY-MM-DD"),
      },
    },
    async ({ appid, from, to }) => {
      const days = clampRange(from, to);
      const results: WishlistDay[] = [];
      for (const date of days) {
        try {
          results.push(await getWishlistDay(key, appid, date));
        } catch {
          // データの無い日はスキップ（終端でまとめて報告）
        }
        await sleep(250);
      }

      const agg = aggregateWishlist(results, appid, from, to);
      const text =
        `ウィッシュリストレポート AppID ${appid} / ${from} 〜 ${to}\n` +
        `追加 ${agg.totals.adds} / 削除 ${agg.totals.deletes} / ネット ${agg.totals.net >= 0 ? "+" : ""}${agg.totals.net}\n` +
        `購入転換 ${agg.totals.purchases} / ギフト ${agg.totals.gifts}\n` +
        `取得できた日数: ${results.length}/${days.length}`;
      return reply(text, agg);
    },
  );

  server.registerTool(
    "plan_sale",
    {
      title: "セールプランナー（割引計画の検証）",
      description:
        "計画中のカスタム割引が Steam の公式ルール（30日クールダウン、リリース後30日、" +
        "10〜95%、最長14日 等）に違反しないかを、自分の売上データ（過去の割引販売の検出）と" +
        "ストア情報（発売日）を使って検証し、設定手順チェックリスト付きの実行プランを返す。" +
        "実際の設定はパートナーサイトで行う（このツールは読み取りのみで何も変更しない）。",
      inputSchema: {
        appid: z.number().int().describe("自分のタイトルの AppID"),
        discount_percent: z.number().int().min(1).max(99).describe("割引率（%）"),
        start_date: DATE.describe("割引開始日 YYYY-MM-DD"),
        end_date: DATE.describe("割引終了日 YYYY-MM-DD"),
      },
    },
    async ({ appid, discount_percent, start_date, end_date }) => {
      // 発売日（公開ストアAPIから。日本語表記をパース）
      let releaseDate: string | null = null;
      let appName = String(appid);
      try {
        const d = await getDetails(appid);
        appName = d.name;
        const m = d.release_date?.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (m)
          releaseDate = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      } catch {
        // ストア情報が取れなくても検証は続行（発売日チェックのみスキップ）
      }

      // 直近120日の売上から過去の割引販売を検出
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.now() - 120 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const recentDates = (await getChangedDates(key))
        .filter((d) => d >= cutoff)
        .slice(-40); // API呼び出し上限
      const items = [];
      for (const date of recentDates) {
        const r = await getDetailedSales(key, date);
        items.push(...r.items.filter((i) => i.primary_appid === appid));
        await sleep(250);
      }
      const lastDiscountDate = detectLastDiscountDate(items);

      const verdict = validateSalePlan({
        startDate: start_date,
        endDate: end_date,
        percent: discount_percent,
        today,
        releaseDate,
        lastDiscountDate,
      });

      const text =
        `セールプラン検証: ${appName}（${appid}） ${discount_percent}% / ${start_date}〜${end_date}\n` +
        `判定: ${verdict.ok ? "✅ ルール上は設定可能" : "❌ このままでは設定できません"}\n` +
        (verdict.issues.length ? `違反:\n- ${verdict.issues.join("\n- ")}\n` : "") +
        (verdict.warnings.length ? `要確認:\n- ${verdict.warnings.join("\n- ")}\n` : "") +
        (verdict.notes.length ? `メモ:\n- ${verdict.notes.join("\n- ")}\n` : "") +
        (verdict.ok ? `設定手順:\n${SALE_SETUP_STEPS.join("\n")}` : "");
      return reply(text, {
        app: { appid, name: appName, release_date: releaseDate },
        plan: { discount_percent, start_date, end_date },
        detected_last_discount_sale: lastDiscountDate,
        verdict,
        rules: DISCOUNT_RULES,
        setup_steps: SALE_SETUP_STEPS,
      });
    },
  );
}
