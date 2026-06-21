# CLAUDE.md — 週読（Shūdoku）プロジェクト設計書

このファイルは週読プロジェクトの全体構造・前提・進め方を記録した「地図」です。
Claude Code はこのファイルを毎回参照し、ここに書かれた構造から逸脱しないこと。
**最終更新：2026-06-21**

---

## プロジェクト概要

週読（Shūdoku）は、読書習慣から離れた社会人向けの「週刊・書評ニュースレター」サービス。
毎週土曜9時に1冊を紹介し、週末の読書・購入行動に合わせて更新する。
運営はソロ。決定志向で、モデルに合わない選択肢は素早く除外して実装に進む方針。

- コンテンツの3本柱：ビジネス書 / 小説 / 人文・哲学
- 収益モデル：**法人スポンサー＋法人一括購読のみ**。個人課金・単号販売・投げ銭は除外済み。
- **検証済みメール購読者リスト（購読者数＋開封率）の構築が最重要**。
  スポンサー交渉では SNS フォロワー数より購読者指標が効く。

---

## 技術スタック（確定）

| 用途 | サービス・場所 |
|------|---------------|
| 開発 | GitHub（watarufiji-gif/shudoku）, VSCode, Claude Code |
| 作業ディレクトリ | `~/Desktop/図書` |
| ホスティング | Netlify（site: syudoku2 / 本番ドメイン syudoku.com） |
| CMS | microCMS（service: shudoku）エンドポイント: `books` |
| DB | Supabase（project ID: gpmdnzcrklolwczoxybb） |
| メール配信 | Resend（contact@syudoku.com / ドメイン認証済み） |
| 将来 | Stripe は収益化フェーズまで保留。Next.js 化は未定 |

---

## 3つの場所（混同しないこと）

1. **店頭 = Netlify**：来訪者が見る公開サイト。静的ファイルを返すだけ。
2. **在庫棚 = microCMS**：記事データの保管庫（`books` エンドポイント）。ビルド時に取り出す。
3. **バックヤード = Netlify Functions**：メール購読・配信・管理画面 API が動く場所。

---

## microCMS の構造（確定・現在稼働中）

### エンドポイント

- **`books`**（リスト形式）：書評コンテンツ。旧「news」は使わない。

### books のフィールド（9個）

| フィールド名 | 型 | 備考 |
|------------|-----|------|
| `title` | テキスト | 本のタイトル（必須） |
| `author` | テキスト | 著者名（必須） |
| `category` | テキスト | ビジネス書 / 小説 / 人文・哲学 |
| `quote` | テキスト | 本からの引用（必須） |
| `description` | テキストエリア | 書評本文（必須） |
| `AmazonURL` | テキスト | Amazon 商品URL（必須）。アフィリエイトタグ付き可 |
| `conclusion` | テキスト | 「この一冊で何が変わるか」一言まとめ |
| `coverImage` | 画像 | 表紙画像（**基本空でよい**。後述の fallback で自動取得） |
| `slug` | テキスト | 詳細ページの URL キー（**基本空でよい**。title から自動生成） |

**作らないフィールド：**
- `weekLabel`：公開日（`publishedAt`）から JST 基準で自動計算するため不要。
- `weekDate`・`pageUrl` など：コードで処理するため CMS には持たない。

---

## 公開フロー（現在の実装）

```
運営者が microCMS で記事を公開・更新
  ↓ Webhook
Netlify が自動ビルド（build command: node scripts/generate-pages.js）
  ↓
generate-pages.js が microCMS から全書籍を取得し以下を生成：
  - {slug}.html  ：各書籍の詳細ページ
  - archive.html ：バックナンバー一覧（全書籍カード）
  - sitemap.xml
  ↓
トップページ（index.html）は script.js がブラウザから microCMS を直接フェッチ
```

承認フローは**現時点では未実装**（将来フェーズで導入予定）。
現在は「microCMS で公開 = 即サイト反映」。

---

## 表紙画像の取得ロジック（3段階 fallback）

ビルド時（`generate-pages.js`）に以下の順序で表紙 URL を解決し、HTML に焼き込む：

1. **microCMS の `coverImage` フィールド**（運営者がアップロードした場合）
2. **AmazonURL から ASIN を抽出** → `https://m.media-amazon.com/images/P/{ASIN}.01.LZZZZZZZ.jpg`
3. **Google Books API**（タイトル＋著者で検索）→ サムネイル URL

通常は AmazonURL さえ入れておけば表紙は自動取得される。`coverImage` フィールドは空でよい。

トップページ（`script.js`）も同様のロジック（`resolveAmazonCoverUrl` → `hydrateMissingCoverImage`）でクライアントサイドに表紙を表示する。

---

## Supabase テーブル構成

### 現在使用中

| テーブル | 用途 |
|---------|------|
| `subscribers` | メール購読者（email, confirmed, source, created_at） |
| `email_campaigns` | 配信ログ（book_title, sent_at, recipients_count など） |
| `email_events` | 開封・クリックイベント（campaign_id, type） |

### 現在未使用（将来の本選定エージェント用）

| テーブル | 用途 |
|---------|------|
| `book_candidates` | 候補プールのメモ（今は運営者が手動で管理） |
| `selection_runs` | エージェントの選定実行ログ（承認フロー未実装のため未使用） |
| `published_books` | 公開済み書籍ログ（未使用） |
| `performance` | 開封率・流入数など実績（未使用） |

