'use strict';

/**
 * budoux による日本語文節分割 + HTMLエスケープ + <wbr> 挿入の共通ロジック。
 * scripts/generate-pages.js（詳細ページ）と netlify/functions/send-weekly.js
 * （週次メール）の両方から読み込んで使う。重複実装を避けるための共通モジュール。
 */

const { loadDefaultJapaneseParser } = require('budoux');

// budoux 日本語パーサ（呼び出し元の実行タイミングでのみ使用。実行時ブラウザJSやCSPには影響しない）
const budouxParser = loadDefaultJapaneseParser();

// 行頭に来ると不自然な文字（禁則）。この文字で始まる文節の直前には <wbr> を入れない。
// 小書き仮名（拗音・促音）、長音記号、閉じ括弧類、句読点など。
const NO_LINE_START = /^[ぁぃぅぇぉゃゅょっゎゕゖァィゥェォャュョッヮヵヶー」』）】〉》〕｝、。，．・：；！？]/;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 日本語テキストを budoux で文節分割し、各文節を esc() でエスケープしてから
 * <wbr>（ゼロ幅の改行候補）で連結する。
 *   1. 生テキストを budoux.parse() で文節分割（分割は生テキストにのみ行う）
 *   2. 文節ごとに esc() でHTMLエスケープ
 *   3. エスケープ済み文節を <wbr> で連結（<wbr> はエスケープしない）
 * → 実体参照の内部に <wbr> が入らず、二重エスケープも起きない。
 *   <wbr> は幅に収まる間は無視され、折り返し時のみ文節境界で改行させる。
 *
 * 禁則: 文節が小書き仮名・長音記号・閉じ括弧・句読点など「行頭に来ると不自然な
 * 文字」で始まる場合は、その直前の <wbr> を省いて前の文節と地続きにする
 * （budouxの分節が「おかし|ゅうなる」のように割れても、行頭に「ゅ」が来ない）。
 */
function escWithWbr(str) {
  const text = String(str || '');
  if (!text) return '';
  const segments = budouxParser.parse(text);
  let out = '';
  for (let i = 0; i < segments.length; i++) {
    if (i > 0 && !NO_LINE_START.test(segments[i])) out += '<wbr>';
    out += esc(segments[i]);
  }
  return out;
}

module.exports = { esc, escWithWbr };
