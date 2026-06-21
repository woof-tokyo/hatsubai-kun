/**
 * ニュース/ブログ下書きツール（woof運営向け）。
 * HATSUBAIKUN_ADMIN_SECRET と HATSUBAIKUN_ENABLE_ADMIN_MCP=1 があるときだけ登録される。
 * MCP経由では公開せず、必ずdraftとして作成する。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createNewsArticle } from "./platform/client.js";

function reply(text: string, data: unknown) {
  return {
    content: [
      { type: "text" as const, text },
      { type: "text" as const, text: "```json\n" + JSON.stringify(data, null, 2) + "\n```" },
    ],
  };
}

export function registerNewsTools(server: McpServer, adminSecret: string): void {
  server.registerTool(
    "publish_news",
    {
      title: "ニュース記事の下書きを作成",
      description:
        "発売くんのニュース/ブログ記事を下書き作成する（woof運営向け・管理シークレットが必要）。本文はMarkdown。MCP経由では即公開せず、管理画面で確認してから公開する。",
      inputSchema: {
        title: z.string().describe("記事タイトル"),
        body: z.string().optional().describe("本文（Markdown）"),
        excerpt: z.string().optional().describe("一覧用の要約"),
        cover_url: z.string().optional().describe("カバー画像URL"),
        tags: z.array(z.string()).optional().describe("タグの配列"),
        slug: z.string().optional().describe("URLスラッグ（空欄で自動生成）"),
      },
    },
    async (args) => {
      const r = await createNewsArticle(adminSecret, { ...args, status: "draft" });
      const a = r.article;
      return reply(
        `記事「${a.title}」を下書き作成しました（status: ${a.status} / slug: ${a.slug}）。管理画面で確認してから公開してください。`,
        a,
      );
    },
  );
}
