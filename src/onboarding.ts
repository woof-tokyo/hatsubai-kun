import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * オンボーディング案内ツール。
 *
 * 発売くんキー(HATSUBAIKUN_KEY)が無いとプラットフォーム連携ツールは登録されず、
 * 「ゲームを登録したい」等の依頼にAIが応えられない。MCPは非対話なのでログインを
 * 促す画面も出せない。そこで接続状況に応じて「つなぎ方」を返すツールを常時登録し、
 * AI(Claude/Codex/Gemini)が自然に登録へ案内できるようにする。
 */
export interface ConnectStatus {
  hkKeyPresent: boolean;
  hkValid: boolean;
  studioName?: string | null;
  email?: string;
  publisherKeyPresent: boolean;
}

const CONFIG_EXAMPLES = (envName: string, valueHint: string) =>
  [
    `  Claude Code:`,
    `    claude mcp add hatsubai-kun --env ${envName}=${valueHint} -- npx -y @woof-tokyo/hatsubai-kun@latest`,
    `  Codex:`,
    `    codex mcp add hatsubai-kun --env ${envName}=${valueHint} -- npx -y @woof-tokyo/hatsubai-kun@latest`,
    `  Gemini CLI:`,
    `    gemini mcp add -s user -e ${envName}=${valueHint} hatsubai-kun npx -y @woof-tokyo/hatsubai-kun@latest`,
  ].join("\n");

const STEAM_NOTE =
  "※ 売上・ウィッシュリスト分析を使う場合は、別途 STEAM_PUBLISHER_KEY（自分のSteam財務APIキー）も設定できます。" +
  "キーはあなたのPC内だけに保存され、発売くんのサーバーには送られません（集計後の数値だけを任意で同期）。";

function freeModeMessage(status: ConnectStatus): string {
  return [
    "いまは【無料・単体モード】で動いています。アカウント登録なしで Steam の分析ツール",
    "（ゲーム検索 / ストア詳細 / レビュー集計 / 競合比較 / Steamworks公式ガイド）が使えます。",
    "",
    "▼ プラットフォーム機能を使うには（すべて無料）",
    "  ゲーム掲載（ショーケース）・ダッシュボード・売上/WL同期・プレスリリース・補助金・",
    "  クラウドファンディング支援・Steamストア素材 など。",
    "",
    "  1. https://hatsubai-kun.com で無料登録（サインアップ）",
    "  2. ダッシュボード → アカウント で「発売くんキー」(hk_live_...) を取得",
    "  3. MCP設定に環境変数 HATSUBAIKUN_KEY を追加して、MCPを再起動",
    "",
    CONFIG_EXAMPLES("HATSUBAIKUN_KEY", "あなたのキー"),
    "",
    status.publisherKeyPresent
      ? "（STEAM_PUBLISHER_KEY は設定済みです。発売くんキーを足すとダッシュボード同期も使えます）"
      : STEAM_NOTE,
  ].join("\n");
}

function connectedMessage(status: ConnectStatus): string {
  const who = status.studioName || status.email || "あなた";
  return [
    `✅ 発売くんプラットフォームに接続済みです（${who}）。`,
    "",
    "使える連携ツール:",
    "  ・ゲーム: register_game / add_steam_game / update_game / get_my_dashboard / list_community_games",
    "  ・制作支援: get_game_press_material / publish_press_release / get_game_store_material /",
    "    publish_steam_store_page / save_grant / get_grant / save_crowdfunding_campaign / get_crowdfunding_campaign",
    "  ・イベント: submit_event",
    status.publisherKeyPresent
      ? "  ・売上/WL同期: sync_sales_to_dashboard / get_my_analytics ほか（Steam財務キー検出済み）"
      : "  ・（売上/WL分析・同期を使うには STEAM_PUBLISHER_KEY も設定してください）",
    "",
    "「マイゲームに登録して」「ダッシュボードを見せて」「このゲームのプレスリリースを作って」のように依頼できます。",
  ].join("\n");
}

function invalidKeyMessage(): string {
  return [
    "⚠️ HATSUBAIKUN_KEY が設定されていますが、無効か、サーバーに接続できませんでした。",
    "プラットフォーム連携ツールは現在無効です。次を確認してください:",
    "",
    "  1. キーが正しいか（hk_live_... の形）",
    "  2. hatsubai-kun.com のダッシュボードでキーを再発行し、設定し直す",
    "  3. それでも繋がらない場合は、少し時間をおいて再試行（サーバー側の一時障害の可能性）",
    "",
    "※ キー無しでも Steam の分析ツール（無料・単体モード）は引き続き使えます。",
  ].join("\n");
}

/** 接続状況に応じた案内メッセージを返す（純関数・テスト対象）。 */
export function buildConnectMessage(status: ConnectStatus): string {
  if (status.hkValid) return connectedMessage(status);
  if (status.hkKeyPresent) return invalidKeyMessage();
  return freeModeMessage(status);
}

/** how_to_connect が返す機械可読メタ（純関数・テスト対象）。 */
export function connectMeta(status: ConnectStatus) {
  return {
    connected: status.hkValid,
    mode: status.hkValid ? "platform" : "free",
    has_platform_key: status.hkKeyPresent,
    has_steam_publisher_key: status.publisherKeyPresent,
    register_url: "https://hatsubai-kun.com",
  };
}

export function registerConnectTool(server: McpServer, status: ConnectStatus): void {
  server.registerTool(
    "how_to_connect",
    {
      title: "発売くんへの接続方法・登録案内",
      description:
        "発売くん(hatsubai-kun.com)への接続状況を確認し、未登録なら登録・接続手順を案内する。" +
        "ユーザーが「ゲームを登録したい」「ショーケースに載せたい」「ダッシュボードを使いたい」" +
        "「どうやって連携するの」「ログイン/登録は？」等と言ったとき、またはプラットフォーム連携" +
        "ツールが見当たらないときに、まずこれを呼んで現状と次の一手を案内する。",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          { type: "text" as const, text: buildConnectMessage(status) },
          {
            type: "text" as const,
            text: "```json\n" + JSON.stringify(connectMeta(status), null, 2) + "\n```",
          },
        ],
      };
    },
  );
}
