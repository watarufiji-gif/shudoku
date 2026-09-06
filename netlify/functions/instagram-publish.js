'use strict';

/**
 * POST /.netlify/functions/instagram-publish
 * body: { postId }
 *
 * 管理画面で内容を確認した後、明示的にこのエンドポイントを呼んだ時だけ実際にInstagramへ
 * 投稿する（生成・保存と公開を分離する、というこのプロジェクトの運用方針に合わせている）。
 */

const { createClient } = require('@supabase/supabase-js');
const { checkAuth, unauthorized } = require('./lib/auth');
const { getSetting } = require('./lib/app-settings');
const { publishCarousel, InstagramApiError } = require('./lib/instagram-api');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!checkAuth(event)) return unauthorized();

  let postId;
  try {
    ({ postId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'リクエストが不正です。' }) };
  }
  if (!postId) return { statusCode: 400, body: JSON.stringify({ error: 'postId は必須です。' }) };

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  const igUserId = process.env.IG_USER_ID || '';
  if (!supabaseUrl || !supabaseKey || !igUserId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase / IG_USER_ID の環境変数が未設定です。' }) };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: post, error: fetchErr } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!post) return { statusCode: 404, body: JSON.stringify({ error: '投稿が見つかりません。' }) };
    if (post.status === 'published') {
      return { statusCode: 409, body: JSON.stringify({ error: 'この投稿はすでに公開済みです。' }) };
    }

    const accessToken = await getSetting(supabase, 'ig_access_token');
    if (!accessToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            'Instagramアクセストークンが未設定です。app_settings テーブルに ig_access_token を登録してください（INSTAGRAM_SETUP.md参照）。',
        }),
      };
    }

    const captionWithTags = [post.caption, (post.hashtags || []).map((h) => `#${h}`).join(' ')]
      .filter(Boolean)
      .join('\n\n');

    const { mediaId, permalink } = await publishCarousel({
      igUserId,
      accessToken,
      imageUrls: post.image_urls,
      caption: captionWithTags,
    });

    await supabase
      .from('instagram_posts')
      .update({ status: 'published', ig_media_id: mediaId, published_at: new Date().toISOString(), error_message: null })
      .eq('id', postId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId, permalink }),
    };
  } catch (err) {
    console.error('[instagram-publish] error:', err);
    const message = err instanceof InstagramApiError ? err.message : err.message || '投稿に失敗しました。';
    await supabase.from('instagram_posts').update({ status: 'failed', error_message: message }).eq('id', postId);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
  }
};
