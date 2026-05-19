(function () {
  'use strict';

  var X_CLIENT_ID = 'YV9iTTY1WnB0OVFHY25kaTFZVXo6MTpjaQ';
  var REDIRECT = 'https://immortal.life/auth/x';
  var FN = window.IL_FN_BASE + '/validate-invite';

  function base64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomVerifier(len) {
    var chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    var arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    var out = '';
    for (var i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  function pkceChallenge(verifier) {
    return crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(verifier))
      .then(base64url);
  }

  var input = document.getElementById('inviteInput');
  var btnContinue = document.getElementById('btnContinue');
  var errEl = document.getElementById('inviteError');
  var successWrap = document.getElementById('successWrap');
  var formCard = document.getElementById('formCard');

  var inviteValidated = false;

  function startXOAuth() {
    var code = normalizeCode(input.value);
    if (!code) return;

    var verifier = randomVerifier(64);
    pkceChallenge(verifier).then(function (challenge) {
      sessionStorage.setItem('oauth_code_verifier', verifier);
      sessionStorage.setItem('oauth_invite_code', code);

      var stateObj = { invite_code: code, code_verifier: verifier };
      var stateB64 = btoa(JSON.stringify(stateObj));

      var url =
        'https://x.com/i/oauth2/authorize?response_type=code' +
        '&client_id=' +
        encodeURIComponent(X_CLIENT_ID) +
        '&redirect_uri=' +
        encodeURIComponent(REDIRECT) +
        '&scope=' +
        encodeURIComponent('users.read tweet.read offline.access') +
        '&state=' +
        encodeURIComponent(stateB64) +
        '&code_challenge=' +
        encodeURIComponent(challenge) +
        '&code_challenge_method=S256';

      window.location.href = url;
    });
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    input.classList.add('invite-input-error');
  }

  function clearError() {
    errEl.hidden = true;
    errEl.textContent = '';
    input.classList.remove('invite-input-error');
  }

  function normalizeCode(v) {
    return String(v || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
  }

  input.addEventListener('input', function () {
    var n = normalizeCode(input.value);
    input.value = n;
    clearError();
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get('code')) {
    input.value = normalizeCode(params.get('code'));
  }
  if (params.get('error') === 'invalid_code') {
    showError('This code is not valid.');
  }

  btnContinue.addEventListener('click', function () {
    if (inviteValidated) {
      startXOAuth();
      return;
    }

    clearError();
    var code = normalizeCode(input.value);
    if (code.length < 1) {
      showError('Enter your invite code.');
      return;
    }

    btnContinue.disabled = true;
    fetch(FN, {
      method: 'POST',
      headers: window.ilFnHeaders(),
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        btnContinue.disabled = false;
        if (data && data.valid === true) {
          inviteValidated = true;
          input.classList.add('invite-input-valid');
          input.readOnly = true;
          successWrap.hidden = false;
          btnContinue.textContent = 'Continue with X →';
          formCard.classList.add('join-card-success');
        } else {
          showError('This code is not valid.');
        }
      })
      .catch(function () {
        btnContinue.disabled = false;
        showError('This code is not valid.');
      });
  });
})();
