(function () {
  'use strict';

  var FN = window.IL_FN_BASE + '/auth-linkedin-callback';
  var msg = document.getElementById('linkedinAuthMsg');
  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');
  var state = params.get('state');
  var providerError = params.get('error');
  var expectedState = sessionStorage.getItem('linkedin_oauth_state');
  var inviteCode = sessionStorage.getItem('linkedin_oauth_invite_code');

  function clearAttempt() {
    sessionStorage.removeItem('linkedin_oauth_state');
    sessionStorage.removeItem('linkedin_oauth_invite_code');
    sessionStorage.removeItem('linkedin_oauth_mode');
  }

  function fail(error) {
    clearAttempt();
    if (msg) msg.textContent = 'Could not complete LinkedIn login. Redirecting…';
    window.location.replace('/join?error=' + encodeURIComponent(error || 'auth_failed'));
  }

  if (providerError) { fail('provider_cancelled'); return; }
  if (!code || !state || !expectedState) { fail('invalid_state'); return; }

  fetch(FN, {
    method: 'POST',
    headers: window.ilFnHeaders(),
    body: JSON.stringify({ code: code, state: state, expected_state: expectedState, invite_code: inviteCode || '' }),
  })
    .then(function (response) { return response.json().catch(function () { return { ok: false }; }); })
    .then(function (data) {
      if (data && data.ok === true && data.session) {
        sessionStorage.setItem('il_session', data.session);
        clearAttempt();
        window.location.replace('/dashboard');
        return;
      }
      fail(data.error || 'auth_failed');
    })
    .catch(function () { fail('auth_failed'); });
})();
