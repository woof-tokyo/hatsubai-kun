import type { SteamReview } from "../steam/reviews.js";

export interface Keyword {
  word: string;
  count: number; // 出現したレビュー件数（document frequency 的）
}

// MVP の簡易ストップワード（外部辞書なし）。精度を上げる段階で kuromoji 導入を検討。
const STOP = new Set<string>([
  "こと",
  "これ",
  "それ",
  "あれ",
  "ます",
  "ました",
  "する",
  "して",
  "てる",
  "ない",
  "から",
  "ので",
  "です",
  "また",
  "とても",
  "思う",
  "思い",
  "この",
  "その",
  "あの",
  "ある",
  "いる",
  "なる",
  "れる",
  "だけ",
  "まで",
  "より",
  "では",
  "には",
  "でも",
  "ても",
  "しまう",
  "かも",
  "みたい",
  "感じ",
  "本当",
  "普通",
  "ゲーム",
  "game",
  "the",
  "and",
  "you",
  "for",
  "this",
  "that",
  "with",
  "but",
  "not",
  "are",
  "was",
  "have",
]);

/**
 * 日本語レビューから頻出語をざっくり抽出する MVP 実装。
 * - 漢字2文字以上 / カタカナ2文字以上 / 英単語3文字以上 を語として扱う
 * - 同一レビュー内の重複は1カウント（DF的に数える）
 */
export function topKeywords(reviews: SteamReview[], n = 20): Keyword[] {
  const counts = new Map<string, number>();

  for (const r of reviews) {
    const text = r.review.normalize("NFKC");
    const tokens = text.match(/[一-龯々]{2,}|[ァ-ヴー]{2,}|[A-Za-z]{3,}/g) ?? [];
    const seen = new Set<string>();
    for (const raw of tokens) {
      const w = raw.toLowerCase();
      if (w.length < 2 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
