# 週読 - 運営マニュアル

このファイルは、ウェブサイト「週読」の運営方法をまとめたものです。

## 1. 収益化の設定（アフィリエイトIDの埋め込み）

`index.html` ファイルを開き、Amazonのリンクをご自身のものに書き換えてください。

1. `index.html` をテキストエディタで開きます。
2. 「Amazonで購入する」ボタンのリンクを探します（48行目付近）。
3. `tag=YOUR_AFFILIATE_ID` の部分を、あなたのアソシエイトID（例: `tag=mybook-22`）に書き換えて保存します。

```html
<!-- 変更前 -->
<a href="https://www.amazon.co.jp/dp/**********?tag=YOUR_AFFILIATE_ID" ...>

<!-- 変更後（例） -->
<a href="https://www.amazon.co.jp/dp/**********?tag=mybook-22" ...>
```

> **注意**: サイトを公開したら、そのURLを必ずAmazonアソシエイトの管理画面で「登録サイト」に追加してください。

## 2. サイトの公開方法（無料で簡単）

一番簡単な「Netlify（ネットリファイ）」を使う方法です。

1. [Netlify](https://www.netlify.com/) にアクセスし、サインアップ（登録）します。
2. ログイン後の画面（Team Overview）で、「Add new site」→「Deploy manually」を選択します。
    - または [Netlify Drop](https://app.netlify.com/drop) に直接アクセスします。
3. デスクトップにある **「図書」フォルダをそのまま** ブラウザの枠内にドラッグ＆ドロップします。
4. 数秒でアップロードが完了し、公開URLが発行されます。

## 3. 毎週の更新方法

新しい週になったら、以下の手順で更新します。

1. **画像の変更**:
   - `index.html` の `<img src="...">` を新しい本の画像URLに変更します。
   - ※Amazonの商品画像URLを使うか、Unsplashなどの雰囲気の良い画像を使います。

2. **テキストの変更**:
   - 本のタイトル、著者名、引用文、紹介文を書き換えます。

3. **アーカイブへの移動**:
   - 今までの「今週の一冊」のコードをコピーして、下部の「過去の一冊（archive）」セクションに追加します。
   - 古い情報をアーカイブに移し、メインエリアを新しい本に書き換えるイメージです。

4. **再アップロード**:
   - 更新した「図書」フォルダを、再度Netlifyにドラッグ＆ドロップすれば、上書き更新されます。

## 4. フォルダ構成

- `index.html`: サイトのメインファイル（文章や構造はここ）
- `style.css`: デザインのファイル（色や配置を変えたい時はここ）
- `script.js`: 動きのファイル（カウントダウンなどの機能）
- `analytics-config.js`: GA4設定
- `microcms-config.js`: microCMS設定
- `_headers`: Netlify向けセキュリティヘッダー
- `_redirects`: 非公開ページの公開ブロック設定
- `sitemap.xml` / `robots.txt`: SEO用
- `RELEASE_CHECKLIST.md`: 毎週の公開チェック
- `SECURITY_RUNBOOK.md`: キーローテーション手順
- `README.md`: この説明書

## 5. 本番DB移行（Supabase）

このプロジェクトは `Supabase Auth + Postgres` で本番運用できるようにしてあります。

### 5-1. 設定ファイル

`supabase-config.js` を編集して、Supabase プロジェクトの値を設定します。

```js
const staticSupabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co';
const staticSupabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
window.ENABLED_OAUTH_PROVIDERS = ['google']; // 使うものだけ
```

補足:
- `staticSupabaseUrl` / `staticSupabaseAnonKey` を空欄のままでも、`login.html` の「Supabase接続設定」フォームからブラウザ保存して動かせます。
- `window.ENABLED_OAUTH_PROVIDERS` に入っていないOAuthボタンは非表示になります。
- 運営者向け設定は `login.html?admin=1` で表示されます（通常ユーザーには非表示）。
- ただし本番では `_redirects` により `login.html` / `my-library.html` はトップへリダイレクトされます。

### 5-2. テーブル作成（SQL Editor で実行）

```sql
create table if not exists public.reading_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null,
  status text not null,
  completed_on date,
  rating int,
  note text,
  created_at timestamptz not null default now()
);

alter table public.reading_entries enable row level security;

create policy "users_can_select_own_entries"
on public.reading_entries
for select
using (auth.uid() = user_id);

create policy "users_can_insert_own_entries"
on public.reading_entries
for insert
with check (auth.uid() = user_id);

create policy "users_can_delete_own_entries"
on public.reading_entries
for delete
using (auth.uid() = user_id);

create policy "users_can_update_own_entries"
on public.reading_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

### 5-3. Auth 設定

- Supabase Dashboard > Authentication > Providers で `Email` を有効化
- `Google` / `Facebook` / `Twitter (X)` / `Apple` を有効化し、各ProviderのClient ID/Secretを設定
- 必要に応じて `Confirm email` のON/OFFを選択
- 本番ドメインを `URL Configuration` に登録
- ローカル確認用に `http://127.0.0.1:5500/login.html` と `http://127.0.0.1:5500/my-library.html` も Redirect URL に追加
- Redirect URL に `https://あなたのドメイン/my-library.html` を追加

### 5-4. 現在の実装仕様

- 新規登録: Supabase Auth (`signUp`)
- ログイン: Supabase Auth (`signInWithPassword`)
- 読書記録: `public.reading_entries`
- ユーザーごとにRLSでデータを分離

## 6. セキュリティ設定（5分チェック）

### 6-1. Netlify ヘッダーを有効化

- ルートにある `_headers` をそのままデプロイする
- 含まれているヘッダー:
  - `Strict-Transport-Security`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Content-Security-Policy`

### 6-2. Supabase 側の最終確認

- API Keys で公開してよいのは `anon` キーのみ（`service_role` は絶対に置かない）
- Authentication > URL Configuration に本番URL/ローカルURLを登録
- SQL Editor で `5-2` のRLSポリシーまで適用済みか確認

### 6-3. 本番前に動作確認

- 未ログインで `my-library.html` に直接アクセスし、閲覧できないことを確認
- ログイン後に自分のレコードだけ表示・削除できることを確認
- ブラウザ開発者ツールのNetworkで、`http://` リソース混在がないことを確認

## 7. microCMS 連携（今週の一冊を自動反映）

### 7-1. 設定ファイル

- `microcms-config.js` にサービス情報を設定します。
- 優先順位は `localStorage`（ブラウザ保存） > 固定値です。

```js
const staticMicrocmsServiceDomain = 'YOUR_SERVICE_DOMAIN';
const staticMicrocmsApiKey = 'YOUR_READ_ONLY_API_KEY';
window.MICROCMS_ENDPOINT = 'books';
window.MICROCMS_QUERY = 'limit=100&orders=-publishedAt';
```

または `login.html` の「microCMS 接続設定（初回のみ）」から保存可能です。

### 7-2. APIスキーマ（推奨）

`books` エンドポイントに以下フィールドを用意すると、`index.html` と `book-22.html` が自動更新されます。

- `title`（テキスト）
- `author`（テキスト）
- `category`（テキスト）
- `quote`（テキスト）
- `description`（テキストエリア）
- `coverImage`（画像）
- `AmazonURL`（URL）
- `weekLabel`（例: `第1週`）
- `weekDate`（例: `2026年2月22日〜2月28日`）
- `slug`（任意、個別ページURL管理用）
- `publishedAt`（公開日時、並び順の基準）

### 7-3. 運用ルール

- APIキーは **読み取り専用キー** を使う（書き込みキー禁止）
- `script.js` は「最新1件（`publishedAt`降順）」を表示
- `publishedAt` が未来日時の記事は表示対象外（予約投稿公開時刻までは非表示）
- 一覧はページネーション取得（50件超でも取得）
- CMS未設定時はHTMLの既定文面がそのまま表示される

## 8. クリック計測（GA4）

### 8-1. 設定

`analytics-config.js` に Measurement ID を設定します。

```js
window.GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';
```

### 8-2. 動作

- Amazonリンククリック時に `affiliate_click` イベントを送信
- 管理画面向けローカル集計UIはデフォルト非表示（一般公開時は表示しない）

## 9. リンク監視（週次）

- 週1回、以下を実行:

```bash
bash scripts/check-affiliate-links.sh
```

- 結果は `reports/affiliate-link-check-*.txt` に保存
- `curl_error` や 4xx/5xx、`missing_tag` / `placeholder_tag` はURLを修正して再確認
- 本番前は以下を実行（推奨）:

```bash
bash scripts/preflight-check.sh
```

## 10. SEOの基本設定

- `sitemap.xml` と `robots.txt` の `YOUR_DOMAIN` を本番ドメインに置換
- `index.html` / `book-22.html` の canonical / OGP を本番ドメインに合わせる
- 新しい記事ページを追加した場合は `sitemap.xml` にURLを追記
- 一括反映する場合は次を実行:

```bash
bash scripts/apply-production-values.sh <domain> <amazon_tag> [ga4_measurement_id]
```

## 11. セキュリティ運用

- キー運用の詳細は `SECURITY_RUNBOOK.md`
- 特に以下を厳守:
  - `supabase` の `service_role` はフロントで使わない
  - microCMSは Read only キーを使用
  - キー更新後はログイン・CMS反映・計測イベントを再確認
