#!/usr/bin/env node
/**
 * create-book.js — book.json を読み、microCMS の books に「下書き＋土曜9時の予約公開」で1件登録する。
 *
 * 使い方:
 *   1. .env に MICROCMS_WRITE_API_KEY=（下記の権限を持つAPIキー）を設定
 *        - コンテンツの登録（POST）
 *        - コンテンツの取得（一覧・詳細）     ← 予約済みの土曜を検知するのに必要
 *        - コンテンツのスケジュール設定を変更  ← 予約公開の設定に必要
 *   2. book.example.json をコピーして book.json を作成し、記入
 *   3. node create-book.js
 *      （node create-book.js --dry-run で、割り当て日時と検査結果だけ確認しPOSTしない）
 *
 * 動作:
 *   - 既存 books の「公開済み／予約中の土曜（JST日付）」を集める
 *   - 今日以降で最初に空いている土曜 09:00 JST を計算して割り当てる
 *     （book.json に publishDate があればそれを優先。ただし土曜9:00 JST 以外はエラー）
 *   - 登録前にルールベースの自動検査を実行（AIは使わない）
 *   - 検査通過後、content API に status=draft でPOST → id取得
 *   - management API の reservation で予約公開日時を設定
 *   - 予約設定に失敗しても即時公開はしない（警告を出して手動対応を案内）
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = __dirname;
const BOOK_JSON  = path.join(ROOT, 'book.json');
const ENV_FILE   = path.join(ROOT, '.env');

const SERVICE_ID          = 'shudoku';
const ENDPOINT            = 'books';
const CONTENT_API_BASE    = `https://${SERVICE_ID}.microcms.io/api/v1`;
const MANAGEMENT_API_BASE = `https://${SERVICE_ID}.microcms-management.io/api/v1`;

// microCMS に送るフィールド（この10項目だけを book.json から拾う）
// AmazonURL のみ大文字始まり（microCMS のフィールドID仕様に合わせる）
const SEND_FIELDS = [
  'title', 'author', 'publisher', 'category', 'quote', 'description',
  'AmazonURL', 'conclusion', 'slug', 'greeting',
];

// 空だと登録を中止する必須項目
const REQUIRED_FIELDS = [
  'title', 'author', 'category', 'quote', 'description', 'AmazonURL', 'conclusion',
];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS_JA   = ['日', '月', '火', '水', '木', '金', '土'];

// ────────────────────────────── ユーティリティ ──────────────────────────────

/** .env を最低限パースして process.env に載せる（外部ライブラリ不要）。既存の環境変数が優先。 */
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 任意の時刻(ms)を JST のカレンダー日付 'YYYY-MM-DD' に変換 */
function jstDateString(ms) {
  const s = new Date(ms + JST_OFFSET_MS);
  return `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())}`;
}

