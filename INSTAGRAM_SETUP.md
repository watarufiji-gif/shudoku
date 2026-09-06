# Instagram自動生成・投稿機能 — セットアップ手順

週読サイト（Netlify + Supabase）に追加する、Instagramカルーセル投稿の自動生成・投稿機能です。
YouTube動画やこのフォルダの構成については `CLAUDE.md` の運用方針（生成と公開を分離する）に
合わせて設計しています。**生成・画像化はここで完結し、実際にInstagramへ公開するのは
管理画面で「Instagramに投稿する」ボタンを押した時だけ**です。自動巡回・無人投稿はしません。

---

## 0. 追加されるファイル一覧

```
admin-instagram.html              管理画面（新規ページ）
admin-instagram.js
netlify/functions/
  instagram-generate.js           URL→市場調査→スライド企画生成
  instagram-render.js             スライド→JPEG画像化→Supabase Storageに保存
  instagram-publish.js            Instagramへ実際に投稿
  instagram-history.js            投稿履歴の一覧取得
  instagram-token-refresh.js      アクセストークンの自動更新（月1回・scheduled）
  lib/
    fonts.js
    render-carousel.js            画像レンダリング本体（satori + resvg + sharp）
    instagram-api.js              Instagram Graph APIラッパー
    content-pipeline.js           URL取得・市場調査・企画生成（Claude API）
    app-settings.js
    auth.js
assets/fonts/
  NotoSansJP-Bold.ttf              画像レンダリング用フォント（同梱済み）
  NotoSansJP-Regular.ttf
instagram-schema.sql               Supabase用SQL（テーブル・Storageバケット作成）
```

既存のファイル（`admin.html`、`netlify.toml`、`package.json`）は**上書きしていません**。
変更が必要な箇所は下記「3. 設定ファイルの変更」に手動で追記する箇所として明記しています。

---

## 1. ファイルをリポジトリに配置

このzipの中身を、`shudoku` リポジトリの同じパスにそのままコピーしてください
（`netlify/functions/` や `assets/fonts/` は既存フォルダにマージされます）。

```bash
# 例：リポジトリのルートで
cp -r /path/to/shudoku-instagram-feature/* /path/to/shudoku/
```

---

## 2. 依存パッケージを追加

`package.json` の `dependencies` に以下を追加し、`npm install` を実行してください。

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.124.0",
    "@resvg/resvg-js": "^2.6.0",
    "cheerio": "^1.2.0",
    "fontkit": "^2.0.0",
    "satori": "^0.16.0",
    "sharp": "^0.34.0",
    "youtube-transcript": "^1.3.1"
  }
}
```

（既存の `@supabase/supabase-js` と `resend` はそのままで問題ありません）

---

## 3. 設定ファイルの変更

### 3-1. `netlify.toml`

既存の `[functions]` ブロックと `[[headers]]` の下に、以下を**追記**してください
（`@resvg/resvg-js` はネイティブバイナリを含むため、esbuildにバンドルさせず
そのまま同梱する必要があります。フォントファイルも同様です）。

```toml
[functions]
  node_bundler = "esbuild"
  node_bundler_options = { target = "node22", external_node_modules = ["@resvg/resvg-js", "sharp"] }
  included_files = ["assets/fonts/**"]

[functions."instagram-token-refresh"]
  schedule = "0 3 1 * *"   # 毎月1日 12:00 JST にアクセストークンを自動更新
```

> 既存の `[functions."send-weekly"]` はそのまま残してください。`[functions]` ブロックが
> 2つに分かれないよう、`node_bundler` 行は既存の `[functions]` ブロックに統合してください。

### 3-2. Netlify環境変数

Netlifyダッシュボード → Site configuration → Environment variables で以下を追加：

| 変数名 | 値 | 備考 |
|--------|-----|------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com/settings/keys) で発行 |
| `IG_USER_ID` | Instagramの数値ユーザーID | 手順5で取得 |
| `IG_GRAPH_HOST` | `graph.instagram.com` | 手順4で「Instagram Login」構成にした場合。省略時のデフォルトも同じ値です |

既存の `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `ADMIN_PASSWORD` はそのまま使います。

---

## 4. Supabaseのセットアップ

1. Supabaseダッシュボード（プロジェクト: `syudoku` / ID: `gpmdnzcrklolwczoxybb`）を開く
2. SQL Editorで `instagram-schema.sql` の中身を実行
   - `instagram_posts` テーブル（生成・投稿履歴）
   - `app_settings` テーブル（アクセストークンなど、実行時に更新する値）
   - `instagram-carousels` Storageバケット（画像の公開URL用）

---

## 5. Instagramアカウント＋Meta開発者アプリの準備（初回のみ・手動）

