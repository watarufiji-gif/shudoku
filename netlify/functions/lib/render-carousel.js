'use strict';

/**
 * Instagramカルーセル画像（10枚）をサーバーサイドでレンダリングするモジュール。
 * satori（レイアウト→SVG）+ @resvg/resvg-js（SVG→PNG）+ sharp（PNG→JPEG）の組み合わせ。
 * 外部の画像生成AIは使わず、ブランドテンプレートにテキストを流し込むだけ。
 *
 * config.yaml 相当のブランド設定はここでは BRAND 定数として保持する。
 * 週読サイトの管理ダッシュボード（admin.html）と同じ配色を踏襲。
 */

const satoriModule = require('satori');
const satori = satoriModule.default || satoriModule;
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');
const fontkit = require('fontkit');
const path = require('path');
const { loadFonts } = require('./fonts');

const WIDTH = 1080;
const HEIGHT = 1350; // 4:5 比率（Instagramフィードで最も表示面積が大きい）
const MARGIN = 96;

const BRAND = {
  name: '週読',
  handle: '@shudoku_jp', // 実際のIDが決まったら書き換えてください
  background: '#F6F5F1',
  text: '#2C2824',
  muted: '#8A847C',
  accent: '#8B7355',
  gold: '#C9A962',
  border: '#E0DCD5',
  ctaBackground: '#8B7355',
  ctaText: '#F6F5F1',
};

const FONT_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'fonts');
let _fontkitCache = null;
function getFontkitFonts() {
  if (_fontkitCache) return _fontkitCache;
  _fontkitCache = {
    bold: fontkit.openSync(path.join(FONT_DIR, 'NotoSansJP-Bold.ttf')),
    regular: fontkit.openSync(path.join(FONT_DIR, 'NotoSansJP-Regular.ttf')),
  };
  return _fontkitCache;
}

function measureWidth(text, fontkitFont, fontSize) {
  if (!text) return 0;
  const run = fontkitFont.layout(text);
  return (run.advanceWidth / fontkitFont.unitsPerEm) * fontSize;
}

/** 日本語向け：文字単位で折り返す（改行コードは尊重する）。Pythonの_wrap_textと同等ロジック。 */
function wrapText(text, fontkitFont, fontSize, maxWidth) {
  const lines = [];
  for (const rawLine of String(text).split('\n')) {
    if (rawLine === '') { lines.push(''); continue; }
    let current = '';
    for (const ch of rawLine) {
      const trial = current + ch;
      if (measureWidth(trial, fontkitFont, fontSize) > maxWidth && current) {
        lines.push(current);
        current = ch;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** 行数が収まるまでフォントサイズを段階的に縮小し、折り返し済みテキストを返す。 */
function fitText(text, weight, startSize, minSize, maxWidth, maxLines) {
  const { bold, regular } = getFontkitFonts();
  const fontkitFont = weight === 700 ? bold : regular;
  let size = startSize;
  let lines = wrapText(text, fontkitFont, size, maxWidth);
  while (lines.length > maxLines && size > minSize) {
    size -= 4;
    lines = wrapText(text, fontkitFont, size, maxWidth);
  }
  return { text: lines.join('\n'), fontSize: size };
}

function footer(index, total, showBrand = true, color = BRAND.muted) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 26, color,
      },
      children: [
        { type: 'div', props: { children: `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}` } },
        showBrand ? { type: 'div', props: { children: BRAND.name } } : { type: 'div', props: { children: '' } },
      ],
    },
  };
}

