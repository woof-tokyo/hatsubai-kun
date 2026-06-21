import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** 分析の「型」をサーバー側から提供し、出力品質を揃える Prompt 群。 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "marketing_report_jp",
    {
      title: "日本市場向けマーケレポート",
      description:
        "summarize_reviews の結果(JSON)を渡すと、日本語の販促・改善レポートを生成する型。",
      argsSchema: {
        game: z.string().describe("対象ゲーム名"),
        summary_json: z.string().describe("summarize_reviews の出力JSON"),
      },
    },
    ({ game, summary_json }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `あなたは Steam 向けの日本市場マーケ担当です。以下はゲーム「${game}」の` +
              `レビュー集計結果(JSON)です。\n\n${summary_json}\n\n` +
              `次の見出しで日本語レポートを作成してください:\n` +
              `1) 総評と肯定率の解釈\n2) 評価されている点（上位）\n3) 不満・要望（上位）\n` +
              `4) 報告されている不具合\n5) 日本市場向けの具体施策（ストアページ改善 / 価格・セール / SNS訴求コピー案）\n` +
              `6) アップデート優先度の提案\n` +
              `断定しすぎず、根拠（レビュー傾向・頻出語）を併記すること。`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "store_copy_jp",
    {
      title: "Steamストア日本語コピー生成",
      description:
        "好評ポイント（集計JSON）から Steam ストア用の日本語短文コピー案を生成する型。",
      argsSchema: {
        game: z.string(),
        summary_json: z.string(),
      },
    },
    ({ game, summary_json }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `ゲーム「${game}」のレビュー集計(JSON)です。\n\n${summary_json}\n\n` +
              `好評ポイントを根拠に、Steam ストアページ用の日本語キャッチコピーを5案、` +
              `各案に「狙い」を1行で添えて提案してください。誇大表現は避け、レビューで実際に` +
              `評価されている要素のみを使うこと。`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "competitor_brief_jp",
    {
      title: "競合比較ブリーフ",
      description:
        "compare_games の結果(JSON)から、競合比較と自タイトルの差別化提案を日本語で生成する型。",
      argsSchema: {
        compare_json: z.string().describe("compare_games の出力JSON"),
        our_title: z.string().optional().describe("自タイトル名（あれば）"),
      },
    },
    ({ compare_json, our_title }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `以下は複数 Steam タイトルの比較データ(JSON)です。\n\n${compare_json}\n\n` +
              (our_title ? `自タイトルは「${our_title}」です。\n` : "") +
              `各タイトルの強み・弱みを比較表で整理し、` +
              `日本市場で勝つための差別化ポイントと訴求方針を提案してください。`,
          },
        },
      ],
    }),
  );
}
