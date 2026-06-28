(function () {
  'use strict';
  var toggle = document.getElementById('nav-menu-toggle');
  var menu   = document.getElementById('nav-menu');
  if (!toggle || !menu) return;

  function openMenu() {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'メニューを閉じる');
  }

  function closeMenu() {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'メニューを開く');
  }

  toggle.addEventListener('click', function () {
    if (menu.classList.contains('is-open')) { closeMenu(); } else { openMenu(); }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#nav-menu') && !e.target.closest('#nav-menu-toggle')) {
      closeMenu();
    }
  });

  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
})();
