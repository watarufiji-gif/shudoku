const { createClient } = require('@supabase/supabase-js');
const { createHmac, timingSafeEqual } = require('node:crypto');

const EVENT_TYPE_MAP = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[resend-webhook] Supabase 環境変数未設定');
    return { statusCode: 500, body: 'DB not configured' };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!verifySignature(event)) {
    console.warn('Webhook signature verification failed');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Bad Request' };
  }

  const dbType = EVENT_TYPE_MAP[payload.type];
  if (!dbType) {
    return { statusCode: 200, body: 'ok (ignored)' };
  }

  const data = payload.data || {};

  // campaign_id は tags から取得
  // Resend は tags を [{name, value}] 配列または {key: value} オブジェクトで送る
  const tags = data.tags || {};
  let campaignId = null;

  if (Array.isArray(tags)) {
    campaignId = tags.find(t => t.name === 'campaign_id')?.value || null;
  } else {
    campaignId = tags.campaign_id || null;
  }

  // resend_email_id は NOT NULL 制約があるため必須。取得できない不正な payload は
  // リトライしても解決しないので 200 を返して Resend の再送ループを止める。
  const resendEmailId = data.email_id || null;
  if (!resendEmailId) {
    console.warn('[resend-webhook] email_id が payload に無いためスキップ:', JSON.stringify(payload));
    return { statusCode: 200, body: 'ok (skipped: missing email_id)' };
  }

  // data.to は文字列 or 配列で届く可能性があるため両対応
  const toField = data.to;
  const recipientEmail = Array.isArray(toField) ? (toField[0] || null) : (toField || null);

  // link_url は email.clicked のときだけ存在する。他イベントでは null のまま
  const linkUrl = data.click?.link || null;

  const occurredAt = payload.created_at || data.created_at || null;

  const { error } = await supabase.from('email_events').insert({
    campaign_id:      campaignId,
    resend_email_id:  resendEmailId,
    event_type:       dbType,
    recipient_email:  recipientEmail,
    link_url:         linkUrl,
    occurred_at:      occurredAt,
    raw_payload:      payload,
  });

  if (error) {
    // ここまで来ている時点で必須項目(resend_email_id / event_type)は揃っているため、
    // 失敗は payload 不正ではなく DB 側の一時的な問題である可能性が高い。
    // 500 を返し Resend にリトライさせる。
    console.error('DB insert error:', error);
    return { statusCode: 500, body: 'DB error' };
  }

  console.log(`Webhook recorded: ${payload.type} campaign=${campaignId}`);
  return { statusCode: 200, body: 'ok' };
};

function verifySignature(event) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!secret) {
    // 未設定時はローカル開発として素通し（本番では必ず設定すること）
    console.warn('RESEND_WEBHOOK_SECRET not set – skipping signature check');
    return true;
  }

  const msgId        = event.headers['svix-id'];
  const msgTimestamp = event.headers['svix-timestamp'];
  const msgSignature = event.headers['svix-signature'];

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // リプレイ攻撃対策: 5分以上前のリクエストを拒否
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(msgTimestamp, 10)) > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const toSign      = `${msgId}.${msgTimestamp}.${event.body}`;
  const expected    = createHmac('sha256', secretBytes).update(toSign).digest('base64');

  // svix-signature は "v1,<sig> v1,<sig>" 形式（複数可）
  return msgSignature.split(' ').some(sig => {
    const raw = sig.replace(/^v1,/, '');
    try {
      return timingSafeEqual(Buffer.from(raw, 'base64'), Buffer.from(expected, 'base64'));
    } catch {
      return false;
    }
  });
}