すでに「まだ作っていない」とのことなので、まずここから進めます。
API投稿には**Instagramのビジネス/クリエイターアカウント**が必須です。

### 5-1. Instagramアカウントを作成 → プロアカウントに変換

1. 週読用のInstagramアカウントを通常通り作成（メール/電話番号の確認は本人しか完了できません）
2. アプリ内: 設定 → アカウントの種類とツール → 「プロアカウントに切り替える」
3. カテゴリは「メディア」「著者」など近いものを選択、ビジネスかクリエイターかは
   どちらでもAPI投稿は可能（Facebookページ連携が不要な「Instagram Login」構成を使うため）

### 5-2. Meta開発者アプリを作成

1. [developers.facebook.com/apps/creation](https://developers.facebook.com/apps/creation) にアクセス
2. ユースケースは **「その他」**、アプリタイプは **「ビジネス」** を選択して作成
3. 作成したアプリのダッシュボードで「Instagram」プロダクトを追加

### 5-3. 自分自身をInstagramテスターとして追加

**この手順のおかげで、Meta App Review（審査）は不要です**（自分のアカウントにのみ投稿するため）。

1. アプリダッシュボード → 「アプリの役割」（App Roles）→ Instagramテスターとして
   週読のInstagramアカウント（ユーザー名）を追加
2. Instagramアプリまたは [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access)
   を開き、届いた招待を承認する

### 5-4. アクセストークンを発行

1. アプリダッシュボード → 「Instagram」→ **「API Setup with Instagram Business Login」**
2. 画面の案内に従うと、その場で**長期アクセストークン**（有効期限60日）を発行できます
3. 発行されたトークンをコピーしておく

> Metaのダッシュボードは頻繁にUIが更新されるため、上記メニュー名が多少変わっている
> 可能性があります。「Instagram」→ 投稿・公開（Content Publishing）関連の設定項目を探してください。

### 5-5. Instagramユーザー ID（IG_USER_ID）を確認

発行したトークンを使って、以下にブラウザまたはcurlでアクセスすると確認できます。

```
https://graph.instagram.com/v23.0/me?fields=id,username&access_token=発行したトークン
```

返ってきた `id`（数値）を Netlify環境変数 `IG_USER_ID` に設定してください。

### 5-6. トークンをSupabaseに登録

Supabase SQL Editorで以下を実行（`instagram-schema.sql` の末尾にコメントアウトで入っています）。

```sql
insert into public.app_settings (key, value)
values ('ig_access_token', 'ここに5-4で取得した長期アクセストークンを貼り付け')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

これでセットアップは完了です。以降は `instagram-token-refresh.js` が毎月自動でトークンを
延長するため、60日ごとに手動更新する必要はありません（延長には失敗しても即エラーにはならず、
現在のトークンが生きている限り投稿は継続できます。ログは監視してください）。

---

## 6. 使い方

1. `https://syudoku.com/admin-instagram.html` を開き、`ADMIN_PASSWORD` でログイン
   （`/admin.html` にログイン済みなら自動的にログイン状態になります）
2. 元ネタのURL（ブログ・商品ページ・YouTube動画）を入力し「企画を生成する」
3. 生成された10枚分の見出し・キャプション・ハッシュタグを確認・編集
4. 「画像を生成する」でカルーセル画像をレンダリング（この時点ではまだ下書き状態）
5. プレビューを確認し、問題なければ「Instagramに投稿する」で公開

過去の生成・投稿はページ下部の「投稿履歴」から一覧で確認できます。

---

## 7. ローカルでのテスト

```bash
netlify dev
```

`http://localhost:8888/admin-instagram.html` でNetlify Functionsごと動作確認できます
（`netlify dev` 未インストールの場合は `npm install -g netlify-cli`）。

画像レンダリング部分だけを単体で試したい場合：

```js
const { renderCarousel } = require('./netlify/functions/lib/render-carousel');
// slides配列を渡すとJPEGバッファの配列が返る（Anthropic APIキー不要）
```

---

## 8. コスト・制限の目安

- Anthropic API：Web検索あり1投稿あたり数十円程度。`skipResearch` オプションでさらに削減可能
- Instagram Graph API：無料。ただし24時間で最大100投稿までのレート制限あり
- カルーセル画像は2〜10枚の範囲（Instagram側の制約）

---

## 9. 既知の注意点

- `IG_GRAPH_HOST` はMetaのアプリ構成（Instagram LoginかFacebook Loginか）によって
  `graph.instagram.com` / `graph.facebook.com` を使い分けてください
- 生成される文章・画像の内容は必ず投稿前に目視確認してください（自動公開はしない設計ですが、
  誤った情報を含んだまま投稿しないよう、最終確認は人が行う前提です）
- `instagram-token-refresh.js` はNetlify Scheduled Functionsの実行ログで定期的に確認してください
