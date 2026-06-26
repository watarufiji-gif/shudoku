(function () {
  'use strict';

  // 1ページあたりの文字数（右ページ or 左ページ、各々独立）
  var CHARS_PER_PAGE = 130;

  var singlePages  = [];  // テキスト1ページ単位の配列（末尾にCTAオブジェクト）
  var currentSpread = 0;
  var isOpen = false;
  var isMobile = false;

  var overlay, closeBtn, spreadEl,
      rightSlot, leftSlot, leftPageEl,
      prevBtn, nextBtn, indicator,
      bookBodyEl;

  function init() {
    var dataEl = document.getElementById('book-reader-data');
    if (!dataEl) return;

    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

    singlePages = splitIntoPages((data.text || '').trim(), CHARS_PER_PAGE);
    singlePages.push({ cta: true, title: data.title || '', author: data.author || '', amazonUrl: data.amazonUrl || '' });

    updateMobile();
    window.addEventListener('resize', updateMobile);

    var trigger = document.querySelector('.book-cover.is-reader-trigger');
    if (trigger) {
      trigger.addEventListener('click', openReader);
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(); }
      });
    }

    overlay    = document.getElementById('book-reader-overlay');
    closeBtn   = document.getElementById('book-reader-close');
    spreadEl   = document.getElementById('book-spread');
    bookBodyEl = document.querySelector('.book-body');
    rightSlot  = document.getElementById('book-page-right-text');
    leftSlot   = document.getElementById('book-page-left-text');
    leftPageEl = document.querySelector('.book-page-left');
    prevBtn    = document.getElementById('book-nav-prev');
    nextBtn    = document.getElementById('book-nav-next');
    indicator  = document.getElementById('book-spread-indicator');

    if (!overlay || !spreadEl) return;

    renderSpread(0);

    closeBtn && closeBtn.addEventListener('click', closeReader);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeReader(); });
    prevBtn && prevBtn.addEventListener('click', function () { goToSpread(currentSpread - 1); });
    nextBtn && nextBtn.addEventListener('click', function () { goToSpread(currentSpread + 1); });
    document.addEventListener('keydown', handleKeydown);
    setupSwipe(spreadEl);
  }

  function updateMobile() {
    isMobile = window.innerWidth <= 640;
  }

  // テキストを1ページ単位に分割
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

  function totalSpreads() {
    // モバイルは1ページ=1見開き、デスクトップは2ページ=1見開き
    return isMobile ? singlePages.length : Math.ceil(singlePages.length / 2);
  }

  function renderSpread(spreadIdx) {
    if (isMobile) {
      // モバイル：右スロットのみ
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

  // スロット要素にコンテンツをセット（クラスを直接付与して height:100% が効くようにする）
  function fillSlot(el, pageData) {
    if (!el) return;
    el.innerHTML = '';
    el.className = '';

    if (!pageData) {
      // 空ページ（テキストが奇数ページで終わったときの左ページなど）
      return;
    }

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
        link.innerHTML = '<span class="btn-icon">📦</span><span class="btn-text">Amazonで見る</span>';
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

  function openReader() {
    if (isOpen) return;
    isOpen = true;
    currentSpread = 0;
    renderSpread(0);

    // 表紙を閉じた状態にリセットしてからオーバーレイを表示
    if (bookBodyEl) bookBodyEl.classList.remove('is-cover-open');

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    // book-body のフェードイン（~120ms）が落ち着いてから表紙を開く
    setTimeout(function () {
      if (bookBodyEl) bookBodyEl.classList.add('is-cover-open');
    }, 150);

    if (closeBtn) closeBtn.focus();
  }

  function closeReader() {
    if (!isOpen) return;
    // 表紙を閉じた状態に戻してからオーバーレイを消す
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
      if (dx < 0) goToSpread(currentSpread + 1);
      else         goToSpread(currentSpread - 1);
    }, { passive: true });
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
