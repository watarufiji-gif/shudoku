# Weekly Release Checklist

## 1. Content
- [ ] microCMS `books` の最新記事が1件公開済み
- [ ] 必須項目: `title, author, category, quote, description, coverImage, amazonUrl, rakutenUrl, weekLabel`
- [ ] Amazon/Rakuten URLにあなたのアフィリエイトIDが含まれている

## 2. Frontend
- [ ] `index.html` と `book-22.html` でタイトル/著者/書影が一致
- [ ] クリックでAmazon/Rakutenが正しく開く
- [ ] モバイル表示で崩れがない

## 3. Security
- [ ] `supabase-config.js` に `service_role` を入れていない
- [ ] OAuthは使うプロバイダだけ有効
- [ ] `_headers` がデプロイ対象に含まれている

## 4. SEO
- [ ] `sitemap.xml` のドメインが本番ドメイン
- [ ] `robots.txt` のSitemap URLが本番ドメイン
- [ ] OGP画像とタイトルが最新本に合っている

## 5. Monitoring
- [ ] `bash scripts/check-affiliate-links.sh` を実行し、エラーがない
- [ ] `login.html` のクリック集計（ローカル）を確認
