'use strict';

/**
 * GET /.netlify/functions/instagram-history
 * 過去の生成・投稿履歴を一覧で返す（管理画面のダッシュボード用）。
 */

const { createClient } = require('@supabase/supabase-js');
const { checkAuth, unauthorized } = require('./lib/auth');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!checkAuth(event)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [] }) };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase
      .from('instagram_posts')
      .select('id, source_url, source_title, caption, hashtags, image_urls, status, ig_media_id, error_message, created_at, published_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: data || [] }),
    };
  } catch (err) {
    console.error('[instagram-history] error:', err);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};
