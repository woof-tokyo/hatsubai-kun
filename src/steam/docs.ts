/**
 * Steamworks 公式ドキュメント（公開ページ）のガイド取得。
 * URL は 2026-06-13 に実在確認済み。NDA圏ページは含めない。
 */
const DOC_BASE = "https://partner.steamgames.com/doc/";
const REQUEST_TIMEOUT_MS = 15_000;

export interface GuideTopic {
  key: string;
  path: string;
  title: string;
  aliases: string[];
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    key: "discounts",
    path: "marketing/discounts",
    title: "割引・セール設定（Discounting）",
    aliases: ["セール", "割引", "ディスカウント", "sale", "discount"],
  },
  {
    key: "keys",
    path: "features/keys",
    title: "Steamキー（無料配布用プロダクトキー）",
    aliases: ["キー", "無料配布", "ギフト", "プレゼント", "クーポン", "チケット", "key", "giveaway"],
  },
  {
    key: "demos",
    path: "store/application/demos",
    title: "デモ版の公開",
    aliases: ["デモ", "体験版", "demo"],
  },
  {
    key: "playtest",
    path: "features/playtest",
    title: "Steamプレイテスト",
    aliases: ["プレイテスト", "テスター", "playtest", "beta"],
  },
  {
    key: "curators",
    path: "marketing/curators",
    title: "キュレーターとキュレーターコネクト（レビュー用コピー配布）",
    aliases: ["キュレーター", "レビュアー", "インフルエンサー", "curator"],
  },
  {
    key: "events",
    path: "marketing/upcoming_events",
    title: "今後のSteamイベント・フェス",
    aliases: ["イベント", "フェス", "ネクストフェス", "セールイベント", "event", "fest", "nextfest"],
  },
  {
    key: "localization",
    path: "store/localization",
    title: "ローカライズと対応言語",
    aliases: ["ローカライズ", "翻訳", "多言語", "localization"],
  },
  {
    key: "reviews",
    path: "store/reviews",
    title: "ユーザーレビューの仕組み",
    aliases: ["レビュー", "評価", "review"],
  },
  {
    key: "wishlist",
    path: "marketing/wishlist",
    title: "ウィッシュリストの仕組みと活用",
    aliases: ["ウィッシュリスト", "wishlist"],
  },
];

/** トピック文字列（日本語可）から該当ガイドを探す。 */
export function resolveTopic(query: string): GuideTopic | undefined {
  const q = query.toLowerCase().trim();
  return GUIDE_TOPICS.find(
    (t) =>
      t.key === q ||
      t.title.toLowerCase().includes(q) ||
      t.aliases.some((a) => q.includes(a.toLowerCase()) || a.toLowerCase().includes(q)),
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/** 公式ドキュメントページを取得して本文テキストを返す。 */
export async function fetchGuide(
  topic: GuideTopic,
  maxChars = 9000,
): Promise<{ url: string; title: string; text: string }> {
  const url = DOC_BASE + topic.path;
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ドキュメント取得失敗 (${res.status}): ${url}`);
  let html = await res.text();
  // 本文は class="documentation_bbcode" のコンテナ内。ナビ・フッターを除去
  const start = html.indexOf('class="documentation_bbcode"');
  if (start > 0) html = html.slice(html.indexOf(">", start) + 1);
  const end = html.indexOf('class="responsive_footer');
  if (end > 0) html = html.slice(0, end);
  const text = htmlToText(html);
  return { url, title: topic.title, text: text.slice(0, maxChars) };
}
