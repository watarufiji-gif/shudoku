const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { randomUUID } = require('node:crypto');
const { getWeekStartSaturdayJst, getWeekNumberForDate } = require('./week-utils');

const MICROCMS_SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN || 'shudoku';
const MICROCMS_API_KEY = process.env.MICROCMS_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://syudoku.com';
const FROM_ADDRESS = process.env.MAIL_FROM || '週読 <contact@syudoku.com>';
const BATCH_SIZE = 100; // Resend batch 上限

exports.handler = async function () {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    console.error('[send-weekly] Supabase 環境変数未設定');
    return { statusCode: 500, body: 'DB not configured' };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const resend = new Resend(process.env.RESEND_API_KEY);

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
    .eq('confirmed', true)
    .is('unsubscribed_at', null);

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
      id:               randomUUID(),
      book_title:       book.title || '今週の一冊',
      book_category:    book.category || null,
      subject,
      total_recipients: subscribers.length,
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


function buildWeeklyHtml(book, unsubscribeToken, _campaignId) {
  const title       = book.title       || '';
  const author      = book.author      || '';
  const category    = book.category    || '';
  const quote       = book.quote       || '';
  const description = book.description || '';
  const coverUrl    = (book.coverImage && book.coverImage.url)
    ? book.coverImage.url
    : (() => {
        const asin = extractAsinFromUrl(book.AmazonURL || '');
        return asin ? `https://m.media-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg` : '';
      })();
  const amazonUrl   = book.AmazonURL   || '';
  const greeting    = book.greeting    || '';
  const publisher   = book.publisher   || '';

  const unsubscribeUrl = `${SITE_URL}/.netlify/functions/unsubscribe?token=${unsubscribeToken}`;

  // 配信日（土曜）と週番号を算出
  const saturday   = getWeekStartSaturdayJst(new Date());
  const weekNumber = getWeekNumberForDate(saturday);
  const weekRange  = saturday.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
  });

  const previewText    = escapeHtml(quote || greeting);
  const descriptionHtml = description
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => `<p style="margin:0 0 1.0em 0;">${escapeHtml(line)}</p>`)
    .join('\n');

  // 条件付きブロック
  const greetingBlock = greeting
    ? `\n<p style="margin:0;">${escapeHtml(greeting)}</p>`
    : '';

  const bookPageUrl = book.slug
    ? `${SITE_URL}/${escapeHtml(book.slug)}.html`
    : SITE_URL;

  const coverBlock = coverUrl
    ? `<tr><td align="center" style="padding:0 48px 36px 48px;"><a href="${bookPageUrl}" style="display:block;text-decoration:none;"><img class="cover-img" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)} 書影" width="200" style="display:block;width:200px;max-width:60%;height:auto;margin:0 auto;box-shadow:0 8px 24px rgba(43,41,38,0.18);"></a></td></tr>`
    : '';

  const publisherBlock = publisher
    ? `<tr><td align="center" style="padding:6px 0 36px 0;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:12px;letter-spacing:0.15em;color:#8a857c;">${escapeHtml(publisher)}</span></td></tr>`
    : '';

  const quoteBlock = quote
    ? `<tr><td class="inner-pad" style="padding:0 48px 40px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ece2;"><tr>
<td width="4" style="background-color:#a99465;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:26px 28px;"><p style="margin:0;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:15px;line-height:2.1;letter-spacing:0.06em;color:#2b2926;font-style:italic;">${escapeHtml(quote)}</p></td>
</tr></table></td></tr>`
    : '';

  const amazonBlock = amazonUrl
    ? `<tr><td align="center" style="padding:24px 48px 16px 48px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="background-color:#2b2926;border-radius:4px;"><a href="${escapeHtml(amazonUrl)}" style="display:inline-block;padding:16px 72px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:15px;letter-spacing:0.25em;color:#ffffff;text-decoration:none;">Amazonで見る</a></td>
</tr></table></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>週読｜今週の一冊</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; }
  a { color:#2b2926; }
  @media only screen and (max-width:620px){
    .container{width:100%!important;}
    .inner-pad{padding-left:24px!important;padding-right:24px!important;}
    .book-title{font-size:28px!important;line-height:1.5!important;}
    .cover-img{width:160px!important;height:auto!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f7f4ee;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;min-width:100%;background-color:#f7f4ee;">
<tr><td align="center" style="padding:40px 12px;text-align:center;">
<table role="presentation" class="container" align="center" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;margin:0 auto;display:inline-block;">

<tr><td align="center" style="padding:8px 0 36px 0;">
<a href="https://syudoku.com" style="text-decoration:none;display:inline-block;">
<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;"><tr>
<td valign="middle" style="padding-right:10px;"><img src="https://syudoku.com/assets/logo-mark.png" alt="週読ロゴ" width="36" height="36" style="display:block;width:36px;height:36px;"></td>
<td valign="middle"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho','MS Mincho',serif;font-size:26px;letter-spacing:0.35em;color:#2b2926;">週読</span></td>
</tr></table></a></td></tr>

<tr><td class="inner-pad" style="padding:0 48px 40px 48px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:15px;line-height:1.8;letter-spacing:0.05em;color:#2b2926;">
<p style="margin:0 0 0.8em 0;">おはようございます。週読の隊長です。</p>${greetingBlock}
</td></tr>

<tr><td align="center" style="padding:0 0 10px 0;"><span style="display:inline-block;background-color:#a99465;color:#ffffff;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:13px;letter-spacing:0.25em;padding:6px 22px;border-radius:999px;">第${weekNumber}週</span></td></tr>
<tr><td align="center" style="padding:0 0 40px 0;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:13px;letter-spacing:0.15em;color:#8a857c;">${escapeHtml(weekRange)}</span></td></tr>

${coverBlock}

<tr><td class="inner-pad" style="padding:0 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:0 0 14px 0;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:12px;letter-spacing:0.3em;color:#a99465;">${escapeHtml(category)}</span></td></tr>
<tr><td align="center" style="padding:0 0 18px 0;"><span class="book-title" style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:32px;line-height:1.6;letter-spacing:0.12em;color:#2b2926;">${escapeHtml(title)}</span></td></tr>
<tr><td align="center" style="padding:0 0 6px 0;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:15px;letter-spacing:0.2em;color:#2b2926;">${escapeHtml(author)}</span></td></tr>
${publisherBlock}
</table></td></tr>

${quoteBlock}

<tr><td class="inner-pad" style="padding:0 48px;font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:15px;line-height:1.8;letter-spacing:0.05em;color:#2b2926;">${descriptionHtml}</td></tr>

${amazonBlock}

<tr><td align="center" style="padding:0 48px 52px 48px;"><a href="https://syudoku.com" style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:13px;letter-spacing:0.15em;color:#8a857c;text-decoration:underline;">サイトで読む</a></td></tr>

<tr><td align="center" style="padding:0 48px 48px 48px;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:14px;line-height:2;letter-spacing:0.1em;color:#2b2926;">また来週の土曜の朝に。<br>週読の隊長</span></td></tr>

<tr><td style="padding:0 48px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #ddd6c8;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>

<tr><td align="center" style="padding:32px 48px 12px 48px;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:13px;line-height:2;letter-spacing:0.1em;color:#8a857c;">週読 ── よく生きるための一冊を、毎週土曜の朝に。</span></td></tr>
<tr><td align="center" style="padding:0 48px 8px 48px;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:12px;line-height:2;color:#a8a296;">広告なし。セールも勧誘もありません。</span></td></tr>
<tr><td align="center" style="padding:0 48px 40px 48px;"><span style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-size:12px;color:#a8a296;"><a href="https://syudoku.com" style="color:#a8a296;text-decoration:underline;">syudoku.com</a>&nbsp;｜&nbsp;<a href="${escapeHtml(unsubscribeUrl)}" style="color:#a8a296;text-decoration:underline;">配信を解除する</a></span></td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function extractAsinFromUrl(url) {
  if (!url) return '';
  const str = String(url);
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];
  for (const pattern of patterns) {
    const m = str.match(pattern);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
