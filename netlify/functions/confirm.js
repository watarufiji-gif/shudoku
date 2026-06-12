const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SITE_URL = process.env.URL || 'https://syudoku.com';

exports.handler = async function (event) {
  const email = event.queryStringParameters && event.queryStringParameters.email;

  if (!email) {
    return redirect(`${SITE_URL}/?confirm=error`);
  }

  const { error } = await supabase
    .from('subscribers')
    .update({ confirmed: true })
    .eq('email', email);

  if (error) {
    console.error('Supabase confirm error:', error);
    return redirect(`${SITE_URL}/?confirm=error`);
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
