const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const SITE_URL = process.env.URL || 'https://syudoku.com';
const FROM_ADDRESS = 'noreply@syudoku.com';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let email;
  try {
    ({ email } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'リクエストが不正です。' }) };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'メールアドレスが無効です。' }) };
  }

  // Supabaseに登録（重複は無視）
  const { error: dbError } = await supabase
    .from('subscribers')
    .upsert({ email, confirmed: false }, { onConflict: 'email', ignoreDuplicates: true });

  if (dbError) {
    console.error('Supabase error:', dbError);
    return { statusCode: 500, body: JSON.stringify({ error: 'データベースエラーが発生しました。' }) };
  }

  // 確認メール送信
  const confirmUrl = `${SITE_URL}/.netlify/functions/confirm?email=${encodeURIComponent(email)}`;

  if (process.env.DRY_RUN === 'true') {
    console.log('[DRY_RUN] 確認メール送信スキップ:', email, confirmUrl);
    return { statusCode: 200, body: JSON.stringify({ message: 'ok (dry run)' }) };
  }

  const { error: mailError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: '週読への登録確認',
    html: buildConfirmHtml(confirmUrl),
  });

  if (mailError) {
    console.error('Resend error:', mailError);
    return { statusCode: 500, body: JSON.stringify({ error: 'メール送信に失敗しました。' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: 'ok' }) };
};

function buildConfirmHtml(confirmUrl) {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
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
      このメールに心当たりがない場合は、無視していただいて構いません。
    </p>
  </div>
</body>
</html>`;
}