/** 'YYYY-MM-DD'（JST日付）の曜日 0=日..6=土 */
function dowOfDateStr(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** その時刻が「JSTで土曜・09:00:00.000ちょうど」か */
function isJstSaturday9am(ms) {
  const s = new Date(ms + JST_OFFSET_MS);
  return (
    s.getUTCDay() === 6 &&
    s.getUTCHours() === 9 &&
    s.getUTCMinutes() === 0 &&
    s.getUTCSeconds() === 0 &&
    s.getUTCMilliseconds() === 0
  );
}

/** 'YYYY-MM-DD' に n 日足した 'YYYY-MM-DD' を返す */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** 'YYYY-MM-DD' の 09:00 JST を表す ISO8601 文字列 */
function publishIsoFor(dateStr) {
  return `${dateStr}T09:00:00+09:00`;
}

/** 表示用: '2026-09-19（土）' */
function formatJa(dateStr) {
  return `${dateStr}（${WEEKDAYS_JA[dowOfDateStr(dateStr)]}）`;
}

// ────────────────────────────── 既存の土曜を集める ──────────────────────────────

/**
 * 既存 books の公開済み／予約中の日付を集める。
 * まず management API（予約中の下書きも見える）、失敗したら content API（公開済みのみ）。
 * 返り値: { usedDates: Map<'YYYY-MM-DD', {kind, id}>, source: string }
 */
async function fetchUsedDates(apiKey) {
  // (1) management API — 予約中(DRAFT)も含めて取得できる
  try {
    const all = [];
    let offset = 0;
    for (let guard = 0; guard < 50; guard++) {
      const res = await fetch(
        `${MANAGEMENT_API_BASE}/contents/${ENDPOINT}?limit=100&offset=${offset}`,
        { headers: { 'X-MICROCMS-API-KEY': apiKey } },
      );
      if (!res.ok) throw new Error(`management API HTTP ${res.status}`);
      const json = await res.json();
      const contents = json.contents || [];
      all.push(...contents);
      offset += 100;
      if (contents.length === 0 || offset >= (json.totalCount || 0)) break;
    }
    const map = new Map();
    for (const c of all) {
      const reserved = c.reservationTime && c.reservationTime.publishTime;
      if (reserved) {
        map.set(jstDateString(Date.parse(reserved)), { kind: 'reserved', id: c.id });
      } else if (c.publishedAt) {
        const d = jstDateString(Date.parse(c.publishedAt));
        if (!map.has(d)) map.set(d, { kind: 'published', id: c.id });
      }
    }
    return { usedDates: map, source: '管理API（予約中も判定）' };
  } catch (e) {
    console.warn(`⚠ 管理APIから予約状況を取得できませんでした（${e.message}）。`);
    console.warn('  APIキーに「コンテンツの取得（一覧・詳細）」権限が無いと、予約中の土曜が見えません。');
  }

  // (2) content API フォールバック — 公開済みのみ
  try {
    const res = await fetch(
      `${CONTENT_API_BASE}/${ENDPOINT}?limit=100&fields=id,publishedAt`,
      { headers: { 'X-MICROCMS-API-KEY': apiKey } },
    );
    if (!res.ok) throw new Error(`content API HTTP ${res.status}`);
    const json = await res.json();
    const map = new Map();
    for (const c of json.contents || []) {
      if (c.publishedAt) {
        const d = jstDateString(Date.parse(c.publishedAt));
        if (!map.has(d)) map.set(d, { kind: 'published', id: c.id });
      }
    }
    return { usedDates: map, source: '公開APIのみ（予約中は未確認）' };
  } catch (e) {
    console.warn(`⚠ 既存 books の取得に失敗しました（${e.message}）。ダブり判定なしで続行します。`);
    return { usedDates: new Map(), source: '取得失敗（ダブり未判定）' };
  }
}

/** 今日以降で最初に空いている土曜（JST）を求める */
function computeNextFreeSaturday(usedSet, nowMs) {
  const s = new Date(nowMs + JST_OFFSET_MS);
  const todayStr = `${s.getUTCFullYear()}-${pad2(s.getUTCMonth() + 1)}-${pad2(s.getUTCDate())}`;
  const daysUntilSat = (6 - s.getUTCDay() + 7) % 7;

  let cur = addDays(todayStr, daysUntilSat);
  let weeks = 0;
  // 使用済み、または 09:00 JST が既に過ぎている土曜はスキップ
  while (usedSet.has(cur) || Date.parse(publishIsoFor(cur)) <= nowMs) {
    cur = addDays(cur, 7);
    weeks += 1;
  }
  return { dateStr: cur, weeksAdvanced: weeks };
}

// ────────────────────────────── 自動検査 ──────────────────────────────

/** ルールベースの検査。1つでも失敗したら列挙して停止。 */
function runValidation(body, publishDateStr, usedDates) {
  const errors = [];
  const warnings = [];

  // 必須項目
  for (const f of REQUIRED_FIELDS) {
    if (isEmpty(body[f])) errors.push(`必須項目が空: ${f}`);
  }

  // AmazonURL 形式
  const url = String(body.AmazonURL || '');
  if (!/^https:\/\/www\.amazon\.co\.jp\/dp\/[A-Za-z0-9]{10}(?:[/?#]|$)/.test(url)) {
    errors.push('AmazonURL が https://www.amazon.co.jp/dp/{10桁ASIN} の形式ではない');
  }
  if (!/[?&]tag=syudoku-22(?:&|$)/.test(url)) {
    errors.push('AmazonURL に tag=syudoku-22 が含まれていない');
  }

  // slug（空なら警告のみ）
  const slug = String(body.slug || '').trim();
  if (slug === '') {
    warnings.push('slug が空（microCMS 側で title から自動生成されます）');
  } else if (!/^[a-zA-Z0-9-]+$/.test(slug)) {
    errors.push('slug に半角英数字・ハイフン以外の文字が含まれている');
  }

  // 公開日時（土曜・09:00・JST）
  const publishMs = Date.parse(publishIsoFor(publishDateStr));
  if (!isJstSaturday9am(publishMs)) {
    errors.push(`公開日時が土曜9:00 JST ではない: ${publishDateStr} 09:00`);
  }

  // ダブり最終チェック
  if (usedDates.has(publishDateStr)) {
    const info = usedDates.get(publishDateStr);
    const kindJa = info.kind === 'reserved' ? '予約中' : '公開済み';
    errors.push(`同じ土曜に既存の本がある: ${publishDateStr}（${kindJa} / id: ${info.id}）`);
  }

  for (const w of warnings) console.log(`△ 警告: ${w}`);

  if (errors.length) {
    console.error('');
    console.error('✗ 検査に失敗しました。登録を中止します:');
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }

  console.log('✓ 検査OK（必須項目 / AmazonURL形式 / アフィリエイトタグ / slug / 公開日時 / ダブりなし）');
}

// ────────────────────────────── microCMS 呼び出し ──────────────────────────────

async function postDraft(apiKey, body) {
  let res;
  try {
    res = await fetch(`${CONTENT_API_BASE}/${ENDPOINT}?status=draft`, {
      method: 'POST',
      headers: { 'X-MICROCMS-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    fail(`下書きのPOSTに失敗しました: ${e.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ 下書きの作成に失敗しました（HTTP ${res.status} ${res.statusText}）`);
    console.error(text);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { id: '(不明)' };
  }
}

/**
 * management API で予約公開日時を設定。
 * PUT https://{service}.microcms-management.io/api/v1/contents/{endpoint}/{id}/reservation
 * body: { "publishTime": ISO8601 }
 * ※ 即時公開は行わない。失敗しても draft は残し、警告のみ。
 */
async function reservePublish(apiKey, id, publishIso) {
  let res;
  try {
    res = await fetch(`${MANAGEMENT_API_BASE}/contents/${ENDPOINT}/${id}/reservation`, {
      method: 'PUT',
      headers: { 'X-MICROCMS-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishTime: publishIso }),
    });
  } catch (e) {
    return { ok: false, detail: e.message };
  }
  const text = await res.text();
  return { ok: res.ok, status: res.status, statusText: res.statusText, body: text };
}

// ────────────────────────────── メイン ──────────────────────────────

async function main() {
  loadEnv();

  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(BOOK_JSON)) {
    fail('book.json がありません。book.example.json をコピーして作成してください');
  }

  const apiKey = String(process.env.MICROCMS_WRITE_API_KEY || '').trim();
  if (!apiKey) {
    fail('.env にAPIキーが設定されていません（MICROCMS_WRITE_API_KEY）');
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(BOOK_JSON, 'utf8'));
  } catch (err) {
    fail(`book.json のJSONとして読み込めませんでした: ${err.message}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('book.json はオブジェクト形式（{ ... }）で記述してください');
  }

  // 送信フィールドだけ拾う（_comment / publishDate など余計なキーは無視）
  const body = {};
  for (const field of SEND_FIELDS) {
    if (field in raw && raw[field] !== undefined && raw[field] !== null) {
      body[field] = raw[field];
    }
  }

  // 1. 既存の使用済み土曜を取得
  const { usedDates, source } = await fetchUsedDates(apiKey);
  const usedSaturdays = [...usedDates.keys()].filter((d) => dowOfDateStr(d) === 6);

  // 2. 公開日時の決定
  const nowMs = Date.now();
  const override = typeof raw.publishDate === 'string' ? raw.publishDate.trim() : '';
  let publishDateStr;
  let assignmentNote;

  if (override) {
    const ms = Date.parse(override);
    if (Number.isNaN(ms)) {
      fail(`book.json の publishDate を日時として解釈できません: ${override}`);
    }
    if (!isJstSaturday9am(ms)) {
      fail(
        `book.json の publishDate が「土曜 09:00 JST」ではありません: ${override}\n` +
        '例: 2026-09-19T09:00:00+09:00',
      );
    }
    publishDateStr = jstDateString(ms);
    assignmentNote = 'book.json の publishDate 指定を使用';
  } else {
    const r = computeNextFreeSaturday(new Set(usedDates.keys()), nowMs);
    publishDateStr = r.dateStr;
    assignmentNote = `自動割り当て（今日から数えて ${r.weeksAdvanced + 1} 番目の土曜）`;
  }

  const publishIso = publishIsoFor(publishDateStr);

  // 3. 登録計画の表示
  console.log('');
  console.log(`公開予定: ${formatJa(publishDateStr)} 09:00 JST`);
  console.log(`使用済みの土曜: ${usedSaturdays.length} 件（データ元: ${source}）`);
  console.log(`割り当て: ${assignmentNote}`);
  console.log('');

  // 4. 自動検査
  runValidation(body, publishDateStr, usedDates);

  if (dryRun) {
    console.log('');
    console.log('（--dry-run のため登録はしません。上記の内容で問題なければ --dry-run を外して実行してください）');
    return;
  }

  // 5. 下書きをPOST
  const created = await postDraft(apiKey, body);
  const id = created.id;

  // 6. 予約公開を設定
  const reserved = await reservePublish(apiKey, id, publishIso);

  // 7. 結果
  console.log('');
  if (reserved.ok) {
    console.log('✓ 下書きを作成し、予約公開を設定しました');
    console.log(`   id: ${id}`);
    console.log(`   公開予定: ${formatJa(publishDateStr)} 09:00 JST（${publishIso}）`);
    console.log('   管理画面で内容と表紙表示を確認してください');
  } else {
    console.log(`✓ 下書きは作成しました（id: ${id}）`);
    console.log('✗ ただし予約公開の設定に失敗しました（即時公開はしていません）:');
    if (reserved.status) console.log(`   HTTP ${reserved.status} ${reserved.statusText || ''}`);
    if (reserved.body) console.log(`   ${reserved.body}`);
    if (reserved.detail) console.log(`   ${reserved.detail}`);
    console.log('');
    console.log('   → 予約公開を完了するには、次のいずれか:');
    console.log('      A) APIキーに「コンテンツのスケジュール設定を変更」権限を付与し、');
    console.log(`         管理画面で下書き id: ${id} を削除してから再実行`);
    console.log(`      B) 管理画面で下書き id: ${id} を開き、`);
    console.log(`         公開予約日時を ${formatJa(publishDateStr)} 09:00 に手動設定`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`予期しないエラー: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
