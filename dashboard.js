(function () {
  'use strict';

  var SESSION_KEY = 'il_session';
  var FN = window.IL_FN_BASE + '/get-dashboard';

  var ACTION_LABELS = {
    signup: 'Account created',
    invite_signup: 'Someone joined with your invite',
    chain_signup_depth2: 'Network signup (depth 2)',
    chain_signup_depth3: 'Network signup (depth 3)',
  };

  function getSession() {
    return sessionStorage.getItem(SESSION_KEY);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatWhen(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }

  var loading = document.getElementById('dashLoading');
  var root = document.getElementById('dashRoot');
  var session = getSession();

  if (!session) {
    window.location.replace('/join');
    return;
  }

  fetch(FN, {
    method: 'GET',
    headers: Object.assign({}, window.ilFnHeaders(), {
      Authorization: 'Bearer ' + session,
    }),
  })
    .then(function (r) {
      if (r.status === 401 || r.status === 404) {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.replace('/join');
        return Promise.reject();
      }
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.member) return;

      loading.hidden = true;
      root.hidden = false;

      var m = data.member;
      document.getElementById('dashAvatar').src = m.x_avatar_url || '';
      document.getElementById('dashAvatar').alt = '@' + m.x_username;
      document.getElementById('dashDisplay').textContent = m.x_display_name || '';
      document.getElementById('dashUser').textContent = '@' + (m.x_username || '');
      document.getElementById('dashTier').textContent = data.tier || 'Member';
      document.getElementById('dashPoints').textContent = String(m.points ?? 0);
      document.getElementById('dashRank').innerHTML =
        '<a href="/leaderboard">#' +
        esc(data.rank) +
        ' on the leaderboard</a>';
      document.getElementById('dashNetwork').textContent =
        String(m.network_size ?? 0) + ' people in your network';

      var refCode = data.referral_code || '';
      var refUrl = refCode
        ? 'https://immortal.life/invite/' + encodeURIComponent(refCode)
        : 'https://immortal.life/join';
      document.getElementById('dashReferralUrl').textContent = refUrl;

      document.getElementById('btnCopyLink').addEventListener('click', function () {
        navigator.clipboard.writeText(refUrl).then(function () {
          flash(document.getElementById('btnCopyLink'));
        });
      });

      var tweet =
        'I secured my place on immortal.life — join me: immortal.life/invite/' +
        (refCode || '');
      document.getElementById('btnShareX').href =
        'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweet);

      var cp = data.codes_progress || {};
      var issued = cp.issued || 0;
      var entitled = cp.entitled_max || 3;
      var needPts = cp.points_needed_for_next_codes || 0;
      var nextTot = cp.codes_at_next_tier || entitled;
      var deltaCodes = Math.max(0, nextTot - issued);

      var progEl = document.getElementById('dashUnlockText');
      if (needPts > 0 && deltaCodes > 0) {
        progEl.textContent =
          'Earn ' +
          needPts +
          ' more points to unlock ' +
          deltaCodes +
          ' new codes';
        var fillPct = entitled > 0 ? Math.min(100, (issued / entitled) * 100) : 0;
        document.getElementById('dashProgFill').style.width = fillPct + '%';
      } else {
        progEl.textContent = 'You have unlocked all codes at your current milestone.';
        document.getElementById('dashProgFill').style.width = '100%';
      }

      var grid = document.getElementById('dashCodesGrid');
      grid.innerHTML = '';
      (data.invite_codes || []).forEach(function (row) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'dash-chip' + (row.is_used ? ' dash-chip-used' : '');
        chip.textContent = row.code;
        if (row.is_used) {
          chip.disabled = true;
        } else {
          chip.addEventListener('click', function () {
            navigator.clipboard.writeText(row.code).then(function () {
              chip.classList.add('dash-chip-copied');
              chip.textContent = 'Copied ✓';
              setTimeout(function () {
                chip.textContent = row.code;
                chip.classList.remove('dash-chip-copied');
              }, 1600);
            });
          });
        }
        grid.appendChild(chip);
      });

      var logEl = document.getElementById('dashPointsLog');
      logEl.innerHTML = '';
      (data.points_log || []).forEach(function (row) {
        var li = document.createElement('li');
        li.className = 'dash-log-row';
        var label = ACTION_LABELS[row.action] || row.action;
        li.innerHTML =
          '<span class="dash-log-action">' +
          esc(label) +
          '</span>' +
          '<span class="dash-log-pts">+' +
          esc(row.points) +
          '</span>' +
          '<span class="dash-log-time">' +
          esc(formatWhen(row.created_at)) +
          '</span>';
        logEl.appendChild(li);
      });
    })
    .catch(function () {
      if (loading) loading.textContent = 'Could not load dashboard.';
    });

  function flash(el) {
    var t = el.textContent;
    el.textContent = 'Copied ✓';
    setTimeout(function () {
      el.textContent = t;
    }, 1400);
  }
})();
