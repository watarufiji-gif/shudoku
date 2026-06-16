(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var filterBtns = document.querySelectorAll('.archive-filter-btn');
    var cards      = document.querySelectorAll('.archive-card[data-category]');
    var countEl    = document.getElementById('archive-count');

    function applyFilter(category) {
      var visible = 0;
      cards.forEach(function (card) {
        var show = category === 'all' || card.dataset.category === category;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      if (countEl) countEl.textContent = visible + '冊';
    }

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyFilter(btn.dataset.category);
      });
    });

    // 初期表示
    applyFilter('all');
  });
})();
