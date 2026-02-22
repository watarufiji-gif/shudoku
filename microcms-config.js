// microCMS settings
// 1) localStorageに保存された値があればそれを優先
// 2) なければ以下の固定値を使用
const storedMicrocmsServiceDomain = window.localStorage ? window.localStorage.getItem('microcms_service_domain') : '';
const storedMicrocmsApiKey = window.localStorage ? window.localStorage.getItem('microcms_api_key') : '';

// 例: your-service-name（https://your-service-name.microcms.io）
const staticMicrocmsServiceDomain = '';
const staticMicrocmsApiKey = '';

window.MICROCMS_SERVICE_DOMAIN = storedMicrocmsServiceDomain || staticMicrocmsServiceDomain;
window.MICROCMS_API_KEY = storedMicrocmsApiKey || staticMicrocmsApiKey;
window.MICROCMS_ENDPOINT = 'books';
window.MICROCMS_QUERY = 'limit=1&orders=-publishedAt';
