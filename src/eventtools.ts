/**
 * インディーイベント連携ツール。
 * - list_events: 公開イベント検索（approvedのみ・キー不要）
 * - submit_event: 掲載申請（HATSUBAIKUN_KEY があるときのみ・pendingで投入）
 * 自動取得・スクレイピングは行わない（公式情報の要約＋出典リンクが基本）。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listEvents, submitEvent } from "./platform/client.js";

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

const FORMAT_LABEL: Record<string, string> = {
  online: "オンライン",
  offline: "現地",
  hybrid: "オンライン＋現地",
};

/**
 * @param key 有効な発売くんキー。あれば submit_event も登録する。
 *            未指定でも list_events（公開・キー不要）は登録される。
 */
export function registerEventTools(server: McpServer, key?: string): void {
  // 公開イベント検索（誰でも・キー不要）
  server.registerTool(
    "list_events",
    {
      title: "インディーイベント検索",
      description:
        "発売くんに掲載されたインディーゲーム系イベント（Steam Next Fest / BitSummit / 東京ゲームショウ インディー / Day of the Devs / オンラインショーケース等）を検索する。公開済み(approved)のみ。キー不要。多くは公式ソースから自動収集され継続更新される。",
      inputSchema: {
        q: z.string().optional().describe("名称・概要・開催地で絞り込み"),
        tag: z.string().optional().describe("タグで絞り込み（例: オンライン, 関西）"),
        format: z.enum(["online", "offline", "hybrid"]).optional().describe("開催形式"),
        from: z.string().optional().describe("この日以降に開催 YYYY-MM-DD"),
        to: z.string().optional().describe("この日以前に開始 YYYY-MM-DD"),
        deadline_before: z.string().optional().describe("応募締切がこの日以前 YYYY-MM-DD"),
        only_open: z.boolean().optional().describe("応募締切が未到来のものだけ"),
        upcoming: z.boolean().optional().describe("開催が未終了（これからのイベント）だけ"),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async ({ q, tag, format, from, to, deadline_before, only_open, upcoming, limit }) => {
      const r = await listEvents({ q, tag, format, from, to, deadline_before, only_open, upcoming, limit });
      const events = r.events ?? [];
      const text =
        `インディーイベント ${events.length}件` +
        (q || tag ? `（${[q && `「${q}」`, tag && `#${tag}`].filter(Boolean).join(" ")}）` : "") +
        ":\n" +
        events
          .map((e: any) => {
            const date = e.starts_at ? e.starts_at + (e.ends_at && e.ends_at !== e.starts_at ? `〜${e.ends_at}` : "") : "日程未定";
            const fmt = e.format ? FORMAT_LABEL[e.format] ?? e.format : "—";
            const dl = e.deadline ? ` / 締切${e.deadline}` : "";
            return `- [${e.id}] ${e.title}（${date} / ${fmt}${dl}）${e.url}`;
          })
          .join("\n");
      return reply(text, events);
    },
  );

  // 掲載申請（要キー）。pendingで投入され、woof承認で公開。
  if (key) {
    server.registerTool(
      "submit_event",
      {
        title: "イベント掲載を申請",
        description:
          "インディーゲーム系イベントの掲載を発売くんに申請する。公式URL必須。申請は status=pending で入り、woofの承認後に /events で公開される（即時公開ではない）。他者主催イベントは公式情報の要約＋出典リンクに留め、ロゴ等の無断転載はしないこと。",
        inputSchema: {
          title: z.string().describe("イベント名"),
          url: z.string().describe("公式リンク（出典・必須）"),
          kind: z.string().optional().describe("種別（フェス/ショーケース/展示会 等）"),
          starts_at: z.string().optional().describe("開始日 YYYY-MM-DD"),
          ends_at: z.string().optional().describe("終了日 YYYY-MM-DD"),
          deadline: z.string().optional().describe("応募・出展締切 YYYY-MM-DD"),
          location: z.string().optional().describe("開催地（現地の場合）"),
          format: z.enum(["online", "offline", "hybrid"]).optional().describe("開催形式"),
          fee: z.string().optional().describe("参加・出展費"),
          tags: z.array(z.string()).optional().describe("タグの配列"),
          description: z.string().optional().describe("公式情報の要約（本文の丸写しはしない）"),
        },
      },
      async (args) => {
        const r = await submitEvent(key, args);
        return reply(
          `「${r.event.title}」の掲載を申請しました（id: ${r.event.id} / status: ${r.event.status}）。woofの承認後に公開されます。`,
          r.event,
        );
      },
    );
  }

  // 将来実装: suggest_events_for_me
  // 自分のゲーム（get_my_dashboard のジャンル・発売状況）と list_events のタグ/形式を
  // 突き合わせて「参加すべきイベント」を提案する。今回は未実装（半自動取得とあわせて将来PRで）。
}
