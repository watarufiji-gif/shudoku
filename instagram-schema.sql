-- ============================================================
-- 週読 Instagram自動生成機能 — Supabaseセットアップ用SQL
-- Supabaseダッシュボード > SQL Editor で実行してください。
-- 対象プロジェクト: syudoku (project ID: gpmdnzcrklolwczoxybb)
-- ============================================================

-- 1) 生成・投稿履歴テーブル
create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  source_url text,
  source_title text,
  slides jsonb not null,
  caption text not null,
  hashtags text[] not null default '{}',
  image_urls text[] not null default '{}',
  status text not null default 'draft',      -- draft | published | failed
  ig_media_id text,
  error_message text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.instagram_posts enable row level security;
-- ポリシーは意図的に追加しない：service_role（Netlify Functions）はRLSを
-- バイパスするため常にアクセス可能。anon/authenticatedキーからは一切読み書きできない
-- （管理画面はADMIN_PASSWORDで保護されたFunction経由でのみアクセスする設計）。

-- 2) アプリ設定テーブル（Instagramアクセストークンなど、実行時に更新が必要な値）
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
-- こちらもservice_roleのみアクセス可能（ポリシー追加なし）。

-- 3) Storageバケット（生成したカルーセル画像をInstagramから読める公開URLで置く場所）
insert into storage.buckets (id, name, public)
values ('instagram-carousels', 'instagram-carousels', true)
on conflict (id) do nothing;

-- 4) 初回セットアップ：Instagramアクセストークンを登録する
--    Meta開発者アプリで取得した「長期アクセストークン」をここに貼り付けて実行してください。
--    （INSTAGRAM_SETUP.md の手順3で取得したものです）
--
-- insert into public.app_settings (key, value)
-- values ('ig_access_token', 'ここに長期アクセストークンを貼り付け')
-- on conflict (key) do update set value = excluded.value, updated_at = now();
