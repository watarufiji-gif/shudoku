const { createClient } = require('@supabase/supabase-js');

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
  return redirect(`${SITE_URL}/?confirm=success`);
};

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: '',
  };
}
