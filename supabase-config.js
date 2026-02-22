// Supabase project settings
// 優先順位:
// 1. localStorage に保存された値（ブラウザ設定UI）
// 2. 下記の固定値（本番デプロイ時に直接記入してもOK）
const storedSupabaseUrl = window.localStorage ? window.localStorage.getItem('supabase_url') : '';
const storedSupabaseAnonKey = window.localStorage ? window.localStorage.getItem('supabase_anon_key') : '';

const staticSupabaseUrl = '';
const staticSupabaseAnonKey = '';

window.SUPABASE_URL = storedSupabaseUrl || staticSupabaseUrl;
window.SUPABASE_ANON_KEY = storedSupabaseAnonKey || staticSupabaseAnonKey;

// 有効化したOAuthプロバイダだけ表示する（例: ['google', 'apple']）
window.ENABLED_OAUTH_PROVIDERS = ['google'];
