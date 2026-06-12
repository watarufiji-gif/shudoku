const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const MICROCMS_SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN || 'shudoku';
const MICROCMS_API_KEY = process.env.MICROCMS_API_KEY;
const FROM_ADDRESS = 'noreply@syudoku.com';
const BATCH_SIZE = 50;

exports.handler = async function () {
  // 今週の本をmicroCMSから取得
  let book;
  try {
    book = await fetchLatestBook();
  } catch (err) {
    console.error('microCMS fetch error:', err);
    return { statusCode: 500, body: 'microCMS fetch failed' };
  }

  // 確認済み購読者を取得
  const { data: subscribers, error: dbError } = await supabase
    .from('subscribers')
    .select('email')
    .eq('confirmed', true);

  if (dbError) {
    console.error('Supabase error:', dbError);
    return { statusCode: 500, body: 'DB fetch failed' };
  }

  if (!subscribers || subscribers.length === 0) {
    console.log('購読者なし。送信スキップ。');
    return { statusCode: 200, body: 'no subscribers' };
  }

  const emails = subscribers.map((s) => s.email);
  console.log(`送信対象: ${emails.length}件`);

  if (process.env.DRY_RUN === 'true') {
    console.log('[DRY_RUN] 週次メール送信スキップ。本タイトル:', book.title);
    return { statusCode: 200, body: JSON.stringify({ dryRun: true, count: emails.length }) };
  }

  // バッチ送信（Resend は一度に最大50件）
  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const { error: mailError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: FROM_ADDRESS,
      bcc: batch,
      subject: `今週の一冊｜週読`,
      html: buildWeeklyHtml(book),
    });
    if (mailError) {
      console.error('Resend error (batch):', mailError);
    } else {
      sent += batch.length;
    }
  }

  console.log(`送信完了: ${sent}/${emails.length}件`);
  return { statusCode: 200, body: JSON.stringify({ sent, total: emails.length }) };
};

async function fetchLatestBook() {
  const url = `https://${MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/books?limit=1&orders=-publishedAt`;
  const res = await fetch(url, {
    headers: { 'X-MICROCMS-API-KEY': MICROCMS_API_KEY },
  });
  if (!res.ok) throw new Error(`microCMS ${res.status}`);
  const json = await res.json();
  return json.contents[0];
}

function buildWeeklyHtml(book) {
  const title = book.title || '今週の一冊';
  const author = book.author || '';
  const description = book.description || '';
  const coverUrl = book.cover && book.cover.url ? book.cover.url : '';
  const bookUrl = book.amazonUrl || `https://syudoku.com/`;

  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#faf9f6;padding:40px 20px;color:#2c2c2c;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:40px;">
    <p style="font-size:0.85rem;color:#aaa;margin-bottom:4px;letter-spacing:0.08em;">今週の一冊｜週読</p>
    <h1 style="font-size:1.4rem;font-weight:500;margin:0 0 8px;color:#1a1a1a;">${escapeHtml(title)}</h1>
    <p style="font-size:0.9rem;color:#888;margin:0 0 24px;">${escapeHtml(author)}</p>
    ${coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="表紙" style="max-width:140px;display:block;margin:0 auto 24px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">` : ''}
    <p style="line-height:1.85;color:#444;font-size:0.95rem;">${escapeHtml(description).replace(/\n/g, '<br>')}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${escapeHtml(bookUrl)}"
         style="display:inline-block;padding:14px 32px;background:#2c2c2c;color:#fff;text-decoration:none;border-radius:4px;font-size:0.95rem;letter-spacing:0.05em;">
        詳しく読む →
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #f0ece5;margin:32px 0;">
    <p style="font-size:0.75rem;color:#bbb;text-align:center;">
      配信停止は <a href="https://syudoku.com/unsubscribe" style="color:#bbb;">こちら</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
