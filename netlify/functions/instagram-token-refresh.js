'use strict';

/**
 * 毎月1回自動実行され、Instagramの長期アクセストークン（60日で失効）を更新する。
 * netlify.toml に scheduled function として登録している（send-weekly と同じ方式）。
 *
 * 初回のトークンだけは手動でapp_settingsに登録する必要がある（INSTAGRAM_SETUP.md参照）。
 * それ以降はこの関数が自動で延長し続ける。
 */

const { createClient } = require('@supabase/supabase-js');
const { getSetting, setSetting } = require('./lib/app-settings');
const { refreshLongLivedToken } = require('./lib/instagram-api');

exports.handler = async function () {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    console.error('[instagram-token-refresh] Supabase環境変数が未設定です。スキップします。');
    return { statusCode: 200, body: 'skipped (no supabase env)' };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const currentToken = await getSetting(supabase, 'ig_access_token');
    if (!currentToken) {
      console.warn('[instagram-token-refresh] ig_access_token が未登録です。初回セットアップを先に行ってください。');
      return { statusCode: 200, body: 'skipped (no token yet)' };
    }

    const { accessToken, expiresInSeconds } = await refreshLongLivedToken(currentToken);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    await setSetting(supabase, 'ig_access_token', accessToken);
    await setSetting(supabase, 'ig_access_token_expires_at', expiresAt);

    console.log(`[instagram-token-refresh] トークンを更新しました。次回失効予定: ${expiresAt}`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[instagram-token-refresh] 更新に失敗しました:', err.message);
    // 失敗してもここでは例外を投げない（現行トークンがまだ生きている可能性が高いため）。
    return { statusCode: 200, body: `error: ${err.message}` };
  }
};
