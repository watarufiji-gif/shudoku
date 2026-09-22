#!/usr/bin/env node
/**
 * check-overflow.js — 全公開ページ × 全指定幅 × Chromium/WebKit で
 * documentElement.scrollWidth === clientWidth（横はみ出し0）を検査する。
 *
 * レイアウトに関わる変更（style.css・グリッド/フレックス・折り返し設定など）を
 * pushする前に必ず実行すること。
 *
 * 使い方:
 *   1. 初回のみ:
 *        npm install          （playwright は package.json の devDependencies）
 *        npx playwright install chromium webkit
 *   2. node scripts/check-overflow.js
 *      オプション:
 *        --pages=index.html,archive.html   対象ページを絞る（省略時は直下の*.html全部）
 *        --widths=375,390                  対象幅を絞る（省略時は既定の10段階）
 *        --engines=chromium                対象エンジンを絞る（省略時は chromium,webkit）
 *
 * Netlifyの本番buildへの影響について:
 *   playwright は devDependencies に入れているため、Netlifyのデフォルト
 *   （NODE_ENV=production での npm install）では自動的にインストール対象外になる。
 *   万一 devDependencies がインストールされる設定に変わった場合の保険として、
 *   netlify.toml の build.environment に PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 を
 *   設定済み（重いブラウザバイナリのダウンロードだけは常に止まる）。
 *
 * 動作:
 *   - プロジェクトルートを自己署名証明書つきローカルHTTPSサーバーで配信する
 *     （index.html の CSP に upgrade-insecure-requests があり、WebKit は http://localhost
 *      への直アクセスを https:// に書き換えて失敗するため、http直配信では検査にならない）
 *   - 各ページ・各幅・各エンジンで scrollWidth / clientWidth を計測し、
 *     はみ出しがあれば原因要素（右端がclientWidthを超える要素）を報告する
 *   - 全体を通してブラウザは各エンジン1インスタンスのみ起動し、ページ遷移は
 *     常に直列実行（同時アクセスなし）。失敗（タイムアウト等）は1回だけ自動リトライし、
 *     リトライも失敗した場合のみ FAIL として扱う
 *   - はみ出しが1件でもあれば exit code 1
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const DEFAULT_WIDTHS = [320, 375, 390, 430, 768, 899, 901, 1024, 1280, 1440];
const DEFAULT_ENGINES = ['chromium', 'webkit'];
const EXCLUDE_PAGES = ['_demo-home.html'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function parseArgs() {
  const args = { pages: null, widths: null, engines: null };
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'pages') args.pages = value.split(',').map((s) => s.trim());
    if (key === 'widths') args.widths = value.split(',').map((s) => parseInt(s, 10));
    if (key === 'engines') args.engines = value.split(',').map((s) => s.trim());
  }
  return args;
}

function discoverPages() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !EXCLUDE_PAGES.includes(f))
    .sort();
}

/** ~/.cache/shudoku-check-overflow に自己署名証明書を作成（なければ）。openssl必須。 */
function ensureCert() {
  const dir = path.join(os.tmpdir(), 'shudoku-check-overflow-cert');
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '365', '-subj', '/CN=localhost',
  ], { stdio: 'pipe' });
  return { keyPath, certPath };
}

function startServer() {
  const { keyPath, certPath } = ensureCert();
  const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };

  const server = https.createServer(options, (req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(ROOT, reqPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function measurePage(browser, url, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const docEl = document.documentElement;
      const clientWidth = docEl.clientWidth;
      const scrollWidth = docEl.scrollWidth;
      const offenders = [];
      if (scrollWidth > clientWidth) {
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > clientWidth + 1 && r.width > 0) {
            offenders.push({
              tag: el.tagName,
              id: el.id || '',
              cls: typeof el.className === 'string' ? el.className.slice(0, 50) : '',
              right: Math.round(r.right),
            });
          }
        });
        offenders.sort((a, b) => b.right - a.right);
      }
      return { scrollWidth, clientWidth, offenders: offenders.slice(0, 3) };
    });
    return result;
  } finally {
    await context.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 一時的なタイムアウト等を1回だけ自動リトライする。リトライも失敗したら例外を投げる。 */
async function measurePageWithRetry(browser, url, width) {
  try {
    return await measurePage(browser, url, width);
  } catch (err) {
    console.warn(`  [retry] ${url} @${width}px でエラー（1回リトライ）: ${err.message.split('\n')[0]}`);
    await sleep(500);
    return await measurePage(browser, url, width);
  }
}

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('[check-overflow] playwright が見つかりません。初回のみ以下を実行してください:');
    console.error('  npm install && npx playwright install chromium webkit');
    process.exit(1);
  }

  const args = parseArgs();
  const pages = args.pages || discoverPages();
  const widths = args.widths || DEFAULT_WIDTHS;
  const engineNames = args.engines || DEFAULT_ENGINES;
  const engines = { chromium: playwright.chromium, webkit: playwright.webkit };

  console.log(`[check-overflow] ${pages.length}ページ × ${widths.length}幅 × ${engineNames.length}エンジン を検査します`);

  const { server, port } = await startServer();
  const base = `https://127.0.0.1:${port}`;

  const failures = [];
  let checkedCount = 0;

  try {
    for (const engineName of engineNames) {
      const browserType = engines[engineName];
      if (!browserType) {
        console.warn(`[check-overflow] 不明なエンジン: ${engineName}（skip）`);
        continue;
      }
      const browser = await browserType.launch();
      try {
        for (const pageFile of pages) {
          for (const width of widths) {
            checkedCount++;
            const url = `${base}/${pageFile}`;
            let result;
            try {
              result = await measurePageWithRetry(browser, url, width);
            } catch (err) {
              failures.push({ engine: engineName, page: pageFile, width, error: err.message.split('\n')[0] });
              continue;
            }
            if (result.scrollWidth > result.clientWidth) {
              failures.push({
                engine: engineName,
                page: pageFile,
                width,
                overflow: result.scrollWidth - result.clientWidth,
                offenders: result.offenders,
              });
            }
            // 直列実行の間に短い間隔を置き、ローカルサーバー/ブラウザへの
            // 負荷集中によるタイムアウト自体を起きにくくする。
            await sleep(30);
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.close();
  }

  console.log(`[check-overflow] ${checkedCount}件の検査を実行`);

  if (failures.length === 0) {
    console.log('[check-overflow] ✓ はみ出し0件（PASS）');
    process.exit(0);
  }

  console.log(`[check-overflow] ✗ はみ出し ${failures.length}件（FAIL）`);
  console.log('');
  console.log('engine    | page                         | width | overflow | 原因要素');
  console.log('----------|------------------------------|-------|----------|----------');
  for (const f of failures) {
    if (f.error) {
      console.log(`${f.engine.padEnd(9)} | ${f.page.padEnd(28)} | ${String(f.width).padEnd(5)} | ERROR    | ${f.error}`);
      continue;
    }
    const offenderStr = f.offenders
      .map((o) => `${o.tag.toLowerCase()}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''}`)
      .join(', ');
    console.log(`${f.engine.padEnd(9)} | ${f.page.padEnd(28)} | ${String(f.width).padEnd(5)} | ${String(f.overflow + 'px').padEnd(8)} | ${offenderStr}`);
  }
  process.exit(1);
}

main();
