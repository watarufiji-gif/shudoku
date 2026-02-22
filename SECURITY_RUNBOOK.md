# Security Runbook

## API Key Rotation

### Supabase
1. Supabase Dashboard で `anon` キーを再発行する
2. `login.html` の設定フォーム、または `supabase-config.js` の固定値を更新
3. ログインと読書記録登録を確認

### microCMS
1. microCMS で Read only APIキーを再発行する
2. `login.html` のmicroCMS設定フォーム、または `microcms-config.js` を更新
3. `index.html` / `book-22.html` の表示更新を確認

### GA4
1. GA4のMeasurement IDを確認
2. `analytics-config.js` の `window.GA4_MEASUREMENT_ID` を更新
3. 開発者ツールで `affiliate_click` イベント送信を確認

## Incident Response (簡易)
1. 不審な挙動を見つけたら該当APIキーを即ローテーション
2. `_headers` とCSP変更有無を確認
3. 直近デプロイとの差分を確認してロールバック判断
