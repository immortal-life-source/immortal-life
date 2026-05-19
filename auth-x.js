(function () {
  'use strict';

  var FN = window.IL_FN_BASE + '/auth-x-callback';
  var msg = document.getElementById('axMsg');

  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');
  var state = params.get('state');
  var verifier = sessionStorage.getItem('oauth_code_verifier');

  if (!code || !state) {
    window.location.replace('/join?error=no_code');
    return;
  }

  fetch(FN, {
    method: 'POST',
    headers: window.ilFnHeaders(),
    body: JSON.stringify({
      code: code,
      state: state,
      code_verifier: verifier || '',
    }),
  })
    .then(function (r) {
      return r.json().catch(function () {
        return { ok: false };
      });
    })
    .then(function (data) {
      if (data && data.ok === true && data.session) {
        sessionStorage.setItem('il_session', data.session);
        sessionStorage.removeItem('oauth_code_verifier');
        sessionStorage.removeItem('oauth_invite_code');
        window.location.replace('/dashboard');
        return;
      }
      if (msg) msg.textContent = 'Something went wrong. Redirecting…';
      window.location.replace('/join?error=auth_failed');
    })
    .catch(function () {
      if (msg) msg.textContent = 'Something went wrong. Redirecting…';
      window.location.replace('/join?error=auth_failed');
    });
})();
