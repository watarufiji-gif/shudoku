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

  // campaign_id / subscriber_id を tags から取得
  // Resend は tags を [{name, value}] 配列または {key: value} オブジェクトで送る
  const tags = data.tags || {};
  let campaignId = null;
  let subscriberId = null;

  if (Array.isArray(tags)) {
    campaignId  = tags.find(t => t.name === 'campaign_id')?.value  || null;
    subscriberId = tags.find(t => t.name === 'subscriber_id')?.value || null;
  } else {
    campaignId  = tags.campaign_id  || null;
    subscriberId = tags.subscriber_id || null;
  }

  const url = data.click?.link || null;

  const { error } = await supabase.from('email_events').insert({
    campaign_id:   campaignId,
    subscriber_id: subscriberId,
    type:          dbType,
    url,
  });

  if (error) {
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
