const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.SITE_URL || 'https://syudoku.com';

exports.handler = async function (event) {
  const token = event.queryStringParameters && event.queryStringParameters.token;

  if (!token) {
    return redirect(`${SITE_URL}/?confirm=error`);
  }

  const { data, error } = await supabase
    .from('subscribers')
    .update({ confirmed: true, confirm_token: null })
    .eq('confirm_token', token)
    .select('email')
    .single();

  if (error || !data) {
    console.error('Supabase confirm error:', error);
    return redirect(`${SITE_URL}/?confirm=error`);
  }

  console.log('確認完了:', data.email);

  // 運営者通知（失敗しても確認完了を止めない）
  try {
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || '';
    if (adminEmail) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress = process.env.MAIL_FROM || '週読 <contact@syudoku.com>';

      const { count } = await supabase
        .from('subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('confirmed', true)
        .is('unsubscribed_at', null);

      const totalLine = count !== null ? `<p>現在の購読者数: ${count}人</p>` : '';

      await resend.emails.send({
        from: fromAddress,
        to: adminEmail,
        subject: '【週読】新規購読者が増えました',
        html: `<p>新規購読者が確定しました。</p><p>メール: ${data.email}</p>${totalLine}`,
      });
      console.log('[confirm] 管理者通知を送信しました:', adminEmail);
    }
  } catch (notifyErr) {
    console.warn('[confirm] 管理者通知の送信に失敗しました:', notifyErr.message);
  }

  return redirect(`${SITE_URL}/?confirm=success`);
};

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
}
