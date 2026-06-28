(function () {
  'use strict';

  var CHARS_PER_PAGE = 130;

  var singlePages  = [];
  var currentSpread = 0;
  var isOpen = false;
  var isMobile = false;

  var overlay, closeBtn, spreadEl,
      rightSlot, leftSlot, leftPageEl,
      prevBtn, nextBtn, indicator,
      bookBodyEl;

  // ── 起動 ────────────────────────────────────────────────────────────────────

  function init() {
    updateMobile();
    window.addEventListener('resize', updateMobile);

    // 詳細ページ用：<script type="application/json" id="book-reader-data"> から読み込む
    var dataEl = document.getElementById('book-reader-data');
    if (dataEl) {
      var data;
      try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
      singlePages = splitIntoPages((data.text || '').trim(), CHARS_PER_PAGE);
      singlePages.push({ cta: true, title: data.title || '', author: data.author || '', amazonUrl: data.amazonUrl || '' });
      wireTrigger();  // 詳細ページのクリックトリガーを登録
    }

    // オーバーレイ DOM を準備（詳細ページ・トップページ共通）
    if (!initOverlay()) return;

    // 詳細ページは初期スプレッドも描画する
    if (singlePages.length > 0) {
      renderSpread(0);
    }
  }

  // 詳細ページ用：静的 HTML の .book-cover.is-reader-trigger にクリックを登録
  function wireTrigger() {
    var trigger = document.querySelector('.book-cover.is-reader-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', openReader);
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(); }
    });
  }

  // オーバーレイの DOM 参照を取得し、ボタン等のイベントを登録
  function initOverlay() {
    overlay    = document.getElementById('book-reader-overlay');
    if (!overlay) return false;
    closeBtn   = document.getElementById('book-reader-close');
    spreadEl   = document.getElementById('book-spread');
    bookBodyEl = document.querySelector('.book-body');
    rightSlot  = document.getElementById('book-page-right-text');
    leftSlot   = document.getElementById('book-page-left-text');
    leftPageEl = document.querySelector('.book-page-left');
    prevBtn    = document.getElementById('book-nav-prev');
    nextBtn    = document.getElementById('book-nav-next');
    indicator  = document.getElementById('book-spread-indicator');
    if (!spreadEl) return false;

    closeBtn && closeBtn.addEventListener('click', closeReader);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeReader(); });
    prevBtn && prevBtn.addEventListener('click', function () { goToSpread(currentSpread - 1); });
    nextBtn && nextBtn.addEventListener('click', function () { goToSpread(currentSpread + 1); });
    document.addEventListener('keydown', handleKeydown);
    setupSwipe(spreadEl);
    return true;
  }

  // ── テキスト分割 ─────────────────────────────────────────────────────────────

  function splitIntoPages(text, max) {
    if (!text) return [];
    var result = [];
    var paras = text.split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var current = '';

    for (var i = 0; i < paras.length; i++) {
      var para = paras[i];
      if (current && (current.length + para.length + 1) > max) {
        result.push(current.trim());
        current = '';
      }
      if (para.length > max) {
        if (current) { result.push(current.trim()); current = ''; }
        var remaining = para;
        while (remaining.length > max) {
          var breakAt = max;
          for (var j = max - 1; j >= max - 40 && j >= 0; j--) {
            if ('。！？、'.indexOf(remaining[j]) !== -1) { breakAt = j + 1; break; }
          }
          result.push(remaining.slice(0, breakAt));
          remaining = remaining.slice(breakAt);
        }
        if (remaining) current = remaining;
      } else {
        current += (current ? '\n' : '') + para;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  // ── 見開きレンダリング ───────────────────────────────────────────────────────

  function updateMobile() {
    isMobile = window.innerWidth <= 640;
  }

  function totalSpreads() {
    return isMobile ? singlePages.length : Math.ceil(singlePages.length / 2);
  }

  function renderSpread(spreadIdx) {
    if (isMobile) {
      fillSlot(rightSlot, singlePages[spreadIdx]);
    } else {
      var ri = spreadIdx * 2;
      var li = spreadIdx * 2 + 1;
      // DOMの並びは [book-page-right=画面左] | gutter | [book-page-left=画面右]
      // 和書は右→左へ読むため、先のチャンク(ri)を画面右(leftSlot)、後(li)を画面左(rightSlot)に入れる
      fillSlot(leftSlot,  singlePages[ri]);
      fillSlot(rightSlot, singlePages[li] !== undefined ? singlePages[li] : null);
    }
    updateNav();
  }

  function fillSlot(el, pageData) {
    if (!el) return;
    el.innerHTML = '';
    el.className = '';

    if (!pageData) return;

    if (pageData.cta) {
      el.className = 'book-page-cta';
      var tagline = document.createElement('p');
      tagline.className = 'book-cta-tagline';
      tagline.innerHTML = '続きは、この一冊で。<em>' +
        escHtml(pageData.title) + '　' + escHtml(pageData.author) + '</em>';
      el.appendChild(tagline);
      if (pageData.amazonUrl) {
        var link = document.createElement('a');
        link.href = pageData.amazonUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn btn-amazon';
        link.style.textDecoration = 'none';
        link.innerHTML = '<span class="btn-text">Amazonで見る</span>';
        el.appendChild(link);
      }
    } else {
      el.className = 'book-page-text';
      el.textContent = pageData;
    }
  }

  function goToSpread(n) {
    var total = totalSpreads();
    if (n < 0 || n >= total || n === currentSpread) return;
    var target = n;
    spreadEl.classList.add('is-turning');
    setTimeout(function () {
      currentSpread = target;
      renderSpread(currentSpread);
      spreadEl.classList.remove('is-turning');
    }, 220);
  }

  function updateNav() {
    var total = totalSpreads();
    if (prevBtn)   prevBtn.disabled   = currentSpread === 0;
    if (nextBtn)   nextBtn.disabled   = currentSpread === total - 1;
    if (indicator) indicator.textContent = (currentSpread + 1) + ' / ' + total;
  }

  // ── 開閉 ────────────────────────────────────────────────────────────────────

  function openReader() {
    if (isOpen) return;
    isOpen = true;
    currentSpread = 0;
    renderSpread(0);

    if (bookBodyEl) bookBodyEl.classList.remove('is-cover-open');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    setTimeout(function () {
      if (bookBodyEl) bookBodyEl.classList.add('is-cover-open');
    }, 150);

    if (closeBtn) closeBtn.focus();

    try { showSwipeHint(); } catch (e) { /* ヒント失敗でもリーダーは動作継続 */ }
  }

  function showSwipeHint() {
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
    if (!overlay) return;
    var hint = document.createElement('div');
    hint.className = 'book-swipe-hint';
    hint.textContent = 'スワイプでもめくれます';
    overlay.appendChild(hint);
    setTimeout(function () {
      hint.classList.add('is-fading');
      setTimeout(function () {
        if (hint.parentNode) hint.parentNode.removeChild(hint);
      }, 600);
    }, 2000);
  }

  function closeReader() {
    if (!isOpen) return;
    if (bookBodyEl) bookBodyEl.classList.remove('is-cover-open');
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    isOpen = false;
  }

  function handleKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape')                               { e.preventDefault(); closeReader(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToSpread(currentSpread + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goToSpread(currentSpread - 1); }
  }

  function setupSwipe(el) {
    if (!el) return;
    var startX = 0, startY = 0;
    el.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) return;
      if (Math.abs(dx) < 30) return;
      if (dx > 0) goToSpread(currentSpread + 1);
      else        goToSpread(currentSpread - 1);
    }, { passive: true });
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 外部 API（トップページの script.js から呼ぶ） ───────────────────────────
  // ガード：本文が空またはオーバーレイ未準備の場合は何もしない

  window.bookReader = {
    open: function (data) {
      if (!data || !(data.text || '').trim()) return;
      if (!overlay || !spreadEl) return;

      singlePages = splitIntoPages(data.text.trim(), CHARS_PER_PAGE);
      singlePages.push({ cta: true, title: data.title || '', author: data.author || '', amazonUrl: data.amazonUrl || '' });

      // トップページの表紙タイトルを動的に更新（要素がなければ無視）
      var frontTitle = document.getElementById('home-front-cover-title');
      if (frontTitle) frontTitle.textContent = data.title || '';

      openReader();
    }
  };

  // ── 起動 ────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
