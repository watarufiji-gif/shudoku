const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('node:crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }

  if (!checkAuth(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    // 直近12件のキャンペーンを先に取得し、その campaign_id でイベントを絞る
    const { data: campaigns, error: campaignErr } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(12);

    if (campaignErr) throw campaignErr;

    const campaignIds = (campaigns || []).map(c => c.id);

    const [subscribersRes, sourcesRes, eventsRes] = await Promise.all([
      supabase
        .from('subscribers')
        .select('created_at')
        .eq('confirmed', true),
      supabase
        .from('subscribers')
        .select('source')
        .eq('confirmed', true),
      campaignIds.length > 0
        ? supabase
            .from('email_events')
            .select('campaign_id, type')
            .in('campaign_id', campaignIds)
        : Promise.resolve({ data: [] }),
    ]);

    if (subscribersRes.error) throw subscribersRes.error;
    if (sourcesRes.error)     throw sourcesRes.error;
    if (eventsRes.error)      throw eventsRes.error;

    const subscribers    = subscribersRes.data || [];
    const sources        = sourcesRes.data || [];
    const events         = eventsRes.data || [];
    const campaignStats  = computeCampaignStats(campaigns || [], events);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalSubscribers: subscribers.length,
        growthByWeek:     computeGrowthByWeek(subscribers),
        sourceBreakdown:  computeSourceBreakdown(sources),
        campaigns:        campaignStats,
        genreTrends:      computeGenreTrends(campaignStats),
      }),
    };
  } catch (err) {
    console.error('admin-stats error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkAuth(event) {
  const password = process.env.ADMIN_PASSWORD || '';
  if (!password) return false;
  const provided = (event.headers['authorization'] || '').replace(/^Bearer\s+/, '');
  if (!provided) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(password));
  } catch {
    return false;
  }
}

// ── 集計ヘルパー ──────────────────────────────────────────────────────────────

function computeGrowthByWeek(subscribers) {
  const weeks = {};
  subscribers.forEach(s => {
    if (!s.created_at) return;
    const d = new Date(s.created_at);
    // その週の月曜日を週キーにする
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeks[key] = (weeks[key] || 0) + 1;
  });
  return Object.entries(weeks)
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-12);
}

function computeSourceBreakdown(sources) {
  const counts = {};
  sources.forEach(s => {
    const src = s.source || 'web';
    counts[src] = (counts[src] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function computeCampaignStats(campaigns, events) {
  // イベントをキャンペーン別・タイプ別に集計
  const eventMap = {};
  events.forEach(e => {
    if (!eventMap[e.campaign_id]) eventMap[e.campaign_id] = {};
    const m = eventMap[e.campaign_id];
    m[e.type] = (m[e.type] || 0) + 1;
  });

  return campaigns.map(c => {
    const e          = eventMap[c.id] || {};
    const opens      = e.opened    || 0;
    const clicks     = e.clicked   || 0;
    const recipients = c.recipients_count || 1;
    return {
      id:             c.id,
      sentAt:         c.sent_at,
      bookTitle:      c.book_title,
      bookCategory:   c.book_category || '未分類',
      weekNumber:     c.week_number,
      recipientsCount: c.recipients_count,
      openCount:      opens,
      clickCount:     clicks,
      openRate:       Math.round((opens  / recipients) * 1000) / 10,
      clickRate:      Math.round((clicks / recipients) * 1000) / 10,
    };
  });
}

function computeGenreTrends(campaignStats) {
  const byCategory = {};
  campaignStats.forEach(c => {
    if (!c.recipientsCount) return;
    const cat = c.bookCategory;
    if (!byCategory[cat]) byCategory[cat] = { openRates: [], clickRates: [] };
    byCategory[cat].openRates.push(c.openRate);
    byCategory[cat].clickRates.push(c.clickRate);
  });
  return Object.entries(byCategory)
    .map(([category, d]) => ({
      category,
      avgOpenRate:  avg(d.openRates),
      avgClickRate: avg(d.clickRates),
      count: d.openRates.length,
    }))
    .sort((a, b) => b.avgOpenRate - a.avgOpenRate);
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
}
