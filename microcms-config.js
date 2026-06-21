// ================================================================
// ⚠️  このファイルは git で追跡されているが、
//     ローカルで generate-pages.js を実行すると
//     staticMicrocmsApiKey にキーが書き込まれる。
//
//     誤コミット防止のため以下のフラグを設定済み：
//       git update-index --skip-worktree microcms-config.js
//
//     新しい環境でクローンした場合は上記コマンドを再実行すること。
//     キーを git に残してはいけない。
// ================================================================

// microCMS settings
// 1) sessionStorageに保存された値があればそれを優先
// 2) なければ以下の固定値を使用
const storedMicrocmsServiceDomain = window.sessionStorage ? window.sessionStorage.getItem('microcms_service_domain') : '';
const storedMicrocmsApiKey = window.sessionStorage ? window.sessionStorage.getItem('microcms_api_key') : '';
const legacyMicrocmsServiceDomain = window.localStorage ? window.localStorage.getItem('microcms_service_domain') : '';
const legacyMicrocmsApiKey = window.localStorage ? window.localStorage.getItem('microcms_api_key') : '';

if (window.sessionStorage && window.localStorage) {
    if (!storedMicrocmsServiceDomain && legacyMicrocmsServiceDomain) {
        window.sessionStorage.setItem('microcms_service_domain', legacyMicrocmsServiceDomain);
    }
    if (!storedMicrocmsApiKey && legacyMicrocmsApiKey) {
        window.sessionStorage.setItem('microcms_api_key', legacyMicrocmsApiKey);
    }
    window.localStorage.removeItem('microcms_service_domain');
    window.localStorage.removeItem('microcms_api_key');
}

// 例: your-service-name（https://your-service-name.microcms.io）
const staticMicrocmsServiceDomain = 'shudoku';
const staticMicrocmsApiKey = '';

window.MICROCMS_SERVICE_DOMAIN = storedMicrocmsServiceDomain || legacyMicrocmsServiceDomain || staticMicrocmsServiceDomain;
window.MICROCMS_API_KEY = storedMicrocmsApiKey || legacyMicrocmsApiKey || staticMicrocmsApiKey;
window.MICROCMS_ENDPOINT = 'books';
window.MICROCMS_QUERY = 'limit=100&orders=-publishedAt';