function hookSlide(slide, total) {
  const maxWidth = WIDTH - MARGIN * 2;
  const headline = fitText(slide.headline, 700, 80, 44, maxWidth, 5);
  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
        backgroundColor: BRAND.background, padding: MARGIN, fontFamily: 'NotoSansJP',
      },
      children: [
        { type: 'div', props: { style: { width: 90, height: 8, backgroundColor: BRAND.gold } } },
        {
          type: 'div',
          props: {
            style: {
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', textAlign: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: headline.fontSize, fontWeight: 700, color: BRAND.text,
                    lineHeight: 1.35, whiteSpace: 'pre-wrap',
                  },
                  children: headline.text,
                },
              },
              slide.subtext
                ? {
                    type: 'div',
                    props: {
                      style: { fontSize: 32, color: BRAND.muted, marginTop: 28, whiteSpace: 'pre-wrap' },
                      children: fitText(slide.subtext, 400, 32, 24, maxWidth, 3).text,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            children: [
              { type: 'div', props: { style: { fontSize: 26, color: BRAND.muted }, children: `01 / ${total}` } },
              { type: 'div', props: { style: { fontSize: 26, color: BRAND.accent }, children: 'スワイプ →' } },
            ],
          },
        },
      ],
    },
  };
}

function pointSlide(slide, total) {
  const maxWidth = WIDTH - MARGIN * 2;
  const headline = fitText(slide.headline, 700, 60, 36, maxWidth, 6);
  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
        backgroundColor: BRAND.background, padding: MARGIN, fontFamily: 'NotoSansJP',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              { type: 'div', props: { style: { fontSize: 30, fontWeight: 700, color: BRAND.accent }, children: `POINT ${slide.index - 1}` } },
              { type: 'div', props: { style: { width: 60, height: 6, backgroundColor: BRAND.gold, marginTop: 12 } } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', textAlign: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: headline.fontSize, fontWeight: 700, color: BRAND.text,
                    lineHeight: 1.4, whiteSpace: 'pre-wrap',
                  },
                  children: headline.text,
                },
              },
              slide.subtext
                ? {
                    type: 'div',
                    props: {
                      style: { fontSize: 30, color: BRAND.muted, marginTop: 26, whiteSpace: 'pre-wrap' },
                      children: fitText(slide.subtext, 400, 30, 22, maxWidth, 3).text,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        footer(slide.index, total),
      ],
    },
  };
}

function ctaSlide(slide, total) {
  const maxWidth = WIDTH - MARGIN * 2;
  const headline = fitText(slide.headline, 700, 66, 40, maxWidth, 5);
  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column',
        backgroundColor: BRAND.ctaBackground, padding: MARGIN, fontFamily: 'NotoSansJP',
      },
      children: [
        { type: 'div', props: { style: { flex: 0.4 } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: headline.fontSize, fontWeight: 700, color: BRAND.ctaText,
                    lineHeight: 1.35, whiteSpace: 'pre-wrap',
                  },
                  children: headline.text,
                },
              },
              slide.subtext
                ? {
                    type: 'div',
                    props: {
                      style: { fontSize: 32, color: BRAND.ctaText, opacity: 0.85, marginTop: 28, whiteSpace: 'pre-wrap' },
                      children: fitText(slide.subtext, 400, 32, 24, maxWidth, 3).text,
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        { type: 'div', props: { style: { flex: 1 } } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
            children: [
              { type: 'div', props: { style: { fontSize: 30, fontWeight: 700, color: BRAND.ctaText }, children: BRAND.handle } },
            ],
          },
        },
        footer(slide.index, total, false, BRAND.ctaText),
      ],
    },
  };
}

function buildSlideElement(slide, total) {
  if (slide.role === 'hook') return hookSlide(slide, total);
  if (slide.role === 'cta') return ctaSlide(slide, total);
  return pointSlide(slide, total);
}

/**
 * slides: [{ index, role: 'hook'|'point'|'cta', headline, subtext }]
 * 戻り値: JPEGバッファの配列（indexの昇順）
 */
async function renderCarousel(slides) {
  const fonts = loadFonts();
  const sorted = [...slides].sort((a, b) => a.index - b.index);
  const total = sorted.length;

  const buffers = [];
  for (const slide of sorted) {
    const el = buildSlideElement(slide, total);
    const svg = await satori(el, { width: WIDTH, height: HEIGHT, fonts });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
    const png = resvg.render().asPng();
    const jpeg = await sharp(png).jpeg({ quality: 92 }).toBuffer();
    buffers.push({ index: slide.index, buffer: jpeg });
  }
  return buffers;
}

module.exports = { renderCarousel, WIDTH, HEIGHT, BRAND };
