'use strict';

/**
 * POST /.netlify/functions/instagram-generate
 * body: { url: string, skipResearch?: boolean }
 *
 * URLから市場調査＋カルーセル企画（スライド文言・キャプション・ハッシュタグ）を生成する。
 * 画像はまだ作らない・DBにもまだ保存しない（プレビュー編集用のドラフトを返すだけ）。
 * 管理画面でテキストを確認・編集した後、instagram-render を呼んで画像化する。
 */

const { checkAuth, unauthorized } = require('./lib/auth');
const { Anthropic, fetchSource, researchMarket, generateCarouselPlan } = require('./lib/content-pipeline');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const NUM_SLIDES = 10;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!checkAuth(event)) return unauthorized();

  let url, skipResearch;
  try {
    ({ url, skipResearch } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'リクエストが不正です。' }) };
  }
  if (!url || typeof url !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'url は必須です。' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY が未設定です（Netlify環境変数を確認してください）。' }),
    };
  }
  const client = new Anthropic({ apiKey });

  try {
    const source = await fetchSource(url);

    let research = '';
    if (!skipResearch) {
      research = await researchMarket(client, MODEL, source.title, source.body);
    }

    const plan = await generateCarouselPlan(client, MODEL, source.title, source.body, research, NUM_SLIDES);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, research, plan }),
    };
  } catch (err) {
    console.error('[instagram-generate] error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || '生成に失敗しました。' }),
    };
  }
};
