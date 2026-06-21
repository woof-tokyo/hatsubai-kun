/**
 * セールプランナーの検証ロジック（純関数）。
 * ルールは Steamworks 公式 https://partner.steamgames.com/doc/marketing/discounts
 * （2026-06-13 取得）に基づく:
 * - 割引同士のクールダウン: 30日（季節セールは例外）
 * - リリース後30日は割引不可（ローンチ割引を除く）
 * - 値上げ後30日は割引不可（例外なし）
 * - 通常割引: 10〜95%、期間1〜14日 / ローンチ割引: 10〜40%、7〜14日
 * - 20%以上の割引はウィッシュリスト登録者に自動通知
 */
import type { SalesLineItem } from "../steam/partner.js";

export const DISCOUNT_RULES = {
  cooldownDays: 30,
  releaseCooldownDays: 30,
  priceIncreaseCooldownDays: 30,
  minPercent: 10,
  maxPercent: 95,
  minDays: 1,
  maxDays: 14,
  wishlistNotifyPercent: 20,
} as const;

const DAY_MS = 86_400_000;
const toUTC = (d: string) => new Date(d + "T00:00:00Z").getTime();
const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);

/** 売上明細から「割引価格で売れた最後の日」を検出する（過去セールの終了日の推定）。 */
export function detectLastDiscountDate(items: SalesLineItem[]): string | null {
  let last: string | null = null;
  for (const it of items) {
    const base = Number(it.base_price);
    const sale = Number(it.sale_price);
    if (Number.isFinite(base) && Number.isFinite(sale) && sale < base) {
      if (!last || it.date > last) last = it.date;
    }
  }
  return last;
}

export interface SalePlanInput {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  percent: number;
  today: string;
  releaseDate?: string | null; // 不明なら null
  lastDiscountDate?: string | null; // 直近の割引販売日（推定）。不明なら null
}

export interface SalePlanVerdict {
  ok: boolean;
  issues: string[]; // ルール違反（これがあると設定できない）
  warnings: string[]; // 要注意事項
  notes: string[]; // 役立つ情報
}

export function validateSalePlan(p: SalePlanInput): SalePlanVerdict {
  const issues: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const R = DISCOUNT_RULES;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) {
    return { ok: false, issues: ["日付は YYYY-MM-DD 形式で指定してください"], warnings, notes };
  }

  const duration = daysBetween(p.startDate, p.endDate) + 1;
  if (duration < R.minDays) issues.push("終了日は開始日以降にしてください");
  if (duration > R.maxDays)
    issues.push(`割引期間は最長${R.maxDays}日です（指定: ${duration}日）`);

  if (p.percent < R.minPercent || p.percent > R.maxPercent)
    issues.push(`割引率は${R.minPercent}〜${R.maxPercent}%の範囲です（指定: ${p.percent}%）`);

  if (toUTC(p.startDate) < toUTC(p.today))
    issues.push(`開始日が過去です（今日: ${p.today}）`);

  if (p.releaseDate) {
    const sinceRelease = daysBetween(p.releaseDate, p.startDate);
    if (sinceRelease < R.releaseCooldownDays)
      issues.push(
        `リリース（${p.releaseDate}）から${R.releaseCooldownDays}日間は割引できません` +
          `（開始日時点で${sinceRelease}日。ローンチ割引は例外）`,
      );
  } else {
    warnings.push("発売日を確認できなかったため、リリース後30日ルールは未チェックです");
  }

  if (p.lastDiscountDate) {
    const sinceLast = daysBetween(p.lastDiscountDate, p.startDate);
    if (sinceLast < R.cooldownDays)
      issues.push(
        `直近の割引販売（${p.lastDiscountDate} 検出）から${R.cooldownDays}日間は` +
          `次の割引を開始できません（開始日時点で${sinceLast}日）。※季節セール参加は例外`,
      );
    else
      notes.push(`直近の割引販売は ${p.lastDiscountDate}（${sinceLast}日前）。クールダウンはクリアしています`);
  } else {
    notes.push("直近120日の売上に割引販売は見つかりませんでした（クールダウンの懸念なし）");
  }

  warnings.push(
    "値上げ後30日ルールは売上データから検出できません。期間中に価格改定をしていないか確認してください",
  );

  if (p.percent >= R.wishlistNotifyPercent)
    notes.push(
      `${R.wishlistNotifyPercent}%以上の割引なので、ウィッシュリスト登録者へ自動通知が送られます（販売チャンス）`,
    );
  else
    notes.push(
      `割引率が${R.wishlistNotifyPercent}%未満のため、ウィッシュリスト自動通知は送られません。` +
        `通知を狙うなら${R.wishlistNotifyPercent}%以上を検討してください`,
    );

  return { ok: issues.length === 0, issues, warnings, notes };
}

/** パートナーサイトでの設定手順（チェックリスト）。 */
export const SALE_SETUP_STEPS = [
  "1. https://partner.steamgames.com にログイン",
  "2. 対象アプリのランディングページ → [マーケティングと表示] → [カスタム割引を管理]",
  "3. [新しい割引を作成] で割引率・開始/終了日時を入力（Steam の表示はパシフィック時間基準）",
  "4. 確認画面でパッケージ・期間・率を確認して保存",
  "5. 反映後、ストアページで割引表示を確認（数分〜1時間程度かかる場合あり）",
];
