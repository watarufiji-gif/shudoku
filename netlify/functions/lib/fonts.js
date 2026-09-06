'use strict';

const fs = require('fs');
const path = require('path');

// Netlify Functions バンドル時に assets/fonts/ を included_files で含めているため、
// __dirname からの相対パスで読み込める（netlify.toml 参照）。
const FONT_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');

let cached = null;

function loadFonts() {
  if (cached) return cached;
  const bold = fs.readFileSync(path.join(FONT_DIR, 'NotoSansJP-Bold.ttf'));
  const regular = fs.readFileSync(path.join(FONT_DIR, 'NotoSansJP-Regular.ttf'));
  cached = [
    { name: 'NotoSansJP', data: regular, weight: 400, style: 'normal' },
    { name: 'NotoSansJP', data: bold, weight: 700, style: 'normal' },
  ];
  return cached;
}

module.exports = { loadFonts };
