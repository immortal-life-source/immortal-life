(function () {
  'use strict';

  var FN = window.IL_FN_BASE + '/auth-x-callback';
  var msg = document.getElementById('axMsg');

  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');
  var state = params.get('state');
  var verifier = sessionStorage.getItem('oauth_code_verifier');
  var expectedState = sessionStorage.getItem('oauth_state');
  var inviteCode = sessionStorage.getItem('oauth_invite_code');

  function clearOAuthAttempt() {
    sessionStorage.removeItem('oauth_code_verifier');
    sessionStorage.removeItem('oauth_invite_code');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_mode');
  }

  if (!code || !state || !verifier || !expectedState) {
    clearOAuthAttempt();
    window.location.replace('/topics');
    return;
  }

  fetch(FN, {
    method: 'POST',
    headers: window.ilFnHeaders(),
    body: JSON.stringify({
      code: code,
      state: state,
      expected_state: expectedState,
      code_verifier: verifier,
      invite_code: inviteCode || '',
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
        clearOAuthAttempt();
        window.location.replace('/topics');
        return;
      }
      clearOAuthAttempt();
      if (msg) msg.textContent = 'Something went wrong. Redirecting…';
      window.location.replace('/topics');
    })
    .catch(function () {
      clearOAuthAttempt();
      if (msg) msg.textContent = 'Something went wrong. Redirecting…';
      window.location.replace('/topics');
    });
})();
