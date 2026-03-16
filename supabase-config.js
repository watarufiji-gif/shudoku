// Supabase project settings
// 優先順位:
// 1. sessionStorage に保存された値（ブラウザ設定UI）
// 2. 下記の固定値（本番デプロイ時に直接記入してもOK）
const storedSupabaseUrl = window.sessionStorage ? window.sessionStorage.getItem('supabase_url') : '';
const storedSupabaseAnonKey = window.sessionStorage ? window.sessionStorage.getItem('supabase_anon_key') : '';
const legacySupabaseUrl = window.localStorage ? window.localStorage.getItem('supabase_url') : '';
const legacySupabaseAnonKey = window.localStorage ? window.localStorage.getItem('supabase_anon_key') : '';

if (window.sessionStorage && window.localStorage) {
    if (!storedSupabaseUrl && legacySupabaseUrl) window.sessionStorage.setItem('supabase_url', legacySupabaseUrl);
    if (!storedSupabaseAnonKey && legacySupabaseAnonKey) window.sessionStorage.setItem('supabase_anon_key', legacySupabaseAnonKey);
    window.localStorage.removeItem('supabase_url');
    window.localStorage.removeItem('supabase_anon_key');
}

const staticSupabaseUrl = '';
const staticSupabaseAnonKey = '';

window.SUPABASE_URL = storedSupabaseUrl || legacySupabaseUrl || staticSupabaseUrl;
window.SUPABASE_ANON_KEY = storedSupabaseAnonKey || legacySupabaseAnonKey || staticSupabaseAnonKey;

// 有効化したOAuthプロバイダだけ表示する（例: ['google', 'apple']）
window.ENABLED_OAUTH_PROVIDERS = ['google'];
