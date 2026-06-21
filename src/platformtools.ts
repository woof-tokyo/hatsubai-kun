/**
 * プラットフォーム連携ツール（自前バックエンドへの読み書き）。
 * 発売くんキー（HATSUBAIKUN_KEY）があるときに登録される。
 *
 * 重要: 書き込み先は自前DBだが、登録内容は hatsubai-kun.com の公開ショーケースに繋がる。
 * 公開事故を防ぐため、このMCPからの登録は必ず「非公開の下書き」として作成され、
 * 公開（ショーケース掲載）は本人がWebダッシュボードで明示的に行う設計。
 * したがってMCP側に公開フラグ(is_public)は持たせない。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  registerGame,
  updateGame,
  listCommunityGames,
  getMyDashboard,
  getMyAnalytics,
  publishAiInsight,
  getGameReviewData,
  publishReviewInsight,
  getGamePressMaterial,
  publishPressRelease,
  getGameStoreMaterial,
  publishStorePage,
  saveGrant,
  saveGrantDocument,
  saveCrowdfundingCampaign,
  saveCrowdfundingDocument,
} from "./platform/client.js";
import { getDetails } from "./steam/details.js";

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

export function registerPlatformTools(server: McpServer, key: string): void {
  server.registerTool(
    "register_game",
    {
      title: "ゲームを発売くんに登録（非公開の下書き）",
      description:
        "自分のゲームを発売くんプラットフォームに『非公開の下書き』として登録する。" +
        "登録しただけでは公開ショーケースには出ない。公開は本人がWebダッシュボード" +
        "（hatsubai-kun.com/dashboard/games）で内容を確認し、公開ボタンを押したときだけ行われる。" +
        "\n\n【重要・必ず守ること】" +
        "\n- 実在し、ユーザー本人が権利を持つゲームのみ登録する。" +
        "\n- ローカルフォルダ等を勝手にスキャンして、テスト用・開発中の作品をまとめて登録しない。" +
        "\n- 登録する前に、対象タイトル・内容をユーザーに提示して必ず確認を取る。" +
        "\n- どのゲームを登録するか曖昧なときは、登録せずユーザーに尋ねる。" +
        "\n- 「Steamの自分のゲームを登録して」と言われたら、AppIDを聞き返す前に" +
        " list_my_steam_titles（財務API連携時に利用可）で自分のタイトルを特定し、" +
        " store_url（https://store.steampowered.com/app/＜AppID＞/）を埋めて登録する。" +
        "\ntitle 必須。",
      inputSchema: {
        title: z.string().describe("ゲームタイトル"),
        appid: z.number().int().optional().describe("Steam AppID（あれば）"),
        genre: z.string().optional(),
        status: z
          .enum(["released", "in_development", "unannounced"])
          .optional()
          .describe("発売状況"),
        description: z.string().optional().describe("紹介文（Markdown可）"),
        store_url: z.string().optional().describe("ストアURL（Steam/App Store/Google Play等。公開時に必要）"),
        image_url: z.string().optional().describe("カバー画像URL"),
        screenshots: z
          .array(z.string())
          .optional()
          .describe("スクリーンショット画像URLの配列"),
        video_url: z.string().optional().describe("YouTube等の動画URL"),
        tags: z.array(z.string()).optional().describe("タグの配列"),
        website_url: z.string().optional().describe("公式サイトURL（公開時にストアURLが無ければ必要）"),
        discord_url: z.string().optional().describe("Discord招待URL"),
        x_account: z.string().optional(),
      },
    },
    async (args) => {
      const r = await registerGame(key, args);
      return reply(
        `「${r.game.title}」を非公開の下書きとして登録しました（id: ${r.game.id}）。` +
          `公開するには hatsubai-kun.com/dashboard/games で内容を確認し、公開してください` +
          `（公開にはストアURLか公式サイトURLが必要です）。`,
        r.game,
      );
    },
  );

  server.registerTool(
    "add_steam_game",
    {
      title: "SteamのゲームをAppIDだけで一発登録（画像・動画・説明つき）",
      description:
        "Steam AppID を渡すだけで、ストアから カバー画像・スクリーンショット・トレーラー動画・" +
        "説明・ジャンル(タグ)・ストアURL をまとめて取得し、発売くんに『非公開の下書き』として一発登録する。" +
        "register_game を手で組み立てたり、画像・動画を別ツールで後追い更新する必要はない。" +
        "\n\n「Steamの自分のゲームを発売くんに入れて（画像も動画も）」と言われたら、" +
        "list_my_steam_titles で自分のAppIDを特定し、各タイトルについてこのツールを1回呼ぶだけでよい。" +
        "\n登録は下書き。公開はWebダッシュボードで本人が行う。実在・本人所有のタイトルのみ。",
      inputSchema: {
        appid: z.number().int().describe("Steam AppID"),
        status: z
          .enum(["released", "in_development", "unannounced"])
          .optional()
          .describe("発売状況（既定 released）"),
      },
    },
    async ({ appid, status }) => {
      const d = await getDetails(appid);
      const tags = [...new Set([...d.genres, ...d.categories])].slice(0, 20);
      const game = {
        title: d.name,
        appid,
        status: status ?? "released",
        description: d.short_description || undefined,
        store_url: `https://store.steampowered.com/app/${appid}/`,
        image_url: d.header_image,
        screenshots: d.screenshots,
        video_url: d.trailer_url,
        tags,
      };
      const r = await registerGame(key, game);
      const media =
        `カバー画像 ${d.header_image ? "✓" : "—"} / スクショ ${d.screenshots.length}枚 / ` +
        `動画 ${d.trailer_url ? "✓" : "—（Steamにトレーラー無し）"}`;
      return reply(
        `「${r.game.title}」(AppID ${appid}) を画像・動画つきで非公開の下書き登録しました（id: ${r.game.id}）。\n` +
          `${media}\n公開は hatsubai-kun.com/dashboard/games で確認してから行ってください。`,
        r.game,
      );
    },
  );

  server.registerTool(
    "update_game",
    {
      title: "登録ゲームを更新",
      description:
        "発売くんに登録済みの自分のゲーム情報を更新する。指定したフィールドだけ変更。" +
        "※ ショーケースへの公開/非公開の切り替えはこのツールでは行えない（公開事故防止のため）。" +
        "公開はWebダッシュボード（hatsubai-kun.com/dashboard/games）で本人が行う。",
      inputSchema: {
        id: z.number().int().describe("ゲームID（register_game / get_my_dashboard で確認）"),
        title: z.string().optional(),
        appid: z.number().int().optional(),
        genre: z.string().optional(),
        status: z.enum(["released", "in_development", "unannounced"]).optional(),
        description: z.string().optional().describe("紹介文（Markdown可）"),
        store_url: z.string().optional(),
        image_url: z.string().optional().describe("カバー画像URL"),
        screenshots: z.array(z.string()).optional().describe("スクリーンショット画像URLの配列"),
        video_url: z.string().optional().describe("YouTube等の動画URL"),
        tags: z.array(z.string()).optional().describe("タグの配列"),
        website_url: z.string().optional().describe("公式サイトURL"),
        discord_url: z.string().optional().describe("Discord招待URL"),
        x_account: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => {
      // 念のため公開フラグは送らない（公開はWebダッシュボード専用）。
      delete (patch as Record<string, unknown>).is_public;
      const r = await updateGame(key, id, patch);
      return reply(`「${r.game.title}」（id: ${id}）を更新しました。`, r.game);
    },
  );

  server.registerTool(
    "list_community_games",
    {
      title: "ショーケースのゲーム一覧",
      description:
        "発売くんに登録された公開ゲーム（ショーケース）を一覧・検索する。キーワード検索可。",
      inputSchema: {
        q: z.string().optional().describe("タイトル/ジャンル/スタジオ名で絞り込み"),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async ({ q, limit }) => {
      const r = await listCommunityGames(q, limit);
      const games = r.games ?? [];
      const text =
        `ショーケース ${games.length}件` +
        (q ? `（「${q}」で検索）` : "") +
        ":\n" +
        games
          .map((g: any) => `- ${g.title}（${g.studio_name ?? "—"} / ${g.genre ?? "—"}）`)
          .join("\n");
      return reply(text, games);
    },
  );


  server.registerTool(
    "get_my_analytics",
    {
      title: "自分の売上・WL分析データを取得",
      description:
        "Webの「売上・WL分析」画面に保存済みの売上・ウィッシュリスト数値、Steam公開レビュー概要、" +
        "現在保存されているAIインサイトを取得する。Steam財務キーは不要。" +
        "AIインサイトを作る前にこのツールで材料を確認し、数値に基づいて分析する。",
      inputSchema: {},
    },
    async () => {
      const r = await getMyAnalytics(key);
      const sales = r.snapshot?.sales?.totals;
      const wlCount = Array.isArray(r.snapshot?.wishlist) ? r.snapshot.wishlist.length : 0;
      const text =
        "売上・WL分析データを取得しました。\n" +
        (sales
          ? `純売上 $${sales.net_sales_usd} / ${sales.net_units}本。`
          : "売上スナップショットはまだありません。") +
        ` WL同期 ${wlCount}タイトル / レビュー ${r.reviews?.length ?? 0}タイトル。`;
      return reply(text, r);
    },
  );

  server.registerTool(
    "publish_ai_insight",
    {
      title: "AIインサイトを発売くん分析ページに掲載",
      description:
        "Claude/Codex/Gemini CLIが分析したインサイトを、Webの「売上・WL分析」画面に保存して表示する。" +
        "サーバー側ではLLMを呼ばない。ユーザーから『AIインサイトに載せて』等の明示依頼がある時に使う。" +
        "先に get_my_analytics で材料を取得し、保存済み数値・レビューに基づく要約だけを書く。" +
        "highlights には図解したい注目数値を3〜6件入れると、画面にチップ表示される。" +
        "秘密情報、Steam財務キー、生明細、長いレビュー本文は含めない。",
      inputSchema: {
        summary: z.string().min(1).max(1200).describe("現状要約。2〜4文程度"),
        highlights: z
          .array(
            z.object({
              label: z.string().max(40).describe("指標名。例: WL累計 / 好評率 / 購入転換"),
              value: z.string().max(40).describe("値。例: +2,274 / 81% / 258件"),
              delta: z.string().max(40).optional().describe("増減や補足。例: 前月比+12% / US中心"),
              trend: z
                .enum(["up", "down", "flat"])
                .optional()
                .describe("傾向。上昇=up / 下降=down / 横ばい=flat"),
            }),
          )
          .max(6)
          .optional()
          .describe("図解する注目数値。3〜6件推奨。数値・レビューに基づくもののみ"),
        actions: z
          .array(
            z.object({
              title: z.string().max(140).describe("推奨アクションの見出し"),
              why: z.string().max(500).describe("理由。数値・レビュー傾向に基づいて短く書く"),
              impact: z
                .enum(["high", "medium", "low"])
                .optional()
                .describe("見込み影響度。大=high / 中=medium / 小=low"),
              effort: z
                .enum(["high", "medium", "low"])
                .optional()
                .describe("必要な労力。大=high / 中=medium / 小=low"),
            }),
          )
          .max(5)
          .optional()
          .describe("次のアクション。2〜3件推奨、最大5件"),
        generated_by: z.string().max(80).optional().describe("生成者表示。例: Claude / Codex / Gemini CLI"),
      },
    },
    async ({ summary, highlights, actions, generated_by }) => {
      const r = await publishAiInsight(key, { summary, highlights, actions, generated_by });
      return reply(
        "AIインサイトを発売くんの「売上・WL分析」画面に保存しました。",
        r.insights,
      );
    },
  );



  server.registerTool(
    "get_game_review_data",
    {
      title: "ゲームのSteamレビュー分析材料を取得",
      description:
        "自分の登録ゲームについて、発売くんにキャッシュ済みのSteam公開レビュー本文・件数・最新レビューを取得する。" +
        "refresh:true の場合だけSteam公開レビュー本文を更新するが、サーバー側LLMは呼ばない。" +
        "レビュー分析を作る前にこのツールで材料を確認し、publish_review_insight で保存する。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard で確認）"),
        refresh: z.boolean().optional().describe("Steam公開レビュー本文を更新する（5分クールダウン）"),
      },
    },
    async ({ game_id, refresh }) => {
      const r = await getGameReviewData(key, game_id, !!refresh);
      const text =
        r.status === "not_fetched"
          ? "まだレビュー本文が取得されていません。refresh:true で取得してください。"
          : `レビュー材料を取得しました（status=${r.status}, reviews=${r.review_count ?? 0}）。`;
      return reply(text, r);
    },
  );

  server.registerTool(
    "publish_review_insight",
    {
      title: "レビュー分析を発売くんレビュー分析ページに掲載",
      description:
        "Claude/Codex/Gemini CLIがSteam公開レビューを分析した結果を、Webの「レビュー分析」ページに保存して表示する。" +
        "サーバー側ではLLMを呼ばない。先に get_game_review_data で材料を取得し、" +
        "保存済みレビュー本文に基づく要約だけを書く。秘密情報、Steam財務キー、生明細は含めない。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard / get_game_review_data で確認）"),
        summary: z.string().min(1).max(1200).describe("レビュー全体の総括。2〜4文程度"),
        positives: z.array(z.string().max(180)).max(5).optional().describe("良い点の頻出テーマ。最大5件"),
        negatives: z.array(z.string().max(180)).max(5).optional().describe("不満点の頻出テーマ。最大5件"),
        recommended_actions: z.array(z.string().max(220)).max(3).optional().describe("改善アクション。最大3件"),
        sentiment: z.enum(["positive", "mixed", "negative"]).optional().describe("全体傾向"),
        generated_by: z.string().max(80).optional().describe("生成者表示。例: Claude / Codex / Gemini CLI"),
      },
    },
    async ({ game_id, summary, positives, negatives, recommended_actions, sentiment, generated_by }) => {
      const r = await publishReviewInsight(key, game_id, {
        summary,
        positives,
        negatives,
        recommended_actions,
        sentiment,
        generated_by,
      });
      return reply("レビュー分析を発売くんの「レビュー分析」画面に保存しました。", r);
    },
  );

  server.registerTool(
    "get_game_press_material",
    {
      title: "プレスリリースの材料を取得",
      description:
        "自分の登録ゲームについて、プレスリリースの材料を取得する。" +
        "保存済みの原稿があればそれを、無ければゲーム情報から作ったファクトシートの初期値を返す。" +
        "この材料をもとに原稿を作成し、publish_press_release で発売くんの「プレスリリース」画面に保存する。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard で確認）"),
      },
    },
    async ({ game_id }) => {
      const r = await getGamePressMaterial(key, game_id);
      const text =
        r.source === "saved"
          ? `保存済みのプレスリリースを取得しました（${r.game_title}）。`
          : `「${r.game_title}」のファクトシート初期値を取得しました。これを材料に原稿を作成してください。`;
      return reply(text, r);
    },
  );

  server.registerTool(
    "publish_press_release",
    {
      title: "プレスリリースを発売くんプレスリリース画面に保存",
      description:
        "Claude/Codex/Gemini CLIが作成したプレスリリース原稿とプレス素材(ファクトシート)を、" +
        "Webの「プレスリリース」画面に保存して表示する。サーバー側ではLLMを呼ばない。" +
        "ユーザーから『プレスリリースを作成して』等の依頼がある時に使う。" +
        "先に get_game_press_material で材料を取得し、事実に基づく内容だけを書く。" +
        "保存は既定で status='draft'（下書き）。秘密情報・Steam財務キー・APIキーは含めない。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard / get_game_press_material で確認）"),
        headline: z.string().max(200).optional().describe("プレスリリースの見出し"),
        lead: z.string().max(600).optional().describe("リード文（冒頭の要約。2〜3文）"),
        body_md: z.string().max(12000).optional().describe("本文。Markdown可"),
        factsheet: z
          .object({
            developer: z.string().max(120).optional(),
            title: z.string().max(120).optional(),
            genre: z.string().max(120).optional(),
            platforms: z.string().max(200).optional().describe("対応プラットフォーム"),
            release_date: z.string().max(80).optional().describe("発売日（自由表記）"),
            price: z.string().max(80).optional().describe("価格（自由表記）"),
            languages: z.string().max(200).optional().describe("対応言語"),
            overview: z.string().max(1200).optional().describe("ゲーム概要"),
            features: z.array(z.string().max(200)).max(10).optional().describe("主な特徴"),
            trailer_url: z.string().max(1000).optional(),
            screenshot_urls: z.array(z.string().max(1000)).max(12).optional(),
            logo_url: z.string().max(1000).optional(),
            official_url: z.string().max(1000).optional(),
            store_url: z.string().max(1000).optional(),
            sns: z.string().max(300).optional(),
            contact: z.string().max(300).optional().describe("問い合わせ先"),
          })
          .optional()
          .describe("プレス素材（ファクトシート）。指定したキーだけ更新される"),
        status: z.enum(["draft", "final"]).optional().describe("既定は draft（下書き）。確定時のみ final"),
        generated_by: z.string().max(80).optional().describe("生成者表示。例: Claude / Codex / Gemini CLI"),
      },
    },
    async ({ game_id, headline, lead, body_md, factsheet, status, generated_by }) => {
      const r = await publishPressRelease(key, game_id, {
        headline,
        lead,
        body_md,
        factsheet,
        status,
        generated_by,
      });
      return reply(
        `プレスリリースを発売くんの「プレスリリース」画面に保存しました（status=${r.press_status ?? "draft"}）。`,
        r,
      );
    },
  );

  server.registerTool(
    "get_game_store_material",
    {
      title: "Steamストア素材を取得",
      description:
        "自分の登録ゲームについて、Steamストアページの材料を取得する。" +
        "保存済みの下書きがあればそれを、無ければゲーム情報から作った初期値を返す。" +
        "この材料をもとにストアページ原稿を作成し、publish_steam_store_page で発売くんの" +
        "「Steamストア素材」画面に保存する。Steamはストアページ作成の公開APIを提供しないため、" +
        "最終的な登録・公開はユーザーがSteamworks管理画面に貼り付けて手動で行う。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard で確認）"),
      },
    },
    async ({ game_id }) => {
      const r = await getGameStoreMaterial(key, game_id);
      const text =
        r.source === "saved"
          ? `保存済みのSteamストア素材を取得しました（${r.game_title}）。`
          : `「${r.game_title}」のストア素材の初期値を取得しました。これを材料に下書きを作成してください。`;
      return reply(text, r);
    },
  );

  server.registerTool(
    "publish_steam_store_page",
    {
      title: "Steamストア素材を発売くんに保存",
      description:
        "Claude/Codexが作成したSteamストアページの下書き（短い説明・About This Game・スペック）を、" +
        "Webの「Steamストア素材」画面に保存して表示する。サーバー側ではLLMを呼ばない。" +
        "ユーザーから『Steamストアページを作成して』等の依頼がある時に使う。" +
        "先に get_game_store_material で材料を取得し、事実に基づく内容だけを書く。" +
        "Steamはストアページ作成の公開APIを持たないため、これはあくまで貼り付け用の下書き保存であり、" +
        "実際のストア登録・公開はユーザーがSteamworks管理画面で手動実施する。" +
        "保存は既定で status='draft'（下書き）。秘密情報・Steam財務キー・APIキーは含めない。",
      inputSchema: {
        game_id: z.number().int().describe("ゲームID（get_my_dashboard / get_game_store_material で確認）"),
        app_name: z.string().max(200).optional().describe("ストア表示用アプリ名"),
        short_description: z
          .string()
          .max(300)
          .optional()
          .describe("短い説明（検索/カード表示用。300字以内）"),
        about_md: z.string().max(12000).optional().describe("About This Game 本文。Markdown可"),
        spec: z
          .object({
            app_type: z.string().max(40).optional().describe("種別。例: game / dlc / demo"),
            developer: z.string().max(120).optional(),
            publisher: z.string().max(120).optional(),
            coming_soon_blurb: z.string().max(600).optional().describe("近日公開（Coming Soon）文"),
            genres: z.array(z.string().max(60)).max(5).optional().describe("ジャンル"),
            tags: z.array(z.string().max(40)).max(20).optional().describe("ユーザータグ"),
            languages: z.string().max(600).optional().describe("対応言語（UI/音声/字幕）"),
            features: z.array(z.string().max(80)).max(15).optional().describe("Steam機能・特徴"),
            release_date: z.string().max(80).optional().describe("発売日（自由表記）"),
            price: z.string().max(80).optional().describe("価格（自由表記）"),
            content_descriptors: z.string().max(600).optional().describe("コンテンツ設定（成人向け等）"),
            pc_min_md: z.string().max(2000).optional().describe("最低システム要件"),
            pc_rec_md: z.string().max(2000).optional().describe("推奨システム要件"),
            website_url: z.string().max(1000).optional(),
            copyright_notice: z.string().max(300).optional(),
          })
          .optional()
          .describe("ストアのスペック情報。指定したキーだけ更新される"),
        status: z.enum(["draft", "final"]).optional().describe("既定は draft（下書き）。確定時のみ final"),
        generated_by: z.string().max(80).optional().describe("生成者表示。例: Claude / Codex"),
      },
    },
    async ({ game_id, app_name, short_description, about_md, spec, status, generated_by }) => {
      const r = await publishStorePage(key, game_id, {
        app_name,
        short_description,
        about_md,
        spec,
        status,
        generated_by,
      });
      return reply(
        `Steamストア素材を発売くんの「Steamストア素材」画面に保存しました（status=${r.store_status ?? "draft"}）。` +
          `ストアへの登録・公開はSteamworks管理画面に貼り付けて手動で行ってください。`,
        r,
      );
    },
  );

  server.registerTool(
    "save_grant",
    {
      title: "補助金・助成金を発売くんに登録/更新",
      description:
        "ゲーム開発に使える補助金・助成金を、発売くんの「補助金・助成金」画面に登録/更新する。" +
        "外部APIは使わない。Web検索で公式の募集要項を確認し、必ず根拠となる公式URLを url に入れて保存する。" +
        "id を渡すと既存エントリの更新、無ければ新規作成。checklist を渡すと必要書類リストも保存する" +
        "（同じ label の項目はユーザーのチェック状態を引き継ぐ）。" +
        "採択は保証できないため、確認できた事実だけを書き、推測で締切や金額を断定しない。",
      inputSchema: {
        id: z.number().int().optional().describe("更新する補助金ID（get_my_dashboard で確認）。新規は省略"),
        name: z.string().max(200).optional().describe("補助金・助成金の名称。新規時は必須"),
        organization: z.string().max(160).optional().describe("実施機関。例: 中野区 / 文化庁 / 経済産業省"),
        url: z.string().max(1000).optional().describe("公式/根拠URL（募集要項のページ）。必ず入れる"),
        application_url: z.string().max(1000).optional().describe("申請ページのURL"),
        region: z.string().max(80).optional().describe("対象地域。例: 全国 / 東京都 / 中野区"),
        target: z.string().max(120).optional().describe("対象者。例: 中小企業 / 個人事業主 / 法人 / クリエイター"),
        eligible_summary: z.string().max(1000).optional().describe("対象条件の要約"),
        amount: z.string().max(80).optional().describe("補助額（自由表記）。例: 上限100万円・補助率2/3"),
        deadline: z.string().max(10).optional().describe("締切。YYYY-MM-DD 形式のみ"),
        status: z
          .enum(["interested", "preparing", "submitted", "awarded", "rejected"])
          .optional()
          .describe("状況。気になる=interested / 準備中=preparing / 申請済=submitted / 採択=awarded / 不採択=rejected"),
        memo: z.string().max(4000).optional().describe("メモ"),
        last_checked_at: z.string().max(40).optional().describe("公式を確認した日付。例: 2026-06-17"),
        game_id: z.number().int().nullable().optional().describe("関連ゲームID（任意）。紐付けない場合は省略"),
        checklist: z
          .array(
            z.object({
              label: z.string().max(120).describe("必要書類名。例: 事業計画書 / 見積書 / 登記簿謄本"),
              required: z.boolean().optional().describe("必須か。既定 true。任意書類は false"),
            }),
          )
          .max(40)
          .optional()
          .describe("必要書類チェックリスト。渡すとラベル集合を置き換え（既存の done は同名で引き継ぐ）"),
      },
    },
    async (input) => {
      const r = await saveGrant(key, input);
      const g = r.grant;
      return reply(`補助金「${g.name}」を発売くんの「補助金・助成金」画面に保存しました（ID ${g.id}）。`, r);
    },
  );

  server.registerTool(
    "save_grant_document",
    {
      title: "補助金の申請書ドラフトを保存",
      description:
        "補助金の申請書類の中身（事業計画・志望理由など）をMarkdownのドラフトとして、" +
        "発売くんの該当補助金に保存する。サーバー側ではLLMを呼ばない。" +
        "様式が補助金ごとに違うため、ここでは“中身”を作る。完成した公式様式ファイル(PDF/Word)は" +
        "ユーザーがサイトからアップロードする。秘密情報・APIキーは含めない。",
      inputSchema: {
        grant_id: z.number().int().describe("補助金ID（get_my_dashboard / save_grant で確認）"),
        doc_id: z.number().int().optional().describe("更新する下書きID。新規は省略"),
        title: z.string().max(200).optional().describe("下書きのタイトル。例: 事業計画書ドラフト"),
        content_md: z.string().max(20000).optional().describe("申請書の中身。Markdown可"),
        status: z.enum(["draft", "final"]).optional().describe("既定 draft"),
      },
    },
    async ({ grant_id, doc_id, title, content_md, status }) => {
      const r = await saveGrantDocument(key, grant_id, { docId: doc_id, title, content_md, status });
      return reply("申請書ドラフトを発売くんの「補助金・助成金」画面に保存しました。", r);
    },
  );

  server.registerTool(
    "save_crowdfunding_campaign",
    {
      title: "クラウドファンディング企画を発売くんに登録/更新",
      description:
        "ゲーム向けクラウドファンディングの企画・プラットフォーム候補・目標額・期間・リターン案を、" +
        "発売くんの「クラファン支援」画面に登録/更新する。" +
        "ユーザーが『クラウドファンディングを発売くんに登録して』『企画を保存して』と明示した時に使う。" +
        "id を渡すと既存エントリの更新、無ければ新規作成。checklist を渡すと準備チェックも保存する" +
        "（同じ label の項目はユーザーのチェック状態を引き継ぐ）。" +
        "プラットフォーム条件・手数料・審査基準は変わるため、確認できた事実だけを書き、推測で断定しない。" +
        "秘密情報・APIキー・個人住所・銀行情報は含めない。",
      inputSchema: {
        id: z.number().int().optional().describe("更新するクラファンID（get_my_dashboard で確認）。新規は省略"),
        title: z.string().max(200).optional().describe("キャンペーン名。新規時は必須"),
        platform: z.string().max(80).optional().describe("候補/利用プラットフォーム。例: CAMPFIRE / Kickstarter / Makuake"),
        url: z.string().max(1000).optional().describe("キャンペーンURLまたは根拠URL"),
        goal_amount: z.number().int().nonnegative().optional().describe("目標額。例: 1000000"),
        currency: z.string().max(12).optional().describe("通貨。例: JPY / USD"),
        starts_at: z.string().max(10).optional().describe("開始日。YYYY-MM-DD 形式のみ"),
        ends_at: z.string().max(10).optional().describe("終了日。YYYY-MM-DD 形式のみ"),
        status: z
          .enum(["idea", "researching", "preparing", "live", "finished", "cancelled"])
          .optional()
          .describe("状況。構想=idea / 調査中=researching / 準備中=preparing / 実施中=live / 終了=finished / 中止=cancelled"),
        target_summary: z.string().max(1000).optional().describe("支援者ターゲットの要約"),
        reward_summary: z.string().max(2000).optional().describe("リターン案の要約"),
        pitch_summary: z.string().max(2000).optional().describe("訴求・本文要約"),
        memo: z.string().max(4000).optional().describe("メモ"),
        last_checked_at: z.string().max(40).optional().describe("公式・規約・候補ページを確認した日付。例: 2026-06-17"),
        game_id: z.number().int().nullable().optional().describe("関連ゲームID（任意）。紐付けない場合は省略"),
        checklist: z
          .array(
            z.object({
              label: z.string().max(120).describe("準備項目。例: メインビジュアル / リターン設計 / 審査提出 / 告知カレンダー"),
              required: z.boolean().optional().describe("必須か。既定 true。任意項目は false"),
            }),
          )
          .max(40)
          .optional()
          .describe("準備チェックリスト。渡すとラベル集合を置き換え（既存の done は同名で引き継ぐ）"),
      },
    },
    async (input) => {
      const r = await saveCrowdfundingCampaign(key, input);
      const c = r.campaign;
      return reply(`クラウドファンディング「」を発売くんの「クラファン支援」画面に保存しました（ID ）。`, r);
    },
  );

  server.registerTool(
    "save_crowdfunding_document",
    {
      title: "クラウドファンディング本文・リターン案を保存",
      description:
        "クラウドファンディング本文、リターン案、FAQ、告知文などをMarkdownのドラフトとして、" +
        "発売くんの該当クラファンに保存する。サーバー側ではLLMを呼ばない。" +
        "ユーザーが『本文を作って発売くんに保存して』『リターン案を保存して』と明示した時に使う。" +
        "秘密情報・APIキー・個人住所・銀行情報は含めない。",
      inputSchema: {
        campaign_id: z.number().int().describe("クラファンID（get_my_dashboard / save_crowdfunding_campaign で確認）"),
        doc_id: z.number().int().optional().describe("更新する原稿ID。新規は省略"),
        title: z.string().max(200).optional().describe("原稿タイトル。例: 本文ドラフト / リターン案 / 告知文"),
        content_md: z.string().max(24000).optional().describe("原稿本文。Markdown可"),
        status: z.enum(["draft", "final"]).optional().describe("既定 draft"),
      },
    },
    async ({ campaign_id, doc_id, title, content_md, status }) => {
      const r = await saveCrowdfundingDocument(key, campaign_id, { docId: doc_id, title, content_md, status });
      return reply("クラウドファンディング原稿を発売くんの「クラファン支援」画面に保存しました。", r);
    },
  );

  server.registerTool(
    "get_my_dashboard",
    {
      title: "自分のダッシュボード概要",
      description:
        "発売くんに登録した自分の情報、登録済みゲーム一覧、補助金、クラウドファンディング（id付き）を取得する。",
      inputSchema: {},
    },
    async () => {
      const r = await getMyDashboard(key);
      const text =
        `${r.user.studio_name ?? r.user.email} さんの登録ゲーム ${r.games.length}件、補助金 ${r.grants?.length ?? 0}件、クラファン ${r.crowdfunding?.length ?? 0}件:\n` +
        r.games
          .map((g: any) => `- [${g.id}] ${g.title}（${g.status ?? "—"}）`)
          .join("\n");
      return reply(text, r);
    },
  );
}
