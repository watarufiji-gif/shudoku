const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function (event) {
  const token = event.queryStringParameters && event.queryStringParameters.token;

  if (!token) {
    return htmlResponse(errorPage('無効なリンクです。'));
  }

  const { data, error } = await supabase
    .from('subscribers')
    .delete()
    .eq('unsubscribe_token', token)
    .select('email')
    .single();

  if (error || !data) {
    console.error('Supabase unsubscribe error:', error);
    // トークン不一致 or 既に解除済み → どちらも「解除済み」として扱う
    return htmlResponse(donePage('（このアドレスはすでに解除されているか、リンクが無効です）'));
  }

  console.log('配信解除完了:', data.email);
  return htmlResponse(donePage(''));
};

function htmlResponse(body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body,
  };
}

function donePage(note) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>配信解除完了｜週読</title>
  <style>
    body{font-family:'Helvetica Neue',Arial,sans-serif;background:#faf9f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}
    .card{background:#fff;border-radius:8px;padding:48px 40px;max-width:480px;width:100%;text-align:center;}
    h1{font-size:1.2rem;font-weight:500;color:#1a1a1a;margin-bottom:16px;}
    p{font-size:0.9rem;color:#777;line-height:1.8;margin:0 0 8px;}
    a{color:#2c2c2c;font-size:0.85rem;}
  </style>
</head>
<body>
  <div class="card">
    <h1>配信解除が完了しました</h1>
    <p>週読からのメールはこれ以上届きません。</p>
    ${note ? `<p style="font-size:0.8rem;color:#bbb;">${note}</p>` : ''}
    <p style="margin-top:32px;"><a href="https://syudoku.com/">週読トップへ戻る</a></p>
    <p style="margin-top:40px;font-size:0.75rem;color:#ccc;line-height:1.7;">
      週読 運営事務局｜contact@syudoku.com<br>
      syudoku.com
    </p>
  </div>
</body>
</html>`;
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>エラー｜週読</title>
  <style>
    body{font-family:'Helvetica Neue',Arial,sans-serif;background:#faf9f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}
    .card{background:#fff;border-radius:8px;padding:48px 40px;max-width:480px;width:100%;text-align:center;}
    h1{font-size:1.2rem;font-weight:500;color:#1a1a1a;margin-bottom:16px;}
    p{font-size:0.9rem;color:#777;line-height:1.8;}
    a{color:#2c2c2c;font-size:0.85rem;}
  </style>
</head>
<body>
  <div class="card">
    <h1>エラーが発生しました</h1>
    <p>${message}</p>
    <p style="margin-top:32px;"><a href="https://syudoku.com/">週読トップへ戻る</a></p>
  </div>
</body>
</html>`;
}
