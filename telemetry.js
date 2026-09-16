'use strict';

(function immortalLifeUtilityTelemetry() {
  function send(eventName) {
    if (!window.IL_FN_BASE || !window.ilFnHeaders) return;
    fetch(window.IL_FN_BASE + '/record-utility-event', {
      method: 'POST',
      headers: window.ilFnHeaders(),
      keepalive: true,
      body: JSON.stringify({ event: eventName, path: window.location.pathname }),
    }).catch(function () {});
  }

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-il-event]') : null;
    if (target) send(target.getAttribute('data-il-event'));
  });

  window.ilTrackUtility = send;
})();
