#!/usr/bin/env node
/**
 * send-weekly.js の本番テンプレートで、自分のテストアドレス1件にだけメールを送る。
 * Supabase には一切アクセスしない（購読者テーブル・email_campaigns・配信履歴に無影響）。
 *
 * 使い方:
 *   TEST_RECIPIENT=you@example.com node scripts/test-send-weekly.js [--slug=boke-masu-kara]
 *
 * 送信元:
 *   本番の実配信（Gmail上の過去メールで確認済み）と同じ `週読 <contact@syudoku.com>` を
 *   既定値にする。ローカル .env の MAIL_FROM（現状 onboarding@resend.dev で本番と不一致）
 *   は意図的に読まない。本番と同じ from で検証するのが目的のため。
 *   どうしても別の送信元で試したい場合のみ TEST_FROM_OVERRIDE で上書き可能。
 */
'use strict';

const { Resend } = require('resend');
const { _internal } = require('../netlify/functions/send-weekly.js');
const { buildWeeklyHtml, fetchLatestBook } = _internal;

const SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN || 'shudoku';
const API_KEY         = process.env.MICROCMS_API_KEY;

// 本番の実際の送信元（Gmail受信済みメールのFromヘッダで確認済み）。
// .env の MAIL_FROM は本番と食い違っているため、意図的に無視する。
const PRODUCTION_FROM_ADDRESS = '週読 <contact@syudoku.com>';
const FROM_ADDRESS = process.env.TEST_FROM_OVERRIDE || PRODUCTION_FROM_ADDRESS;

async function main() {
  const to = process.env.TEST_RECIPIENT;
  if (!to) {
    console.error('TEST_RECIPIENT が未設定です。例: TEST_RECIPIENT=you@example.com node scripts/test-send-weekly.js');
    process.exit(1);
  }
  if (!API_KEY) {
    console.error('MICROCMS_API_KEY が未設定です（.envを確認してください）');
    process.exit(1);
  }

  const slugArg = process.argv.find(a => a.startsWith('--slug='));
  let book;
  if (slugArg) {
    const slug = slugArg.split('=')[1];
    const res = await fetch(
      `https://${SERVICE_DOMAIN}.microcms.io/api/v1/books?filters=slug[equals]${slug}`,
      { headers: { 'X-MICROCMS-API-KEY': API_KEY } },
    );
    const json = await res.json();
    book = json.contents && json.contents[0];
    if (!book) { console.error(`slug=${slug} の本が見つかりません`); process.exit(1); }
  } else {
    book = await fetchLatestBook(); // 本番と同じ「最新公開本」選定ロジック
  }

  // ダミーのunsubscribeトークン。実在しないので配信解除リンクを踏んでも
  // どの購読者のレコードにも影響しない（unsubscribe.js側で「該当なし」として扱われる）
  const html = buildWeeklyHtml(book, 'manual-test-token', 'manual-test');
  const subject = `【テスト送信】今週の一冊：${book.title}｜週読`;

  console.log(`送信元: ${FROM_ADDRESS}`);
  console.log(`送信先: ${to}`);
  console.log(`対象本: ${book.title}`);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });

  if (error) {
    console.error('送信失敗:', error);
    process.exit(1);
  }
  console.log(`✓ 送信しました（Resend id: ${data.id}）`);
  console.log('※ Supabaseへは一切アクセスしていません（購読者リスト・配信履歴に変更なし）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
