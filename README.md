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
- `README.md`: この説明書

## 5. 本番DB移行（Supabase）

このプロジェクトは `Supabase Auth + Postgres` で本番運用できるようにしてあります。

### 5-1. 設定ファイル

`supabase-config.js` を編集して、Supabase プロジェクトの値を設定します。

```js
window.SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

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
```

### 5-3. Auth 設定

- Supabase Dashboard > Authentication > Providers で `Email` を有効化
- `Google` / `Facebook` / `Twitter (X)` / `Apple` を有効化し、各ProviderのClient ID/Secretを設定
- 必要に応じて `Confirm email` のON/OFFを選択
- 本番ドメインを `URL Configuration` に登録
- Redirect URL に `https://あなたのドメイン/my-library.html` を追加

### 5-4. 現在の実装仕様

- 新規登録: Supabase Auth (`signUp`)
- ログイン: Supabase Auth (`signInWithPassword`)
- 読書記録: `public.reading_entries`
- ユーザーごとにRLSでデータを分離
