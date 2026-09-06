'use strict';

/**
 * POST /.netlify/functions/instagram-render
 * body: { sourceUrl, sourceTitle, slides, caption, hashtags }
 *
 * 管理画面でテキストを確認・編集した後に呼ぶ。
 * 1) スライド10枚をJPEG画像としてレンダリング
 * 2) Supabase Storage（公開バケット）にアップロード
 * 3) instagram_posts テーブルに status='draft' で保存
 * 4) 画像の公開URL一覧を返す（管理画面でプレビュー表示、Instagram投稿時にも使う）
 */

const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { checkAuth, unauthorized } = require('./lib/auth');
const { renderCarousel } = require('./lib/render-carousel');

const BUCKET = process.env.SUPABASE_INSTAGRAM_BUCKET || 'instagram-carousels';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!checkAuth(event)) return unauthorized();

  let sourceUrl, sourceTitle, slides, caption, hashtags;
  try {
    ({ sourceUrl, sourceTitle, slides, caption, hashtags } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'リクエストが不正です。' }) };
  }
  if (!Array.isArray(slides) || slides.length < 2 || !caption) {
    return { statusCode: 400, body: JSON.stringify({ error: 'slides（2枚以上）と caption は必須です。' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabaseの環境変数が未設定です。' }) };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const postId = randomUUID();

  try {
    const rendered = await renderCarousel(slides);

    const imageUrls = [];
    for (const { index, buffer } of rendered) {
      const path = `${postId}/slide_${String(index).padStart(2, '0')}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) throw new Error(`画像アップロードに失敗しました (${path}): ${uploadErr.message}`);

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      imageUrls.push({ index, url: pub.publicUrl });
    }
    imageUrls.sort((a, b) => a.index - b.index);
    const orderedUrls = imageUrls.map((i) => i.url);

    const { error: insertErr } = await supabase.from('instagram_posts').insert({
      id: postId,
      source_url: sourceUrl || null,
      source_title: sourceTitle || null,
      slides,
      caption,
      hashtags: hashtags || [],
      image_urls: orderedUrls,
      status: 'draft',
    });
    if (insertErr) throw new Error(`保存に失敗しました: ${insertErr.message}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, imageUrls: orderedUrls }),
    };
  } catch (err) {
    console.error('[instagram-render] error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || '画像生成に失敗しました。' }),
    };
  }
};
