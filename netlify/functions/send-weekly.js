const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const MICROCMS_SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN || 'shudoku';
const MICROCMS_API_KEY = process.env.MICROCMS_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://syudoku.com';
const FROM_ADDRESS = process.env.MAIL_FROM || '週読 <contact@syudoku.com>';
const BATCH_SIZE = 100; // Resend batch 上限

exports.handler = async function () {
  // 今週の本を microCMS から取得
  let book;
  try {
    book = await fetchLatestBook();
  } catch (err) {
    console.error('microCMS fetch error:', err);
    return { statusCode: 500, body: 'microCMS fetch failed' };
  }

  // 確認済み購読者（email + unsubscribe_token）を取得
  const { data: subscribers, error: dbError } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('confirmed', true);

  if (dbError) {
    console.error('Supabase error:', dbError);
    return { statusCode: 500, body: 'DB fetch failed' };
  }

  if (!subscribers || subscribers.length === 0) {
    console.log('購読者なし。送信スキップ。');
    return { statusCode: 200, body: 'no subscribers' };
  }

  const subject = `今週の一冊：${book.title || '今週の一冊'}｜週読`;

  if (process.env.DRY_RUN === 'true') {
    const sampleHtml = buildWeeklyHtml(book, subscribers[0].unsubscribe_token, 'dry-run-campaign-id');
    console.log(`[DRY_RUN] 週次メール送信スキップ`);
    console.log(`  件名: ${subject}`);
    console.log(`  送信対象: ${subscribers.length}件`);
    console.log('--- 生成HTML（1通目のサンプル） ---');
    console.log(sampleHtml);
    console.log('---');
    return { statusCode: 200, body: JSON.stringify({ dryRun: true, count: subscribers.length }) };
  }

  // キャンペーン記録を作成
  const { data: campaign, error: campaignErr } = await supabase
    .from('email_campaigns')
    .insert({
      book_title:       book.title || '今週の一冊',
      book_category:    book.category || null,
      week_number:      getISOWeek(new Date()),
      recipients_count: subscribers.length,
    })
    .select('id')
    .single();

  if (campaignErr) {
    console.error('Campaign insert error:', campaignErr);
    return { statusCode: 500, body: 'Campaign record failed' };
  }

  const campaignId = campaign.id;
  console.log(`キャンペーン作成: ${campaignId} | 送信対象: ${subscribers.length}件`);

  // バッチ送信（Resend batch.send は最大100件/回）
  let sent = 0;
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE).map((s) => ({
      from: FROM_ADDRESS,
      to:   s.email,
      subject,
      html: buildWeeklyHtml(book, s.unsubscribe_token, campaignId),
      tags: [
        { name: 'campaign_id',   value: campaignId },
        { name: 'subscriber_id', value: s.unsubscribe_token },
      ],
    }));

    const { error: mailError } = await resend.batch.send(batch);
    if (mailError) {
      console.error(`Resend batch error (${i}〜${i + batch.length - 1}件目):`, mailError);
    } else {
      sent += batch.length;
    }
  }

  console.log(`送信完了: ${sent}/${subscribers.length}件`);
  return { statusCode: 200, body: JSON.stringify({ sent, total: subscribers.length }) };
};

async function fetchLatestBook() {
  const url = `https://${MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/books?limit=1&orders=-publishedAt`;
  const res = await fetch(url, {
    headers: { 'X-MICROCMS-API-KEY': MICROCMS_API_KEY },
  });
  if (!res.ok) throw new Error(`microCMS ${res.status}`);
  const json = await res.json();
  if (!json.contents || json.contents.length === 0) throw new Error('本が登録されていません');
  return json.contents[0];
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
}

function buildWeeklyHtml(book, unsubscribeToken, _campaignId) {
  const title = book.title || '今週の一冊';
  const author = book.author || '';
  const category = book.category || '';
  const quote = book.quote || '';
  const description = book.description || '';
  const coverUrl = book.coverImage && book.coverImage.url ? book.coverImage.url : '';
  const amazonUrl = book.AmazonURL || '';
  const reflection = book.reflection || '';

  const unsubscribeUrl = `${SITE_URL}/.netlify/functions/unsubscribe?token=${unsubscribeToken}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#faf9f6;padding:40px 20px;color:#2c2c2c;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:40px;">

    <p style="font-size:0.8rem;color:#aaa;margin:0 0 4px;letter-spacing:0.1em;">今週の一冊｜週読</p>
    <h1 style="font-size:1.5rem;font-weight:500;margin:0 0 6px;color:#1a1a1a;line-height:1.4;">${escapeHtml(title)}</h1>
    <p style="font-size:0.9rem;color:#888;margin:0 0 4px;">${escapeHtml(author)}</p>
    ${category ? `<p style="font-size:0.8rem;color:#bbb;margin:0 0 24px;letter-spacing:0.05em;">${escapeHtml(category)}</p>` : '<p style="margin:0 0 24px;"></p>'}

    ${coverUrl ? `<div style="text-align:center;margin-bottom:28px;"><img src="${escapeHtml(coverUrl)}" alt="表紙" style="max-width:130px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.12);"></div>` : ''}

    ${quote ? `<blockquote style="border-left:3px solid #d4c9b8;margin:0 0 28px;padding:12px 20px;background:#faf9f6;border-radius:0 4px 4px 0;">
      <p style="font-size:0.95rem;color:#555;line-height:1.9;margin:0;font-style:italic;">&ldquo;${escapeHtml(quote)}&rdquo;</p>
    </blockquote>` : ''}

    <div style="font-size:0.95rem;line-height:1.9;color:#444;margin-bottom:28px;">
      ${escapeHtml(description).replace(/\n/g, '<br>')}
    </div>

    ${reflection ? `<div style="background:#f5f2ec;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <p style="font-size:0.75rem;color:#aaa;margin:0 0 8px;letter-spacing:0.08em;">今週の問い</p>
      <p style="font-size:0.95rem;color:#444;line-height:1.8;margin:0;">${escapeHtml(reflection)}</p>
    </div>` : ''}

    ${amazonUrl ? `<div style="text-align:center;margin:32px 0;">
      <a href="${escapeHtml(amazonUrl)}"
         style="display:inline-block;padding:14px 32px;background:#2c2c2c;color:#fff;text-decoration:none;border-radius:4px;font-size:0.95rem;letter-spacing:0.05em;">
        Amazonで見る →
      </a>
    </div>` : ''}

    <hr style="border:none;border-top:1px solid #f0ece5;margin:36px 0 20px;">
    <p style="font-size:0.75rem;color:#bbb;line-height:1.9;text-align:center;margin:0;">
      送信者：週読 運営事務局｜<a href="mailto:contact@syudoku.com" style="color:#bbb;">contact@syudoku.com</a><br>
      <a href="${SITE_URL}" style="color:#bbb;">syudoku.com</a><br><br>
      <a href="${unsubscribeUrl}" style="color:#bbb;text-decoration:underline;">配信停止はこちら</a>
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
