# Weekly Release Checklist

## 1. Content
- [ ] microCMS `books` の最新記事が1件公開済み
- [ ] 必須項目: `title, author, category, quote, description, coverImage, AmazonURL, weekLabel`
- [ ] Amazon URLにあなたのアフィリエイトIDが含まれている

## 2. Frontend
- [ ] `index.html` と `book-22.html` でタイトル/著者/書影が一致
- [ ] クリックでAmazonが正しく開く
- [ ] モバイル表示で崩れがない

## 3. Security
- [ ] `supabase-config.js` に `service_role` を入れていない
- [ ] OAuthは使うプロバイダだけ有効
- [ ] `_headers` がデプロイ対象に含まれている
- [ ] `_redirects` がデプロイ対象に含まれている（`/login` と `/my-library` をブロック）

## 4. SEO
- [ ] `sitemap.xml` のドメインが本番ドメイン
- [ ] `robots.txt` のSitemap URLが本番ドメイン
- [ ] OGP画像とタイトルが最新本に合っている

## 5. Monitoring
- [ ] `bash scripts/check-affiliate-links.sh` を実行し、エラーがない
- [ ] `missing_tag` / `placeholder_tag` が0件
- [ ] `bash scripts/preflight-check.sh` が成功
