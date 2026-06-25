/**
 * generate-pages.js
 * microCMSから全記事を取得し、各書評ページ・archive.html・sitemap.xmlを生成する。
 * netlify.toml の build.command から呼ばれる。
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SERVICE_DOMAIN      = process.env.MICROCMS_SERVICE_DOMAIN || 'shudoku';
const API_KEY             = process.env.MICROCMS_API_KEY;
const SITE_URL            = (process.env.SITE_URL || 'https://syudoku.com').replace(/\/$/, '');
const MICROCMS_ENDPOINT   = process.env.MICROCMS_ENDPOINT || 'books';
const ROOT           = path.join(__dirname, '..');

const STATIC_PAGES = [
  { loc: '/',            changefreq: 'weekly',  priority: '1.0' },
  { loc: '/archive.html', changefreq: 'weekly',  priority: '0.8' },
  { loc: '/about.html',  changefreq: 'monthly', priority: '0.5' },
  { loc: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
];

// ── エントリポイント ─────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.warn('[generate-pages] MICROCMS_API_KEY が未設定です。スキップします。');
    process.exit(0);
  }

  console.log('[generate-pages] microCMSから記事を取得中...');
  let books;
  try {
    books = await fetchAllBooks();
  } catch (err) {
    console.error('[generate-pages] microCMS fetch 失敗:', err.message);
    process.exit(1);
  }

  console.log(`[generate-pages] ${books.length}件取得`);

  // 各書籍の表紙URLを事前解決（coverImage → ASIN → Google Books の順）
  console.log('[generate-pages] 表紙URLを解決中...');
  for (const book of books) {
    book._resolvedCoverUrl = await resolveCoverUrl(book);
    if (book._resolvedCoverUrl) {
      console.log(`  [cover] ${book.title || book.slug}: ${book._resolvedCoverUrl.slice(0, 60)}...`);
    } else {
      console.warn(`  [cover] ${book.title || book.slug}: 表紙URLが解決できませんでした`);
    }
  }

  // 各書評ページを生成
  for (const book of books) {
    const slug     = book.slug || slugify(book.title || 'book');
    const filename = `${slug}.html`;
    const filepath = path.join(ROOT, filename);
    fs.writeFileSync(filepath, bookPageHtml(book, slug), 'utf8');
    console.log(`  → ${filename}`);
  }

  // archive.html を生成
  fs.writeFileSync(path.join(ROOT, 'archive.html'), archiveHtml(books), 'utf8');
  console.log('  → archive.html');

  // sitemap.xml を生成
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml(books), 'utf8');
  console.log('  → sitemap.xml');

  // robots.txt を修正
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robotsTxt(), 'utf8');
  console.log('  → robots.txt');

  // microcms-config.js に API キーを注入（キーは Netlify 環境変数から取得）
  injectMicroCMSApiKey();

  console.log('[generate-pages] 完了');
}

main().catch(err => { console.error(err); process.exit(1); });

// ── microCMS フェッチ ────────────────────────────────────────────────────────

async function fetchAllBooks() {
  const limit  = 100;
  let offset   = 0;
  let all      = [];

  while (true) {
    const url = `https://${SERVICE_DOMAIN}.microcms.io/api/v1/${MICROCMS_ENDPOINT}`
      + `?limit=${limit}&offset=${offset}&orders=-publishedAt`;
    const res  = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': API_KEY } });

    // エンドポイントが未作成またはコンテンツ0件の場合は空で続行
    if (res.status === 404) {
      console.warn(`[generate-pages] microCMS エンドポイント "${MICROCMS_ENDPOINT}" が見つかりません（404）。記事なしで続行します。`);
      return [];
    }
    if (!res.ok) throw new Error(`microCMS ${res.status}: ${await res.text()}`);

    const json = await res.json();
    all = all.concat(json.contents || []);
    if (offset + limit >= (json.totalCount || 0)) break;
    offset += limit;
  }

  return all;
}

// ── 書評ページテンプレート ───────────────────────────────────────────────────

function bookPageHtml(book, slug) {
  const title       = book.title       || '';
  const author      = book.author      || '';
  const category    = book.category    || '';
  const conclusion  = book.conclusion  || '';
  const quote       = book.quote       || '';
  const description = book.description || '';
  const weekLabel   = book.weekLabel   || '';
  const weekDate    = book.weekDate    || '';
  const resolvedCoverUrl = book._resolvedCoverUrl || '';
  const amazonUrl   = book.AmazonURL   || '';

  const canonicalUrl  = `${SITE_URL}/${slug}.html`;
  const metaDesc      = conclusion
    ? conclusion.slice(0, 120)
    : (description.split('\n')[0] || '').slice(0, 120);
  const ogImage       = resolvedCoverUrl || `${SITE_URL}/assets/shudoku-logo.png`;
  const descParagraphs = description.split('\n').filter(p => p.trim())
    .map(p => `<p>${esc(p)}</p>`).join('\n              ');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Book',
        'name': title,
        'author': { '@type': 'Person', 'name': author },
        ...(resolvedCoverUrl ? { 'image': resolvedCoverUrl } : {}),
        ...(amazonUrl  ? { 'url':   amazonUrl }  : {}),
        ...(category   ? { 'genre': category }   : {}),
      },
      {
        '@type': 'Review',
        'itemReviewed': {
          '@type': 'Book',
          'name': title,
          'author': { '@type': 'Person', 'name': author },
        },
        'author':    { '@type': 'Organization', 'name': '週読', 'url': SITE_URL },
        'publisher': { '@type': 'Organization', 'name': '週読', 'url': SITE_URL },
        'reviewBody': description,
        ...(conclusion ? { 'description': conclusion } : {}),
        'url': canonicalUrl,
      },
    ],
  }, null, 2);

  const readerData = JSON.stringify({
    text: description,
    title,
    author,
    amazonUrl,
  }).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://*.netlify.app https://www.google-analytics.com https://region1.google-analytics.com; form-action 'self'; upgrade-insecure-requests">
  <title>${esc(title)} | 週読</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type"        content="article">
  <meta property="og:title"       content="${esc(title)} | 週読">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url"         content="${canonicalUrl}">
  <meta property="og:image"       content="${esc(ogImage)}">
  <meta property="og:site_name"   content="週読">
  <meta name="twitter:card"       content="summary_large_image">
  <script type="application/ld+json">
${jsonLd}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;600&family=Shippori+Mincho:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- ナビゲーション -->
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo" aria-label="週読 ホーム">
        <img src="/assets/logo-mark.png" alt="" class="nav-logo-mark" aria-hidden="true">
        <span class="nav-logo-word">週読</span>
      </a>
      <div class="nav-links">
        <a href="/about.html">このサイトについて</a>
        <a href="/archive.html">過去の本</a>
        <a href="/#subscribe" class="nav-cta">購読する</a>
      </div>
    </div>
  </nav>

  <!-- 書評メイン -->
  <main class="hero" style="min-height:auto;padding-bottom:60px;">
    <div class="hero-container">

      <!-- 週バッジ -->
      <div class="week-badge">
        ${weekLabel ? `<span class="week-number" style="background:var(--color-text-secondary);">${esc(weekLabel)}</span>` : ''}
        ${weekDate  ? `<span class="week-remaining week-remaining-below">${esc(weekDate)}</span>` : ''}
      </div>

      <!-- 書籍情報 -->
      <div class="book-showcase">
        <!-- 表紙 -->
        <div class="book-visual">
          ${resolvedCoverUrl
            ? `<img src="${esc(resolvedCoverUrl)}" alt="${esc(title)}の表紙" class="book-cover${description ? ' is-reader-trigger' : ''}" loading="lazy">`
            : `<div class="book-cover" style="background:var(--color-bg-accent);display:flex;align-items:center;justify-content:center;"><span style="font-size:3rem;opacity:.3;">📖</span></div>`
          }
          ${description ? `<span class="book-open-hint" aria-hidden="true">タップして読む →</span>` : ''}
          <div class="book-shadow"></div>
        </div>

        <!-- テキスト情報 -->
        <div class="book-info">
          ${category ? `<p class="book-category">${esc(category)}</p>` : ''}
          <h1 class="book-title">${esc(title)}</h1>
          <p class="book-author">${esc(author)}</p>

          ${conclusion ? `
          <!-- この一冊で何が変わるか -->
          <div class="book-conclusion" style="margin:20px 0 24px;padding:16px 20px;background:var(--color-bg-warm);border-left:3px solid var(--color-gold);border-radius:0 6px 6px 0;">
            <p style="font-size:0.72rem;color:var(--color-text-muted);letter-spacing:.08em;margin:0 0 6px;text-transform:uppercase;">この一冊で何が変わるか</p>
            <p style="font-size:1rem;font-weight:500;color:var(--color-text);line-height:1.7;margin:0;">${esc(conclusion)}</p>
          </div>` : ''}

          ${quote ? `
          <blockquote class="book-quote">
            <p>${esc(quote)}</p>
          </blockquote>` : ''}

          <div class="book-description">
            ${descParagraphs}
          </div>

          ${amazonUrl ? `
          <div class="book-cta">
            <div class="cta-group">
              <a href="${esc(amazonUrl)}" target="_blank" rel="noopener noreferrer"
                 class="btn btn-amazon"
                 data-track-type="affiliate" data-platform="amazon" data-book-title="${esc(title)}">
                <span class="btn-icon">📦</span>
                <span class="btn-text">Amazonで見る</span>
              </a>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- 戻るリンク -->
      <div style="text-align:center;margin-top:60px;">
        <a href="/archive.html" style="color:var(--color-text-secondary);text-decoration:none;border-bottom:1px solid var(--color-border);">一覧に戻る</a>
      </div>
    </div>
  </main>

  <!-- 購読導線（検索流入を購読者に変換） -->
  <section style="background:var(--color-bg-warm);border-top:1px solid var(--color-border);padding:60px 20px;">
    <div style="max-width:540px;margin:0 auto;text-align:center;">
      <p style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:12px;color:var(--color-text);">次の一冊も、毎週土曜日に届けます</p>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:28px;line-height:1.8;">
        メールアドレスを登録するだけ。無料。広告なし。いつでも解除できます。
      </p>
      <form id="newsletter-form" data-source="search"
            style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">
        <input id="newsletter-email" type="email" placeholder="your@email.com" required
               style="padding:12px 16px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-white);font-size:0.9rem;width:260px;outline:none;">
        <button id="newsletter-submit" type="submit" class="btn btn-amazon" style="min-width:140px;border:0;">
          無料で購読する
        </button>
      </form>
      <p id="newsletter-status" class="newsletter-status" role="alert"></p>
    </div>
  </section>

  <!-- フッター -->
  <footer class="footer">
    <div class="footer-container">
      <div class="footer-brand">
        <span class="footer-logo">週読</span>
        <p class="footer-tagline">週に一冊、自分と向き合う時間を</p>
      </div>
      <div class="footer-links">
        <a href="/privacy.html">プライバシーポリシー</a>
        <a href="/about.html">お問い合わせ</a>
      </div>
      <p class="footer-copyright">© 2026 週読 All rights reserved.</p>
    </div>
  </footer>

  ${description ? `<!-- book reader overlay -->
  <div class="book-reader-overlay" id="book-reader-overlay" role="dialog" aria-modal="true" aria-label="書評を読む">
    <button class="book-reader-close" id="book-reader-close" aria-label="閉じる">✕</button>
    <div class="book-body">
      <div class="book-spread" id="book-spread">
        <div class="book-page book-page-right">
          <div id="book-page-right-text"></div>
        </div>
        <div class="book-gutter" aria-hidden="true"></div>
        <div class="book-page book-page-left">
          <div id="book-page-left-text"></div>
        </div>
      </div>
      <div class="book-nav-bar">
        <button class="book-nav-btn" id="book-nav-prev" aria-label="前の見開きへ">← 前へ</button>
        <span class="book-spread-indicator" id="book-spread-indicator"></span>
        <button class="book-nav-btn" id="book-nav-next" aria-label="次の見開きへ">次へ →</button>
      </div>
    </div>
  </div>
  <script type="application/json" id="book-reader-data">${readerData}</script>
  <script src="/book-reader.js"></script>` : ''}
  <script src="/analytics-config.js"></script>
  <script src="/newsletter.js"></script>
</body>
</html>`;
}

// ── archive.html テンプレート ────────────────────────────────────────────────

function archiveHtml(books) {
  const categories = [...new Set(books.map(b => b.category).filter(Boolean))].sort();

  const filterBtns = [
    `<button class="archive-filter-btn active" data-category="all">すべて</button>`,
    ...categories.map(cat =>
      `<button class="archive-filter-btn" data-category="${esc(cat)}">${esc(cat)}</button>`
    ),
  ].join('\n        ');

  const cards = books.map(book => {
    const slug      = book.slug || slugify(book.title || 'book');
    const title     = book.title    || '';
    const author    = book.author   || '';
    const category  = book.category || '';
    const weekLabel = book.weekLabel || weekLabelFromDate(book.publishedAt || book.createdAt);
    const coverUrl  = book._resolvedCoverUrl || '';
    const conclusion = book.conclusion || '';

    return `<a href="/${esc(slug)}.html" class="archive-card" data-category="${esc(category)}"
          style="display:block;text-decoration:none;color:inherit;background:var(--color-white);border:1px solid var(--color-border);border-radius:8px;overflow:hidden;transition:box-shadow .2s;">
          <div style="display:flex;gap:16px;padding:16px;">
            <div style="flex-shrink:0;">
              ${coverUrl
                ? `<img src="${esc(coverUrl)}" alt="${esc(title)}の表紙" loading="lazy"
                       style="width:64px;height:92px;object-fit:cover;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.15);">`
                : `<div style="width:64px;height:92px;background:var(--color-bg-accent);border-radius:3px;display:flex;align-items:center;justify-content:center;"><span style="font-size:1.5rem;opacity:.3;">📖</span></div>`
              }
            </div>
            <div style="flex:1;min-width:0;">
              ${category  ? `<p style="font-size:0.72rem;color:var(--color-text-muted);letter-spacing:.06em;margin:0 0 4px;">${esc(category)}</p>` : ''}
              <h3 style="font-size:0.95rem;font-weight:500;margin:0 0 4px;color:var(--color-text);line-height:1.4;">${esc(title)}</h3>
              <p  style="font-size:0.82rem;color:var(--color-text-secondary);margin:0 0 6px;">${esc(author)}</p>
              ${conclusion ? `<p style="font-size:0.78rem;color:var(--color-text-secondary);line-height:1.5;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(conclusion)}</p>` : ''}
            </div>
            ${weekLabel ? `<div style="flex-shrink:0;align-self:flex-start;"><span style="font-size:0.7rem;color:var(--color-text-muted);white-space:nowrap;">${esc(weekLabel)}</span></div>` : ''}
          </div>
        </a>`;
  }).join('\n        ');

  const emptyMsg = books.length === 0
    ? `<p style="grid-column:1/-1;text-align:center;color:var(--color-text-secondary);padding:40px 0;">
        まだバックナンバーはありません。公開をお待ちください。
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co https://*.netlify.app https://www.google-analytics.com https://region1.google-analytics.com; form-action 'self'; upgrade-insecure-requests">
  <title>バックナンバー | 週読</title>
  <meta name="description" content="週読がこれまでに届けてきた本の一覧。ジャンル別に絞り込んで読めます。">
  <link rel="canonical" href="${SITE_URL}/archive.html">
  <meta property="og:type"        content="website">
  <meta property="og:title"       content="バックナンバー | 週読">
  <meta property="og:description" content="週読がこれまでに届けてきた本の一覧。">
  <meta property="og:url"         content="${SITE_URL}/archive.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;600&family=Shippori+Mincho:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>
    .archive-filter-btn {
      padding: 7px 18px;
      border: 1px solid var(--color-border);
      border-radius: 20px;
      background: var(--color-white);
      color: var(--color-text-secondary);
      font-size: 0.82rem;
      cursor: pointer;
      transition: all .15s;
    }
    .archive-filter-btn:hover,
    .archive-filter-btn.active {
      background: var(--color-text);
      color: var(--color-white);
      border-color: var(--color-text);
    }
    .archive-card:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,.1);
    }
  </style>
</head>
<body>
  <!-- ナビゲーション -->
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo" aria-label="週読 ホーム">
        <img src="/assets/logo-mark.png" alt="" class="nav-logo-mark" aria-hidden="true">
        <span class="nav-logo-word">週読</span>
      </a>
      <div class="nav-links">
        <a href="/about.html">このサイトについて</a>
        <a href="/archive.html" aria-current="page">過去の本</a>
        <a href="/#subscribe" class="nav-cta">購読する</a>
      </div>
    </div>
  </nav>

  <!-- ヘッダー -->
  <header style="padding:100px 20px 40px;text-align:center;background:var(--color-bg);">
    <h1 style="font-family:var(--font-serif);font-size:2rem;margin-bottom:12px;">バックナンバー</h1>
    <p style="color:var(--color-text-secondary);margin-bottom:0;">
      これまでに届けてきた本の一覧です。
      <span id="archive-count" style="margin-left:6px;font-weight:500;">${books.length}冊</span>
    </p>
  </header>

  <!-- ジャンルフィルター -->
  ${categories.length > 0 ? `
  <div style="padding:0 20px 32px;text-align:center;">
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:720px;margin:0 auto;">
      ${filterBtns}
    </div>
  </div>` : ''}

  <!-- 一覧グリッド -->
  <section style="padding:0 20px 80px;">
    <div class="archive-container">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;" id="archive-grid">
        ${cards || emptyMsg}
      </div>
    </div>
  </section>

  <!-- フッター -->
  <footer class="footer">
    <div class="footer-container">
      <div class="footer-brand">
        <span class="footer-logo">週読</span>
        <p class="footer-tagline">週に一冊、自分と向き合う時間を</p>
      </div>
      <div class="footer-links">
        <a href="/privacy.html">プライバシーポリシー</a>
        <a href="/about.html">お問い合わせ</a>
      </div>
      <p class="footer-copyright">© 2026 週読 All rights reserved.</p>
    </div>
  </footer>

  <script src="/analytics-config.js"></script>
  <script src="/archive-filter.js"></script>
</body>
</html>`;
}

// ── sitemap.xml ──────────────────────────────────────────────────────────────

function sitemapXml(books) {
  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = STATIC_PAGES.map(p => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n');

  const bookUrls = books.map(book => {
    const slug    = book.slug || slugify(book.title || 'book');
    const lastmod = (book.updatedAt || book.publishedAt || today).slice(0, 10);
    return `  <url>
    <loc>${SITE_URL}/${slug}.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${bookUrls}
</urlset>`;
}

// ── robots.txt ────────────────────────────────────────────────────────────────

function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /.netlify/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 表紙URLを3段階で解決: coverImage → Amazon ASIN → Google Books API
async function resolveCoverUrl(book) {
  // 1. microCMS の coverImage フィールド
  const direct = book.coverImage?.url || '';
  if (direct) return direct;

  // 2. AmazonURL から ASIN を抽出して Amazon 画像 URL を構築
  const asin = extractAsinFromUrl(book.AmazonURL || '');
  if (asin) return `https://m.media-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;

  // 3. Google Books API（タイトル＋著者で検索）
  const title  = book.title  || '';
  const author = book.author || '';
  if (!title) return '';
  try {
    const q   = encodeURIComponent(`${title} ${author}`.trim());
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
    if (!res.ok) return '';
    const data = await res.json();
    const info = data?.items?.[0]?.volumeInfo;
    const img  = info?.imageLinks?.thumbnail || info?.imageLinks?.smallThumbnail || '';
    return img.replace(/^http:\/\//i, 'https://');
  } catch (_) {
    return '';
  }
}

// AmazonURL から ASIN を抽出（10桁英数字）
function extractAsinFromUrl(url) {
  if (!url) return '';
  const str = String(url);
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];
  for (const pattern of patterns) {
    const m = str.match(pattern);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return '';
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'book';
}

// publishedAt (ISO文字列) → 「第N週」ラベル（JST基準、script.jsと同一アルゴリズム）
function weekLabelFromDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const dayMs = 24 * 60 * 60 * 1000;
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const jst   = new Date(jstMs);
  const jstDate = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
  const year  = jstDate.getUTCFullYear();
  const firstSaturday = new Date(Date.UTC(year, 0, 1));
  const offsetToSaturday = (6 - firstSaturday.getUTCDay() + 7) % 7;
  firstSaturday.setUTCDate(firstSaturday.getUTCDate() + offsetToSaturday);
  const diffMs = jstDate.getTime() - firstSaturday.getTime();
  const week   = diffMs < 0 ? 1 : Math.floor(diffMs / (7 * dayMs)) + 1;
  return `第${week}週`;
}

// ── microCMS API キー注入 ──────────────────────────────────────────────────────
// git 上は空文字のまま保持し、ビルド時に環境変数から書き換える。
// これにより API キーが git 履歴に残らない。
function injectMicroCMSApiKey() {
  const apiKey = String(process.env.MICROCMS_API_KEY || '').trim();
  if (!apiKey) {
    console.warn('[generate-pages] MICROCMS_API_KEY が未設定のため microcms-config.js へのキー注入をスキップしました。');
    return;
  }

  const configPath = path.join(ROOT, 'microcms-config.js');
  const original   = fs.readFileSync(configPath, 'utf8');
  const injected   = original.replace(
    /^(const staticMicrocmsApiKey\s*=\s*)['"][^'"]*['"]\s*;/m,
    `$1'${apiKey}';`
  );

  if (original === injected) {
    console.warn('[generate-pages] microcms-config.js の注入パターンが見つかりませんでした。スキップします。');
    return;
  }

  fs.writeFileSync(configPath, injected, 'utf8');
  console.log('  → microcms-config.js (API キーを注入)');
}
