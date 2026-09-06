'use strict';

/**
 * URL（ブログ/商品ページ/YouTube動画）→ 市場調査 → カルーセル企画（スライド・キャプション・
 * ハッシュタグ）までを行うパイプライン。
 * Python版CLIツール（fetch_source.py / research.py / generate_copy.py）のNode移植版。
 */

const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');
const Anthropic = require('@anthropic-ai/sdk');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const YOUTUBE_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/;

function isYoutubeUrl(url) {
  return YOUTUBE_RE.test(url);
}

function extractYoutubeId(url) {
  const m = url.match(YOUTUBE_RE);
  if (!m) throw new Error(`YouTube動画IDを抽出できませんでした: ${url}`);
  return m[1];
}

async function fetchYoutube(url) {
  const videoId = extractYoutubeId(url);

  let title = '';
  let author = '';
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (res.ok) {
      const data = await res.json();
      title = data.title || '';
      author = data.author_name || '';
    }
  } catch (_) {
    // タイトル取得に失敗しても続行
  }

  let body = '';
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ja' }).catch(() =>
      YoutubeTranscript.fetchTranscript(videoId)
    );
    body = transcript.map((seg) => seg.text).join(' ').slice(0, 6000);
  } catch (e) {
    console.warn('[content-pipeline] 文字起こし取得に失敗:', e.message);
  }

  return { sourceType: 'youtube', url, title, author, body };
}

async function fetchWebpage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`ページの取得に失敗しました (HTTP ${res.status}): ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  let title = $('title').first().text().trim();
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) title = ogTitle.trim();

  let description = $('meta[name="description"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc) description = ogDesc;

  $('script, style, nav, footer, header, noscript, svg').remove();
  const main = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  const text = main
    .text()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

  const body = `${description}\n${text}`.slice(0, 6000);

  return { sourceType: 'webpage', url, title, description, body };
}

async function fetchSource(url) {
  if (isYoutubeUrl(url)) return fetchYoutube(url);
  return fetchWebpage(url);
}

// ── 市場調査（Web検索ツール） ────────────────────────────────────────────

const RESEARCH_PROMPT = ({ title, body }) => `あなたはSNSマーケティングの専門リサーチャーです。
以下の情報源をもとに、Instagram投稿の企画に役立つ市場調査・競合分析を行ってください。

# 情報源
タイトル: ${title || '(不明)'}
本文抜粋:
${body.slice(0, 3000)}

# 調査してほしいこと（Web検索を積極的に使ってください）
1. このテーマ・ジャンルにおけるターゲット層（年齢層・悩み・興味関心）
2. 同ジャンルでInstagram運用がうまくいっているアカウント／投稿の傾向（構成・トンマナ・フック文言など）
3. このテーマで読者・視聴者が最も反応しそうな切り口（数字・悩み解決・意外性など）
4. 避けるべきありきたりな表現・使い古された切り口

# 出力形式
上記4点について、それぞれ箇条書きで簡潔にまとめてください（合計400〜600字程度）。
Web検索の結果に基づく具体的な根拠を含めてください。`;

async function researchMarket(client, model, title, body) {
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: RESEARCH_PROMPT({ title, body }) }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// ── カルーセル企画生成（構造化出力） ────────────────────────────────────────

const CAROUSEL_TOOL = {
  name: 'emit_carousel_plan',
  description: 'Instagramカルーセル投稿の企画案を出力する。',
  input_schema: {
    type: 'object',
    properties: {
      slides: {
        type: 'array',
        description: 'カルーセルの各スライド内容。1枚目=フック、最終枚=CTA。',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            role: { type: 'string', enum: ['hook', 'point', 'cta'] },
            headline: { type: 'string', description: '全角20〜28字程度、改行含めてよい' },
            subtext: { type: 'string', description: '任意、全角30字程度まで' },
          },
          required: ['index', 'role', 'headline'],
        },
      },
      caption: { type: 'string', description: '投稿本文キャプション。300〜500字程度。' },
      hashtags: {
        type: 'array',
        description: '#なしのハッシュタグ。25個程度。',
        items: { type: 'string' },
      },
    },
    required: ['slides', 'caption', 'hashtags'],
  },
};

const GENERATION_PROMPT = ({ title, body, research, numSlides }) => `あなたは登録者・売上に直結するInstagramカルーセル投稿を量産してきた
敏腕SNSマーケター件コピーライターです。

# 元ネタ（情報源）
タイトル: ${title || '(不明)'}
本文抜粋:
${body.slice(0, 4000)}

# 市場調査・競合分析結果
${research || '(調査結果なし)'}

# 依頼内容
上記をもとに、Instagramのカルーセル投稿（画像${numSlides}枚）を企画してください。

## スライド構成のルール
- 1枚目（hook）: 思わず止まってしまう強いフック（数字・意外性・悩みへの共感など）
- 2〜${numSlides - 1}枚目（point）: 元ネタの内容を、読者が「保存したくなる」ノウハウ・情報として
  1スライド1メッセージで噛み砕いて構成する
- ${numSlides}枚目（cta）: 保存・フォロー・プロフィールのリンクへの誘導を促す一文
- 見出し（headline）は日本語として自然で、フォントで大きく表示しても読みやすい長さにする
- 調査結果で分かった「刺さる切り口」「避けるべき表現」を必ず反映する

## キャプション・ハッシュタグのルール
- キャプションはスライドの内容を補足しつつ、最初の1〜2行で読者の興味を引く
- ハッシュタグはジャンルのビッグキーワード・ミドルキーワード・ニッチキーワードを混在させる

emit_carousel_plan ツールを呼び出して結果を出力してください。`;

async function generateCarouselPlan(client, model, title, body, research, numSlides = 10) {
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: GENERATION_PROMPT({ title, body, research, numSlides }) }],
    tools: [CAROUSEL_TOOL],
    tool_choice: { type: 'tool', name: 'emit_carousel_plan' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_carousel_plan');
  if (!toolUse) throw new Error('カルーセル企画のツール呼び出し結果を取得できませんでした。');
  return toolUse.input;
}

module.exports = {
  isYoutubeUrl,
  fetchSource,
  researchMarket,
  generateCarouselPlan,
  Anthropic,
};
