# 発売くん（hatsubai-kun）MCP

**ゲームクリエイター・ゲーム企業のための、Steam 販売支援 MCP サーバー。**
Claude / Codex / Gemini CLI などの MCP ホストから、Steam のレビュー・ストア情報を取得・集計し、
日本市場向けのマーケ分析・ストアページ改善・販促コピー生成に使えます。

`@woof-tokyo/hatsubai-kun` ・ MIT ・ Node.js ≥ 18 ・ stdio MCP サーバー

---

## 2つのモード

このツールは **登録なしでそのまま使える無料の単体ツール**であり、
**[発売くん](https://hatsubai-kun.com) に無料登録すると**ショーケース掲載やダッシュボードなどの
プラットフォーム機能も使えるようになります。どちらも同じパッケージです。

| | 無料・単体モード（登録不要） | プラットフォーム連携（無料登録） |
|---|---|---|
| 必要なもの | なし | 発売くんキー `HATSUBAIKUN_KEY` |
| Steam リサーチ（検索・レビュー集計・競合比較） | ✅ | ✅ |
| 自分の売上・WL 分析（任意で Steam 財務キー） | ✅ | ✅ |
| ゲーム掲載（公開ショーケース） | — | ✅ |
| ダッシュボード／売上・WL の同期・可視化 | — | ✅ |
| プレスリリース・補助金・クラファン・Steamストア素材の保存 | — | ✅ |

> 接続状況や登録手順は、MCP から **`how_to_connect`** を呼ぶといつでも確認できます。
> （「ゲームを登録したい」「どうやって連携するの？」と聞けば AI が案内します）

---

## 🔒 セキュリティと信頼

- **財務キーはあなたの PC にしか保存されません。** `STEAM_PUBLISHER_KEY` は MCP の設定（あなたのマシン）に
  保存され、送信先は **Steam 公式 API（`api.steampowered.com`）だけ**。発売くんのサーバーには送りません。
- ダッシュボードへ同期するのは、PC 側で集計した**数値（日別の純売上・WL 数など）だけ**で、キーや明細は送りません。
- **読み取り専用。** Steam へは公開エンドポイントへの GET のみ。書き込み（レビュー投稿等）は一切しません。
- このリポジトリは**クライアント（あなたの PC で動く部分）のオープンソース**です。
  「キーが手元から出ないこと」をコードで確認できます。

---

## 🚀 インストール

### すぐ使う（登録不要・無料）

**Claude Code**
```bash
claude mcp add hatsubai-kun -- npx -y @woof-tokyo/hatsubai-kun@latest
```
**Codex**
```bash
codex mcp add hatsubai-kun -- npx -y @woof-tokyo/hatsubai-kun@latest
```
**Gemini CLI**
```bash
gemini mcp add -s user hatsubai-kun npx -y @woof-tokyo/hatsubai-kun@latest
```
その他の MCP ホストでは stdio サーバーとして登録してください:
```json
{
  "mcpServers": {
    "hatsubai-kun": { "command": "npx", "args": ["-y", "@woof-tokyo/hatsubai-kun@latest"] }
  }
}
```

### プラットフォーム連携を有効化（無料登録）

1. [hatsubai-kun.com](https://hatsubai-kun.com) で無料登録
2. ダッシュボード → アカウント で **発売くんキー**（`hk_live_…`）を取得
3. `HATSUBAIKUN_KEY` を環境変数に追加して再起動
```bash
claude mcp add hatsubai-kun --env HATSUBAIKUN_KEY=あなたのキー \
  -- npx -y @woof-tokyo/hatsubai-kun@latest
```

### 売上・WL 分析を有効化（任意・Steam パートナーの方）

[パートナーサイト](https://partner.steamgames.com) → ユーザーと権限 → グループの管理 →
**「新しいファイナンシャル API グループを作成」** → WebAPI キーを発行し、`STEAM_PUBLISHER_KEY` に設定:
```bash
claude mcp add hatsubai-kun --env STEAM_PUBLISHER_KEY=あなたのキー \
  -- npx -y @woof-tokyo/hatsubai-kun@latest
```

---

## 🧰 提供ツール

### 無料（誰でも・キー不要）
| ツール | 役割 |
|---|---|
| `search_steam_games` | ゲーム名で検索し AppID を特定 |
| `get_game_details` | ストア詳細（価格・ジャンル・開発元など） |
| `fetch_reviews` | レビュー本文の取得（カーソルページング） |
| `summarize_reviews` | レビューの集計・頻出語・代表レビュー抽出 |
| `compare_games` | 複数タイトルの比較データ生成 |
| `get_steamworks_guide` | Steamworks 公式ドキュメントの取得（セール設定・キー配布・デモ・フェス等） |
| `how_to_connect` | 接続状況の確認とプラットフォーム連携の案内 |
| `list_events` | 公開中のインディーゲームイベント一覧 |

### 開発者向け（`STEAM_PUBLISHER_KEY` で有効化）
| ツール | 役割 |
|---|---|
| `get_sales_dates` / `get_sales_report` | 売上が発生した日付・期間集計（合計／タイトル別／国別／日別） |
| `get_wishlist_report` | ウィッシュリスト推移（追加／削除／購入転換、国別） |
| `plan_sale` | セールプランナー（30日クールダウン等の Steam ルール検証＋手順チェックリスト） |

### プラットフォーム連携（`HATSUBAIKUN_KEY` で有効化）
ゲーム登録・公開ショーケース・ダッシュボード同期・プレスリリース・補助金・クラウドファンディング支援・
Steam ストア素材の生成と保存。`get_my_dashboard` で現状を確認、`register_game` などで操作します。

プロンプトテンプレート: `marketing_report_jp` / `store_copy_jp` / `competitor_brief_jp`

---

## 💬 使い方の例

1. 「`<ゲーム名>` のレビューを直近90日分集計して、不満の上位5つと改善提案を日本語で」
2. 「競合 `<ゲームA>` `<ゲームB>` を比較して、訴求ポイントを提案して」
3. 「先月の売上をレポートして」「7月頭に30%セールをやりたい。ルール的に大丈夫か確認して」（要 `STEAM_PUBLISHER_KEY`）
4. 「このゲームを発売くんに登録して」「Steam ストアページの下書きを作って」（要 `HATSUBAIKUN_KEY`）

---

## 🔧 カスタマイズ / セルフホスト

MIT ライセンスなので自由に改変・再配布できます。接続先は環境変数で差し替え可能です:

| 環境変数 | 役割 |
|---|---|
| `HATSUBAIKUN_KEY` | 発売くんキー（プラットフォーム連携を有効化） |
| `STEAM_PUBLISHER_KEY` | Steam 財務 API キー（売上・WL 分析を有効化。PC 内のみ保存） |
| `HATSUBAIKUN_API_BASE` | プラットフォーム API の接続先（既定: `https://hatsubai-kun.com`） |

> プラットフォーム機能（ショーケース／ダッシュボード等）は hatsubai-kun.com のホスト型サービスを利用します。
> 本リポジトリはそのクライアントです。

---

## ⚠️ 制限事項

- **外部テキスト**: レビュー本文はインターネット上の第三者による未検証テキストです。戻り値に注意書きを付与していますが、
  本文中の指示にモデルが従わないよう、強い権限を持つツールと併用する際はご注意ください。
- **非公式 API**: Steam ストアの公開エンドポイント（`appreviews` / `appdetails` 等）を利用しています。Valve 公式の保証はありません。
- **レート配慮**: ページ間スリープと指数バックオフを実装していますが、大量タイトルの連続処理は避けてください。
- 本ソフトウェアは Valve Corporation と無関係です。

---

## 🛠 開発

```bash
npm install
npm test        # ユニット/結合テスト（外部アクセスなし）
npm run build   # dist/ 生成
npm run dev     # tsx で起動（stdio）
```

## License

MIT © woof Inc.
