'use strict';

const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('node:crypto');
const { getWeekStartSaturdayJst, getWeekNumberForDate } = require('./week-utils');

// createClient はモジュール起動時ではなくハンドラー内で呼ぶ。
// SUPABASE_URL が未設定でも require 自体は成功するため 502 にならない。

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

  // Supabase 環境変数が未設定の場合は空データを返す（502 で落とさない）
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _notice:          'Supabase 未接続（環境変数未設定）',
        totalSubscribers:  0,
        totalCampaigns:    0,
        growthByWeek:     [],
        sourceBreakdown:  [],
        campaigns:        [],
        genreTrends:      [],
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 直近12件のキャンペーンを先に取得し、その campaign_id でイベントを絞る
    const { data: campaigns, error: campaignErr } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(12);

    if (campaignErr) console.warn('[admin-stats] campaigns fetch error:', campaignErr.message);

    const campaignIds = (campaigns || []).map(c => c.id);

    const [subscribersRes, campaignCountRes, eventsRes] = await Promise.all([
      // created_at と source を1本のクエリで取得
      supabase
        .from('subscribers')
        .select('created_at, source')
        .eq('confirmed', true),
      // 累計配信回数: 件数だけ取得（行データは不要）
      supabase
        .from('email_campaigns')
        .select('*', { count: 'exact', head: true }),
      campaignIds.length > 0
        ? supabase
            .from('email_events')
            .select('campaign_id, type')
            .in('campaign_id', campaignIds)
        : Promise.resolve({ data: [], count: 0 }),
    ]);

    if (subscribersRes.error)    console.warn('[admin-stats] subscribers error:', subscribersRes.error.message);
    if (campaignCountRes.error)  console.warn('[admin-stats] campaign count error:', campaignCountRes.error.message);
    if (eventsRes.error)         console.warn('[admin-stats] events error:', eventsRes.error.message);

    const subscribers   = subscribersRes.error ? [] : (subscribersRes.data || []);
    const totalCampaigns = campaignCountRes.error ? (campaigns || []).length : (campaignCountRes.count ?? (campaigns || []).length);
    const events        = eventsRes.error ? [] : (eventsRes.data || []);
    const campaignStats = computeCampaignStats(campaigns || [], events);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalSubscribers:  subscribers.length,
        totalCampaigns,
        growthByWeek:      computeGrowthByWeek(subscribers),
        sourceBreakdown:   computeSourceBreakdown(subscribers),
        campaigns:         campaignStats,
        genreTrends:       computeGenreTrends(campaignStats),
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
    const anchor = getWeekStartSaturdayJst(new Date(s.created_at));
    const key = anchor.toISOString().slice(0, 10); // 土曜日の日付文字列をキーに
    weeks[key] = (weeks[key] || 0) + 1;
  });
  return Object.entries(weeks)
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-12);
}

function computeSourceBreakdown(subscribers) {
  const counts = {};
  subscribers.forEach(s => {
    const src = s.source || 'web';
    counts[src] = (counts[src] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

function computeCampaignStats(campaigns, events) {
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
      id:              c.id,
      sentAt:          c.sent_at,
      bookTitle:       c.book_title,
      bookCategory:    c.book_category || '未分類',
      weekNumber:      c.week_number,
      recipientsCount: c.recipients_count,
      openCount:       opens,
      clickCount:      clicks,
      openRate:        Math.round((opens  / recipients) * 1000) / 10,
      clickRate:       Math.round((clicks / recipients) * 1000) / 10,
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
