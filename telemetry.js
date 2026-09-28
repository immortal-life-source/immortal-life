'use strict';

(function immortalLifeUtilityTelemetry() {
  var sentOnce = new Set();
  var filterTimer = 0;

  function send(eventName) {
    if (!window.IL_FN_BASE || !window.ilFnHeaders) return;
    fetch(window.IL_FN_BASE + '/record-utility-event', {
      method: 'POST',
      headers: window.ilFnHeaders(),
      keepalive: true,
      body: JSON.stringify({ event: eventName, path: window.location.pathname }),
    }).catch(function () {});
  }

  function sendOnce(eventName) {
    if (sentOnce.has(eventName)) return;
    sentOnce.add(eventName);
    send(eventName);
  }

  // One aggregate counter per document load. No visitor identifier, cookie,
  // referrer, query string, search text, or browser fingerprint is sent.
  sendOnce('page_view');
  if (document.body?.dataset?.view === 'topic') sendOnce('dossier_opened');

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-il-event]') : null;
    if (target) send(target.getAttribute('data-il-event'));
  });

  document.addEventListener('submit', function (event) {
    if (event.target instanceof HTMLFormElement && event.target.matches('form[role="search"]')) send('site_search');
  });

  document.addEventListener('change', function (event) {
    if (!(event.target instanceof HTMLSelectElement)) return;
    if (!event.target.closest('form[role="search"]')) return;
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(function () { send('filter_used'); }, 400);
  });

  window.ilTrackUtility = send;
})();
