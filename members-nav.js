(function () {
  'use strict';

  var toggles = document.querySelectorAll('[data-member-nav-toggle]');
  toggles.forEach(function (toggle) {
    var targetId = toggle.getAttribute('aria-controls');
    var nav = targetId ? document.getElementById(targetId) : null;
    if (!nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.dataset.open = String(open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
  });
})();
