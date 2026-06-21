#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";
import { registerDevTools } from "./devtools.js";
import { registerPlatformTools } from "./platformtools.js";
import { registerSyncTools } from "./synctools.js";
import { registerEventTools } from "./eventtools.js";
import { registerNewsTools } from "./newstools.js";
import { verifyKey } from "./platform/client.js";

// ローカル開発用の簡易 .env 読み込み（既存の環境変数は上書きしない）
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // .env が無ければ何もしない
}

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const server = new McpServer({
  name: "hatsubai-kun",
  title: "発売くん",
  version: pkg.version,
});

registerTools(server);
registerPrompts(server);

// 発売くんキーがあれば照合し、有効ならプラットフォーム連携ツール（ゲーム登録・ショーケース等）を追加。
// ※ 照合APIが落ちていても全体は止めない（プラットフォーム機能だけ無効化）。
// ※ キーなしでも基本機能（Steam分析）は使える。
const hkKey = process.env.HATSUBAIKUN_KEY?.trim();
let hkValid = false;
if (hkKey) {
  try {
    const v = await verifyKey(hkKey);
    if (v.valid) {
      registerPlatformTools(server, hkKey);
      hkValid = true;
      console.error(
        `[hatsubai-kun] platform tools enabled for ${v.user?.studio_name ?? v.user?.email ?? "user"}`,
      );
    } else {
      console.error("[hatsubai-kun] HATSUBAIKUN_KEY が無効です — プラットフォーム機能は無効");
    }
  } catch (e) {
    console.error(
      "[hatsubai-kun] 照合APIに接続できず — プラットフォーム機能は無効:",
      String(e instanceof Error ? e.message : e),
    );
  }
}

// STEAM_PUBLISHER_KEY があるときだけ開発者ツール（売上・ウィッシュリスト）を追加。
// キーはユーザー自身のもの。このプロセスから外部に出るのは Steam 公式APIへの送信のみ。
const publisherKey = process.env.STEAM_PUBLISHER_KEY?.trim();
if (publisherKey) {
  registerDevTools(server, publisherKey);
  console.error("[hatsubai-kun] developer tools enabled (publisher key detected)");
}

// 財務キー（取得）と有効な発売くんキー（送信）が両方そろうとき、ダッシュボード同期ツールを追加。
// push型: ローカルで集計した数値だけをサーバーへ送る。財務キーは送信されない。
if (publisherKey && hkValid && hkKey) {
  registerSyncTools(server, { publisherKey, hkKey });
  console.error("[hatsubai-kun] sales sync tool enabled (publisher + platform key)");
}

// インディーイベント: list_events は公開（キー不要）で常に登録。
// submit_event は有効な発売くんキーがあるときだけ登録（申請はpendingで投入）。
registerEventTools(server, hkValid && hkKey ? hkKey : undefined);
console.error(
  `[hatsubai-kun] event tools enabled (list_events${hkValid ? " + submit_event" : ""})`,
);

// ニュース下書き: 管理MCPは明示的に有効化された環境だけに限定する。
const adminSecret = process.env.HATSUBAIKUN_ADMIN_SECRET?.trim();
const adminMcpEnabled = process.env.HATSUBAIKUN_ENABLE_ADMIN_MCP === "1";
if (adminSecret && adminMcpEnabled) {
  registerNewsTools(server, adminSecret);
  console.error("[hatsubai-kun] news draft tool enabled (admin MCP explicitly enabled)");
}

const transport = new StdioServerTransport();
await server.connect(transport);

// 注意: stdio では stdout は JSON-RPC 専用。ログは必ず stderr へ。
console.error("[hatsubai-kun] started (stdio)");
