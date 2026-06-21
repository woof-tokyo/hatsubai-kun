/**
 * 発売くんプラットフォームAPI（自前バックエンド）のクライアント。
 * - 照合(verify)・ゲーム登録/更新・ショーケース・ダッシュボードを叩く
 * - エンドポイントは HATSUBAIKUN_API_BASE で差し替え可（既定は本番ドメイン）
 * 認証は発売くんキー（HATSUBAIKUN_KEY）を x-hatsubaikun-key ヘッダで送る。
 */
const API_BASE =
  process.env.HATSUBAIKUN_API_BASE?.replace(/\/$/, "") ||
  "https://hatsubai-kun.com";
const TIMEOUT_MS = 10_000;

export interface VerifyResult {
  valid: boolean;
  plan?: string;
  user?: { id: number; email: string; studio_name: string | null };
}

async function call(
  path: string,
  opts: { method?: string; key?: string; adminSecret?: string; body?: unknown } = {},
): Promise<any> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.key) headers["x-hatsubaikun-key"] = opts.key;
  if (opts.adminSecret) headers["x-admin-secret"] = opts.adminSecret;
  if (opts.body) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* 非JSONはそのまま */
  }
  if (!res.ok) {
    const msg = json?.error || `API ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** 発売くんキーを照合（起動時に使う。落ちていても判定できるよう例外は呼び出し側で扱う）。 */
export async function verifyKey(key: string): Promise<VerifyResult> {
  return call("/v1/keys/verify", { method: "POST", key });
}

export async function registerGame(key: string, game: Record<string, unknown>) {
  return call("/v1/games", { method: "POST", key, body: game });
}

export async function updateGame(
  key: string,
  id: number,
  patch: Record<string, unknown>,
) {
  return call(`/v1/games/${id}`, { method: "PATCH", key, body: patch });
}

export async function listCommunityGames(q?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  return call(`/v1/games?${params.toString()}`);
}

export async function getMyDashboard(key: string) {
  return call("/v1/me", { key });
}

/** Webの「売上・WL分析」画面に出ている保存済みデータを取得。 */
export async function getMyAnalytics(key: string) {
  const [sales, reviews, insights] = await Promise.all([
    call("/v1/sales", { key }),
    call("/v1/me/reviews", { key }).catch(() => ({ reviews: [] })),
    call("/v1/me/insights", { key }).catch(() => ({ insights: null })),
  ]);
  return { ...sales, reviews: reviews.reviews ?? [], insights: insights.insights ?? null };
}

/** Claude/Codex/Gemini CLI等が作ったインサイトをWebダッシュボードへ保存。 */
export async function publishAiInsight(
  key: string,
  body: {
    summary: string;
    highlights?: {
      label?: string;
      value?: string;
      delta?: string;
      trend?: "up" | "down" | "flat";
    }[];
    actions?: {
      title?: string;
      why?: string;
      impact?: "high" | "medium" | "low";
      effort?: "high" | "medium" | "low";
    }[];
    generated_by?: string;
  },
) {
  return call("/v1/me/insights", { method: "PUT", key, body });
}

/** レビュー専用ページの材料を取得。refresh=true ならSteam公開レビュー本文だけ更新する。 */
export async function getGameReviewData(key: string, gameId: number, refresh = false) {
  return call(`/v1/games/${gameId}/reviews/${refresh ? "refresh" : "summary"}`, {
    method: refresh ? "POST" : "GET",
    key,
  });
}

/** Claude/Codex/Gemini CLI等が作ったレビュー分析をWebダッシュボードへ保存。 */
export async function publishReviewInsight(
  key: string,
  gameId: number,
  body: {
    summary: string;
    positives?: string[];
    negatives?: string[];
    recommended_actions?: string[];
    sentiment?: "positive" | "mixed" | "negative";
    generated_by?: string;
  },
) {
  return call(`/v1/games/${gameId}/reviews/summary`, { method: "PUT", key, body });
}

/** プレスリリースの材料（保存済み原稿＋ゲーム情報から作ったファクトシート）を取得。 */
export async function getGamePressMaterial(key: string, gameId: number) {
  return call(`/v1/games/${gameId}/press`, { key });
}

/** Claude/Codex/Gemini CLI等が作ったプレスリリースをWebダッシュボードへ保存。 */
export async function publishPressRelease(
  key: string,
  gameId: number,
  body: {
    headline?: string;
    lead?: string;
    body_md?: string;
    factsheet?: Record<string, unknown>;
    status?: "draft" | "final";
    generated_by?: string;
  },
) {
  return call(`/v1/games/${gameId}/press`, { method: "PUT", key, body });
}

/** Steamストア素材（保存済み下書き＋ゲーム情報から作った初期値）を取得。 */
export async function getGameStoreMaterial(key: string, gameId: number) {
  return call(`/v1/games/${gameId}/store-page`, { key });
}

/** Claude/Codex等が作ったSteamストアページ下書きを発売くんへ保存。 */
export async function publishStorePage(
  key: string,
  gameId: number,
  body: {
    app_name?: string;
    short_description?: string;
    about_md?: string;
    spec?: Record<string, unknown>;
    status?: "draft" | "final";
    generated_by?: string;
  },
) {
  return call(`/v1/games/${gameId}/store-page`, { method: "PUT", key, body });
}

/** 補助金エントリを保存。id があれば更新、なければ新規作成。checklist も一緒に保存可。 */
export async function saveGrant(
  key: string,
  body: {
    id?: number;
    name?: string;
    organization?: string;
    url?: string;
    application_url?: string;
    region?: string;
    target?: string;
    eligible_summary?: string;
    amount?: string;
    deadline?: string;
    status?: "interested" | "preparing" | "submitted" | "awarded" | "rejected";
    memo?: string;
    last_checked_at?: string;
    game_id?: number | null;
    checklist?: { label: string; required?: boolean }[];
  },
) {
  if (body.id) {
    const { id, ...patch } = body;
    return call(`/v1/grants/${id}`, { method: "PUT", key, body: patch });
  }
  return call("/v1/grants", { method: "POST", key, body });
}

/** 補助金の申請書ドラフト（Markdown）を保存。docId があれば更新、なければ新規。 */
export async function saveGrantDocument(
  key: string,
  grantId: number,
  body: { docId?: number; title?: string; content_md?: string; status?: "draft" | "final" },
) {
  return call(`/v1/grants/${grantId}/documents`, { method: "POST", key, body });
}

/** クラウドファンディング企画を保存。id があれば更新、なければ新規作成。checklist も一緒に保存可。 */
export async function saveCrowdfundingCampaign(
  key: string,
  body: {
    id?: number;
    title?: string;
    platform?: string;
    url?: string;
    goal_amount?: number;
    currency?: string;
    starts_at?: string;
    ends_at?: string;
    status?: "idea" | "researching" | "preparing" | "live" | "finished" | "cancelled";
    target_summary?: string;
    reward_summary?: string;
    pitch_summary?: string;
    memo?: string;
    last_checked_at?: string;
    game_id?: number | null;
    checklist?: { label: string; required?: boolean }[];
  },
) {
  if (body.id) {
    const { id, ...patch } = body;
    return call(`/v1/crowdfunding/${id}`, { method: "PUT", key, body: patch });
  }
  return call("/v1/crowdfunding", { method: "POST", key, body });
}

/** クラウドファンディング本文・リターン案・告知文のMarkdownドラフトを保存。 */
export async function saveCrowdfundingDocument(
  key: string,
  campaignId: number,
  body: { docId?: number; title?: string; content_md?: string; status?: "draft" | "final" },
) {
  return call(`/v1/crowdfunding/${campaignId}/documents`, { method: "POST", key, body });
}

/** 集計済みの売上数値をダッシュボードへ同期（push型。財務キーは送らない）。 */
export async function syncSales(key: string, payload: unknown) {
  return call("/v1/sales", { method: "PUT", key, body: payload });
}

/** ダッシュボードに同期済みの売上数値を削除。 */
export async function deleteSalesSnapshot(key: string) {
  return call("/v1/sales", { method: "DELETE", key });
}

/** 公開インディーイベント一覧（approvedのみ・キー不要）。検索条件対応。 */
export async function listEvents(
  params: {
    q?: string;
    tag?: string;
    format?: string;
    from?: string;
    to?: string;
    deadline_before?: string;
    only_open?: boolean;
    upcoming?: boolean;
    limit?: number;
  } = {},
) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.tag) sp.set("tag", params.tag);
  if (params.format) sp.set("format", params.format);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.deadline_before) sp.set("deadline_before", params.deadline_before);
  if (params.only_open) sp.set("only_open", "1");
  if (params.upcoming) sp.set("upcoming", "1");
  if (params.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return call(`/v1/events${qs ? `?${qs}` : ""}`);
}

/** イベント掲載を申請（要キー。pendingで投入され、woof承認で公開）。 */
export async function submitEvent(key: string, body: Record<string, unknown>) {
  return call("/v1/events", { method: "POST", key, body });
}

/** ニュース記事を作成（woof管理者シークレットが必要）。 */
export async function createNewsArticle(adminSecret: string, body: Record<string, unknown>) {
  return call("/v1/admin/news", { method: "POST", adminSecret, body });
}

export { API_BASE };
