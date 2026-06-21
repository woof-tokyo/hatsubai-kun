# 発売くん（hatsubai-kun）

ゲームクリエイター・ゲーム企業のための**販売支援 MCP サーバー**。
Claude / Codex / Gemini CLI などの MCP ホストから Steam のレビュー・ストア情報を取得・集計し、
日本市場向けのマーケ分析・ストアページ改善・販促コピー生成に使えます。
（今後 Steam 以外のプラットフォームにも拡大予定）

- **読み取り専用** — Steam の公開エンドポイントへの GET のみ。書き込み・ローカルファイルアクセスは一切しません
- **基本機能はAPIキー不要** — Steam 公開情報の取得・分析は認証なしで使えます（開発者向けの売上分析のみ、任意で自分の Steam 財務キーを使用）
- 日本語レビューの集計・頻出トピック抽出に対応

## インストール

Claude Code:
```bash
claude mcp add hatsubai-kun -- npx -y @woof-tokyo/hatsubai-kun@latest
```

Codex:
```bash
codex mcp add hatsubai-kun -- npx -y @woof-tokyo/hatsubai-kun@latest
```

Gemini CLI:
```bash
gemini mcp add -s user hatsubai-kun npx -y @woof-tokyo/hatsubai-kun@latest
```

他の MCP ホストでは stdio サーバーとして登録してください:

```json
{
  "mcpServers": {
    "hatsubai-kun": { "command": "npx", "args": ["-y", "@woof-tokyo/hatsubai-kun@latest"] }
  }
}
```

## 提供ツール

### 無料（誰でも・キー不要）

| ツール | 役割 |
|---|---|
| `search_steam_games` | ゲーム名で検索し AppID を特定 |
| `get_game_details` | ストア詳細（価格・ジャンル・開発元など） |
| `fetch_reviews` | レビュー本文の取得（カーソルページング） |
| `summarize_reviews` | レビューの集計・頻出語・代表レビュー抽出 |
| `compare_games` | 複数タイトルの比較データ生成 |
| `get_steamworks_guide` | Steamworks 公式ドキュメントの取得（セール設定・無料キー配布・デモ・フェス等のやり方を公式情報を根拠に回答） |

### 開発者向け（自分の Steamworks キーで有効化）

Steamworks パートナーの方は、**自分の財務APIキー**を渡すと自タイトルの売上・ウィッシュリスト
分析ツールが追加されます。

**キーの発行**: [パートナーサイト](https://partner.steamgames.com) → ユーザーと権限 →
グループの管理 → **「新しいファイナンシャルAPIグループを作成」** → グループ内で WebAPI キーを発行

```bash
claude mcp add hatsubai-kun --env STEAM_PUBLISHER_KEY=あなたのキー \
  -- npx -y @woof-tokyo/hatsubai-kun@latest

codex mcp add hatsubai-kun --env STEAM_PUBLISHER_KEY=あなたのキー \
  -- npx -y @woof-tokyo/hatsubai-kun@latest

gemini mcp add -s user -e STEAM_PUBLISHER_KEY=あなたのキー \
  hatsubai-kun npx -y @woof-tokyo/hatsubai-kun@latest
```

| ツール | 役割 |
|---|---|
| `get_sales_dates` | 売上が発生した日付の一覧 |
| `get_sales_report` | 期間指定の売上集計（合計 / タイトル別 / 国別 / 日別） |
| `get_wishlist_report` | 期間指定のウィッシュリスト推移（追加 / 削除 / 購入転換、国別） |
| `plan_sale` | セールプランナー: 計画中の割引が Steam 公式ルール（30日クールダウン等）に違反しないか、自分の売上履歴から過去の割引を検出して検証。設定手順チェックリスト付き |

使用例: 「先月の売上をレポートして」「直近2週間のウィッシュリスト推移を国別で見せて」
「7月頭に30%セールをやりたい。ルール的に大丈夫か確認して」

**キーの扱い**: キーはあなたのマシンの MCP 設定に保存されるだけで、Steam 公式 API
（`api.steampowered.com`）以外には一切送信されません。本パッケージの作者がキーや
売上データを受け取ることはありません。

プロンプトテンプレート: `marketing_report_jp` / `store_copy_jp` / `competitor_brief_jp`

## 使い方の例

1. 「`<ゲーム名>` のレビューを直近90日分集計して、不満の上位5つと改善提案を日本語で」
2. 「競合 `<ゲームA>` `<ゲームB>` を比較して、訴求ポイントを提案して」
3. 「このタイトルの好評ポイントから Steam ストア用の日本語コピーを5案」

## セキュリティと制限事項

- **外部テキストの取り扱い**: 本ツールが返すレビュー本文はインターネット上の第三者による
  未検証テキストです。戻り値には注意書きを付与していますが、レビュー本文中の指示文に
  モデルが従わないよう、他の強い権限を持つツールと併用する際はご注意ください。
- **非公式 API**: Steam ストアの公開エンドポイント（`appreviews` / `appdetails` 等）を利用して
  います。Valve 公式の保証はなく、予告なく仕様変更される可能性があります。
- **レート配慮**: ページ間スリープと指数バックオフを実装していますが、大量タイトルの
  連続処理は避けてください。
- 本ソフトウェアは Valve Corporation と無関係です。レビュー本文の二次利用は
  Steam の利用規約の範囲でお願いします。

## 開発

```bash
npm install
npm test        # ユニット/結合テスト（外部アクセスなし）
npm run build   # dist/ 生成
npm run dev     # tsx で起動（stdio）
```

## License

MIT © woof Inc.
