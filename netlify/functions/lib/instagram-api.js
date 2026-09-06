'use strict';

/**
 * Instagram Graph API（カルーセル投稿）のラッパー。
 * 前提：投稿先は自分（週読）のアカウントのみ。他ユーザーへの投稿は行わないため、
 * Meta App Reviewは不要（Instagram Tester登録のみで動作する）。
 *
 * 必要な環境変数 / Supabase設定は INSTAGRAM_SETUP.md を参照。
 */

const GRAPH_VERSION = 'v23.0'; // 2026年時点の最新安定版。将来的にMetaの案内に合わせて更新してください。
// 「Instagram APIとInstagram Login」構成では graph.instagram.com を使う（Facebookページ不要）。
// 「Instagram APIとFacebook Login」構成にした場合は環境変数 IG_GRAPH_HOST を
// graph.facebook.com に変更してください（INSTAGRAM_SETUP.md参照）。
const GRAPH_HOST = process.env.IG_GRAPH_HOST || 'graph.instagram.com';
const GRAPH_BASE = `https://${GRAPH_HOST}/${GRAPH_VERSION}`;

class InstagramApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'InstagramApiError';
    this.details = details;
  }
}

async function graphFetch(endpoint, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(`${GRAPH_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new InstagramApiError(
      json?.error?.message || `Instagram API error (HTTP ${res.status})`,
      json
    );
  }
  return json;
}

/**
 * カルーセルの各画像コンテナを作成する。
 * imageUrl は公開アクセス可能なJPEG画像のURL（Supabase Storageの公開URL等）。
 */
async function createCarouselItemContainer({ igUserId, accessToken, imageUrl }) {
  const json = await graphFetch(`/${igUserId}/media`, {
    method: 'POST',
    params: {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: accessToken,
    },
  });
  return json.id;
}

/** 個別コンテナIDをまとめてカルーセルコンテナを作成する。 */
async function createCarouselContainer({ igUserId, accessToken, childrenIds, caption }) {
  const json = await graphFetch(`/${igUserId}/media`, {
    method: 'POST',
    params: {
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      caption,
      access_token: accessToken,
    },
  });
  return json.id;
}

/** カルーセルコンテナを公開する。 */
async function publishContainer({ igUserId, accessToken, creationId }) {
  const json = await graphFetch(`/${igUserId}/media_publish`, {
    method: 'POST',
    params: {
      creation_id: creationId,
      access_token: accessToken,
    },
  });
  return json.id; // 公開されたメディアID
}

/**
 * カルーセル投稿一式（画像コンテナ作成→カルーセルコンテナ作成→公開）を実行する。
 * imageUrls は表示順（1枚目〜10枚目）に並んでいること。
 */
async function publishCarousel({ igUserId, accessToken, imageUrls, caption }) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new InstagramApiError('カルーセルは2〜10枚の画像が必要です。', { count: imageUrls.length });
  }

  const childrenIds = [];
  for (const imageUrl of imageUrls) {
    // Instagram側の処理を安定させるため、直列で作成する（並列だとレートリミットに当たりやすい）
    const id = await createCarouselItemContainer({ igUserId, accessToken, imageUrl });
    childrenIds.push(id);
  }

  const carouselId = await createCarouselContainer({ igUserId, accessToken, childrenIds, caption });
  const mediaId = await publishContainer({ igUserId, accessToken, creationId: carouselId });
  return { mediaId, permalink: `https://www.instagram.com/p/${mediaId}/` };
}

/**
 * 長期アクセストークンを更新する（有効期限60日、期限の半分を過ぎたら更新可能）。
 * instagram-token-refresh.js から月1回呼び出す想定。
 */
async function refreshLongLivedToken(currentToken) {
  const json = await graphFetch('/refresh_access_token', {
    params: {
      grant_type: 'ig_refresh_token',
      access_token: currentToken,
    },
  });
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

module.exports = {
  InstagramApiError,
  createCarouselItemContainer,
  createCarouselContainer,
  publishContainer,
  publishCarousel,
  refreshLongLivedToken,
};
