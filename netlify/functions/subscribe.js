const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { randomUUID } = require('node:crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const SITE_URL = process.env.SITE_URL || 'https://syudoku.com';
const FROM_ADDRESS = process.env.MAIL_FROM || '週読 <contact@syudoku.com>';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let email, source;
  try {
    ({ email, source } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'リクエストが不正です。' }) };
  }
  const safeSource = ['web', 'sns', 'referral', 'company', 'search'].includes(source) ? source : 'web';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'メールアドレスが無効です。' }) };
  }

  // すでに確認済みなら何もしない
  const { data: existing } = await supabase
    .from('subscribers')
    .select('confirmed')
    .eq('email', email)
    .maybeSingle();

  if (existing?.confirmed) {
    return { statusCode: 200, body: JSON.stringify({ message: 'already_confirmed' }) };
  }

  // トークン生成（Node 15+ / Netlify Functions 環境で利用可能）
  const confirmToken = randomUUID();
  const unsubscribeToken = existing ? undefined : randomUUID();

  // upsert: 新規→全カラム挿入、再登録→confirm_token だけ更新
  const upsertData = existing
    ? { email, confirmed: false, confirm_token: confirmToken }
    : { email, confirmed: false, confirm_token: confirmToken, unsubscribe_token: randomUUID(), source: safeSource };

  const { error: dbError } = await supabase
    .from('subscribers')
    .upsert(upsertData, { onConflict: 'email' });

  if (dbError) {
    console.error('Supabase error:', dbError);
    return { statusCode: 500, body: JSON.stringify({ error: 'データベースエラーが発生しました。' }) };
  }

  const confirmUrl = `${SITE_URL}/.netlify/functions/confirm?token=${confirmToken}`;

  if (process.env.DRY_RUN === 'true') {
    console.log('[DRY_RUN] 確認メール送信スキップ');
    console.log('  宛先:', email);
    console.log('  確認URL:', confirmUrl);
    return { statusCode: 200, body: JSON.stringify({ message: 'ok (dry run)' }) };
  }

  const { error: mailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: '【週読】メールアドレスの確認をお願いします',
    html: buildConfirmHtml(confirmUrl),
  });

  if (mailError) {
    console.error('Resend error name:', mailError.name);
    console.error('Resend error message:', mailError.message);
    console.error('Resend error statusCode:', mailError.statusCode);
    return { statusCode: 500, body: JSON.stringify({ error: 'メール送信に失敗しました。' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: 'ok' }) };
};

function buildConfirmHtml(confirmUrl) {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#faf9f6;padding:40px 20px;color:#2c2c2c;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:40px;">
    <p style="font-size:1.1rem;font-weight:600;margin-bottom:8px;">週読</p>
    <h1 style="font-size:1.3rem;font-weight:500;margin-bottom:24px;color:#1a1a1a;">ご登録ありがとうございます</h1>
    <p style="line-height:1.8;color:#555;">
      毎週土曜日の朝9時に、一冊の本をお届けします。<br>
      広告なし。セールも勧誘もありません。
    </p>
    <p style="line-height:1.8;color:#555;margin-top:16px;">
      下のボタンをクリックして、登録を確定してください。
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${confirmUrl}"
         style="display:inline-block;padding:14px 32px;background:#2c2c2c;color:#fff;text-decoration:none;border-radius:4px;font-size:0.95rem;letter-spacing:0.05em;">
        登録を確定する
      </a>
    </div>
    <p style="font-size:0.8rem;color:#aaa;margin-top:32px;">
      このメールに心当たりがない場合は、無視していただいて構いません。<br>
      リンクを踏まなければ登録は完了しません。
    </p>
    <hr style="border:none;border-top:1px solid #f0ece5;margin:32px 0 16px;">
    <p style="font-size:0.75rem;color:#bbb;line-height:1.7;">
      送信者：週読 運営事務局｜contact@syudoku.com<br>
      syudoku.com
    </p>
  </div>
</body>
</html>`;
}
