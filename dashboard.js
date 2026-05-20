(function () {
  'use strict';

  var SESSION_KEY = 'il_session';
  var FN = window.IL_FN_BASE + '/get-dashboard';
  var CLAIM_FN = window.IL_FN_BASE + '/claim-daily';

  var ACTION_LABELS = {
    signup: 'Account created',
    daily_login: 'Daily login',
    invite_signup: 'Someone joined with your invite',
    chain_signup_depth2: 'Network signup (depth 2)',
    chain_signup_depth3: 'Network signup (depth 3)',
    codes_unlocked: 'Invite codes unlocked',
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

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatHms(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
  }

  function nextMidnightUtcIso() {
    var now = new Date();
    var next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    return next.toISOString();
  }

  /** Same UTC calendar day as now — aligns with claim-daily */
  function alreadyClaimedTodayUtc(iso) {
    if (!iso) return false;
    try {
      var last = new Date(iso);
      var now = new Date();
      return last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    } catch {
      return false;
    }
  }

  function animatePoints(el, fromVal, toVal, durationMs, onDone) {
    var startTs = null;
    function step(ts) {
      if (startTs === null) startTs = ts;
      var p = Math.min(1, (ts - startTs) / durationMs);
      var cur = Math.round(fromVal + (toVal - fromVal) * p);
      el.textContent = String(cur);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = String(toVal);
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function formatMultiplierBadge(mul) {
    var n = Number(mul);
    if (!Number.isFinite(n)) n = 1;
    var sym;
    if (Math.abs(n - 1.5) < 1e-9) sym = '1.5×';
    else if (n === 1) sym = '1×';
    else if (n === 2) sym = '2×';
    else if (n === 3) sym = '3×';
    else {
      sym = (n % 1 === 0 ? String(Math.round(n)) : String(n)) + '×';
    }
    return sym + ' multiplier';
  }

  function updateMultiplierProgressUI(networkSize) {
    var n = Number(networkSize) || 0;
    var labelEl = document.getElementById('dashMultiplierProgress');
    var fillEl = document.getElementById('dashMultiplierFill');
    if (!labelEl || !fillEl) return;

    if (n >= 200) {
      labelEl.textContent = 'Maximum multiplier reached';
      fillEl.style.width = '100%';
      return;
    }

    var nextThreshold;
    var nextSym;
    var pct;
    if (n < 11) {
      nextThreshold = 11;
      nextSym = '1.5×';
      pct = Math.min(100, (n / 11) * 100);
    } else if (n < 51) {
      nextThreshold = 51;
      nextSym = '2×';
      pct = Math.min(100, ((n - 11) / (51 - 11)) * 100);
    } else {
      nextThreshold = 200;
      nextSym = '3×';
      pct = Math.min(100, ((n - 51) / (200 - 51)) * 100);
    }

    fillEl.style.width = pct + '%';
    var need = Math.max(0, nextThreshold - n);
    if (need === 1) {
      labelEl.textContent = '1 more person to reach ' + nextSym;
    } else {
      labelEl.textContent = need + ' more people to reach ' + nextSym;
    }
  }

  function setStreakLine(streakEl, n) {
    streakEl.textContent = '';
    var streakNum = Number(n) || 0;
    if (streakNum < 3) {
      streakEl.hidden = true;
      return;
    }
    streakEl.hidden = false;
    var words = streakNum === 1 ? ' day streak ' : ' days streak ';
    streakEl.appendChild(document.createTextNode(String(streakNum) + words));
    var flame = document.createElement('span');
    flame.className = 'dash-streak-flame';
    flame.setAttribute('aria-hidden', 'true');
    flame.textContent = '🔥';
    streakEl.appendChild(flame);
  }

  function setupDailyClaim(memberId, sessionToken, pointsEl, initialStreak, lastDailyClaimIso) {
    var btn = document.getElementById('btnClaimDaily');
    var statusEl = document.getElementById('dashClaimStatus');
    var countdownEl = document.getElementById('dashClaimCountdown');
    var streakEl = document.getElementById('dashClaimStreak');
    var countdownTimer = null;

    setStreakLine(streakEl, initialStreak);

    function headers() {
      return Object.assign({}, window.ilFnHeaders(), {
        Authorization: 'Bearer ' + sessionToken,
      });
    }

    function clearCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      countdownEl.hidden = true;
      countdownEl.textContent = '';
    }

    function startCountdown(nextClaimIso) {
      clearCountdown();
      countdownEl.hidden = false;
      var target = new Date(nextClaimIso).getTime();
      function tick() {
        var left = target - Date.now();
        if (left <= 0) {
          countdownEl.textContent = 'You can claim now — refresh the page.';
          clearInterval(countdownTimer);
          countdownTimer = null;
          return;
        }
        countdownEl.textContent = 'Next claim in ' + formatHms(left) + ' (UTC)';
      }
      tick();
      countdownTimer = setInterval(tick, 1000);
    }

    function setClaimedUi(nextClaimIso) {
      btn.disabled = true;
      btn.textContent = '✓ Claimed · come back tomorrow';
      btn.classList.add('dash-btn-daily--inactive');
      statusEl.hidden = true;
      statusEl.textContent = '';
      startCountdown(nextClaimIso);
    }

    function setClaimableUi() {
      clearCountdown();
      btn.disabled = false;
      btn.textContent = 'Claim daily points +10';
      btn.classList.remove('dash-btn-daily--inactive');
      statusEl.hidden = true;
      statusEl.textContent = '';
    }

    if (alreadyClaimedTodayUtc(lastDailyClaimIso)) {
      setClaimedUi(nextMidnightUtcIso());
    } else {
      setClaimableUi();
    }

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      var startPts = parseInt(String(pointsEl.textContent || '0'), 10) || 0;

      fetch(CLAIM_FN, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ member_id: memberId }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (pack) {
          var data = pack.j;
          if (!pack.ok || data.error) {
            btn.disabled = false;
            return;
          }
          if (data.success === true && data.new_total != null) {
            animatePoints(pointsEl, startPts, data.new_total, 600, function () {
              statusEl.hidden = false;
              statusEl.textContent = '✓ Claimed today';
              setStreakLine(streakEl, data.login_streak ?? 0);
              btn.disabled = true;
              btn.textContent = '✓ Claimed · come back tomorrow';
              btn.classList.add('dash-btn-daily--inactive');
              startCountdown(nextMidnightUtcIso());

              var logEl = document.getElementById('dashPointsLog');
              var li = document.createElement('li');
              li.className = 'dash-log-row';
              var earned = data.points_earned != null ? data.points_earned : 10;
              li.innerHTML =
                '<span class="dash-log-action">' +
                esc(ACTION_LABELS.daily_login) +
                '</span>' +
                '<span class="dash-log-pts">+' +
                esc(String(earned)) +
                '</span>' +
                '<span class="dash-log-time">' +
                esc(formatWhen(new Date().toISOString())) +
                '</span>';
              logEl.insertBefore(li, logEl.firstChild);
            });
          } else if (data.reason === 'already_claimed' && data.next_claim_at) {
            setClaimedUi(data.next_claim_at);
          } else {
            btn.disabled = false;
          }
        })
        .catch(function () {
          btn.disabled = false;
        });
    });
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
      var pointsEl = document.getElementById('dashPoints');
      document.getElementById('dashAvatar').src = m.x_avatar_url || '';
      document.getElementById('dashAvatar').alt = '@' + m.x_username;
      document.getElementById('dashDisplay').textContent = m.x_display_name || '';
      document.getElementById('dashUser').textContent = '@' + (m.x_username || '');
      document.getElementById('dashTier').textContent = data.tier || 'Member';
      pointsEl.textContent = String(m.points ?? 0);

      var multEl = document.getElementById('dashMultiplier');
      if (multEl) multEl.textContent = formatMultiplierBadge(m.multiplier);

      document.getElementById('dashRank').innerHTML =
        '<a href="/leaderboard">#' +
        esc(data.rank) +
        ' on the leaderboard</a>';
      var networkN = Number(m.network_size ?? 0);
      document.getElementById('dashNetwork').textContent =
        networkN === 1 ? '1 person in your network' : networkN + ' people in your network';

      updateMultiplierProgressUI(networkN);

      var refCode = data.referral_code || '';
      var refUrl = refCode
        ? 'https://immortal.life/join?code=' + encodeURIComponent(refCode)
        : 'https://immortal.life/join';
      document.getElementById('dashReferralUrl').textContent = refUrl;

      document.getElementById('btnCopyLink').addEventListener('click', function () {
        navigator.clipboard.writeText(refUrl).then(function () {
          flash(document.getElementById('btnCopyLink'));
        });
      });

      var tweet =
        'I secured my place on immortal.life — join me: https://immortal.life/join' +
        (refCode ? '?code=' + encodeURIComponent(refCode) : '');
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
        if (!row.points) return;
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

      setupDailyClaim(m.id, session, pointsEl, m.login_streak ?? 0, m.last_daily_claim);
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
