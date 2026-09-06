'use strict';

/**
 * app_settings テーブル（key/value）の読み書き。
 * Instagramの長期アクセストークンは60日で失効するため、環境変数ではなくここに保存し、
 * instagram-token-refresh.js が月1回自動更新する。
 */

async function getSetting(supabase, key) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

async function setSetting(supabase, key, value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

module.exports = { getSetting, setSetting };