`selection_runs` は現在の公開フロー（microCMS → Netlify 直接）では使わない。

---

## APIキーとセキュリティ

### 原則：キーをコードに書かない

| キー | 本番（Netlify） | ローカル |
|------|----------------|---------|
| `MICROCMS_API_KEY` | Netlify 環境変数 | `microcms-config.js` に skip-worktree で保護 |
| `SUPABASE_URL` | Netlify 環境変数 | `.env`（git 追跡しない） |
| `SUPABASE_SERVICE_KEY` | Netlify 環境変数 | `.env`（git 追跡しない） |
| `ADMIN_PASSWORD` | Netlify 環境変数 | `.env`（git 追跡しない） |
| `RESEND_API_KEY` | Netlify 環境変数 | `.env`（git 追跡しない） |

### microcms-config.js の保護

`generate-pages.js` はビルド時に `microcms-config.js` へキーを書き込む。
ローカルで誤ってコミットされないよう skip-worktree を設定済み：

```bash
git update-index --skip-worktree microcms-config.js
```

新しい環境でクローンした場合は上記コマンドを再実行すること。
`git ls-files -v microcms-config.js` で先頭が `S` なら有効。

---

## 開発スタイル（Netlify クレジット節約）

**push = 本番ビルド = クレジット消費**。クレジットリセットは 2026-07-11。

| 操作 | 方針 |
|------|------|
| コード修正 | 自由に実施 |
| `git commit` | 随時（セッションごとに） |
| **`git push`** | **「pushして」と明示されるまで禁止** |
| ローカル確認 | `python3 -m http.server 8080` で静的ファイルを確認 |
| Function 確認 | `node -e` で Function を直接呼ぶか、Netlify CLI（未インストール）の `netlify dev` |

### ローカルで microCMS を使う手順

```bash
# 1. サーバー起動
python3 -m http.server 8080

# 2. ブラウザの DevTools コンソールで API キーをセット
sessionStorage.setItem('microcms_api_key', 'YOUR_KEY')
sessionStorage.setItem('microcms_service_domain', 'shudoku')

# 3. ページをリロード
```

### generate-pages.js をローカルで実行する手順

```bash
MICROCMS_API_KEY=$(node -e "
  const f=require('fs').readFileSync('microcms-config.js','utf8');
  const m=f.match(/staticMicrocmsApiKey\s*=\s*'([^']+)'/);
  process.stdout.write(m?m[1]:'')
") node scripts/generate-pages.js
```

---

## フェーズ進行状況

| フェーズ | 内容 | 状況 |
|---------|------|------|
| **A** | メール購読の土台（登録〜配信〜解除）＋特定電子メール法対応 | **完了** |
| **B** | 開封率・クリック率ダッシュボード（`/admin`） | **実装済み・動作不良**（後述） |
| **C** | SEO アーカイブ（詳細ページ・sitemap 自動生成） | **完了** |
| **D** | 法人向け LP（`/business`）＋メディアキット | 未着手 |

---

## 既知の残課題

### /admin が 502 エラー（調査中）

- `/.netlify/functions/admin-stats` が 502 を返す
- **原因推定**：Netlify 環境変数に `SUPABASE_URL` または `SUPABASE_SERVICE_KEY` が未設定のため、
  `createClient(undefined, undefined)` がモジュール初期化時に例外を投げてクラッシュしている
- **対処**：Netlify ダッシュボード → Site configuration → Environment variables で
  `SUPABASE_URL`・`SUPABASE_SERVICE_KEY`・`ADMIN_PASSWORD` を設定してから Redeploy

### 承認画面（フェーズ B の完全版）が未実装

- 現状：microCMS で公開 → 即サイト反映（承認ゲートなし）
- 将来：Supabase の `selection_runs` を使った「pending → approved」フローを実装予定

---

## 本選定エージェント（将来構想）

毎週の「紹介する本」を人間（運営者）が必ず承認する設計。フル自動投稿はしない。

### 鉄則：生成と公開を分離する

エージェントは Supabase に下書き（`status: pending`）を置くところで必ず止まる。
microCMS → Netlify へ流れるのは、運営者が「承認」した後だけ。

### 選定＝マーケティング判断（採点軸）

- 話題性・タイムリー性（新刊 / 著者が話題 / 映像化 / 季節性）
- 検索需要（長期サイト流入 = リスト構築に複利で効く）
- フック強度（スクロールを止める1行が書けるか）
- ターゲット適合（時間がない / キャリア不安 / 教養コンプレックス）
- シェア・保存性（社会的通貨）
- 独自 angle 可能性（他アカウントが言わないことを言えるか）

初期の重み付けは「検索需要 × タイムリー性」を厚めにし、リスト構築を優先する。

---

## 実装の進め方（人間用メモ）

- 1 フェーズ / 1 ブロック = 1 セッションで進め、終わるたびに `git commit`。
- 各実装の前に「これから変更するファイル・追加カラム・保存先の一覧」を先に提示させる。
- 想定外の改変が混ざっていないか、変更一覧で毎回確認する。
- `git push` は「pushして」と明示されるまで実施しない。
