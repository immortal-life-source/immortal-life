(function () {
  'use strict';

  var SESSION_KEY = 'il_session';
  var FN = window.IL_FN_BASE + '/get-dashboard';
  var CLAIM_FN = window.IL_FN_BASE + '/claim-daily';
  var MEMBER_INTELLIGENCE_FN = window.IL_FN_BASE + '/member-intelligence';

  var ACTION_LABELS = {
    signup: 'Account created',
    daily_login: 'Daily login',
    invite_signup: 'Someone joined with your invite',
    chain_signup_depth2: 'Network signup (depth 2)',
    chain_signup_depth3: 'Network signup (depth 3)',
    codes_unlocked: 'Invite codes unlocked',
    streak_bonus: 'Streak bonus',
    streak_bonus_7: '7-day streak bonus',
    streak_bonus_30: '30-day streak bonus',
    streak_bonus_100: '100-day streak bonus',
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

  function nextClaimAt(iso) {
    if (!iso) return 0;
    var last = new Date(iso).getTime();
    return Number.isFinite(last) ? last + 20 * 60 * 60 * 1000 : 0;
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

  function setupMemberIntelligence(sessionToken) {
    var topicsRoot = document.getElementById('dashWatchTopics');
    var entitiesRoot = document.getElementById('dashWatchEntities');
    var countriesRoot = document.getElementById('dashWatchCountries');
    var trialsRoot = document.getElementById('dashWatchTrials');
    var eventsRoot = document.getElementById('dashRadarEvents');
    var badge = document.getElementById('dashRadarBadge');
    var briefingsRoot = document.getElementById('dashBriefings');
    var enabledInput = document.getElementById('dashBriefingsEnabled');
    var status = document.getElementById('dashWatchStatus');
    var markedSeen = false;
    if (!topicsRoot || !entitiesRoot || !countriesRoot || !trialsRoot || !eventsRoot || !briefingsRoot || !enabledInput) return;

    function headers() {
      return Object.assign({}, window.ilFnHeaders(), { Authorization: 'Bearer ' + sessionToken });
    }

    function post(action, values, quiet) {
      if (!quiet) status.textContent = 'Saving…';
      return fetch(MEMBER_INTELLIGENCE_FN, {
        method: 'POST', headers: headers(), body: JSON.stringify(Object.assign({ action: action }, values || {})),
      }).then(function (response) {
        if (response.status === 401) {
          sessionStorage.removeItem(SESSION_KEY); window.location.replace('/join'); throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error('Save failed');
        return response.json();
      }).then(function (data) {
        if (!quiet) status.textContent = 'Saved. Your radar and next briefing now use these choices.';
        render(data);
      }).catch(function (error) {
        if (!quiet && error.message !== 'Unauthorized') status.textContent = 'Could not save. Please try again.';
      });
    }

    function eventLabel(value) {
      return ({
        new_research: 'New research', research_updated: 'Research changed', new_trial: 'New trial',
        trial_status_changed: 'Trial status changed', new_regulatory_notice: 'Regulatory notice',
        new_integrity_event: 'Correction or retraction', quality_state_changed: 'Quality status changed',
      })[value] || String(value || '').replace(/_/g, ' ');
    }

    function renderOptions(root, type, options, watched) {
      root.replaceChildren();
      if (!options.length) {
        var empty = document.createElement('p'); empty.className = 'm-muted dash-intel-copy'; empty.textContent = 'Options will appear after the next source update.'; root.appendChild(empty); return;
      }
      options.forEach(function (option) {
        var identity = type + ':' + option.key;
        var active = watched.has(identity);
        var button = document.createElement('button'); button.type = 'button'; button.className = 'dash-watch-chip' + (active ? ' is-watched' : '');
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.title = option.detail || option.label; button.textContent = option.label + (option.count ? ' · ' + option.count : '');
        button.addEventListener('click', function () {
          button.disabled = true;
          if (window.ilTrackUtility) window.ilTrackUtility(active ? 'remove_watch' : 'create_watch');
          post(active ? 'unwatch' : 'watch', { watch_type: type, watch_key: option.key });
        });
        root.appendChild(button);
      });
    }

    function renderEvents(events) {
      eventsRoot.replaceChildren();
      if (!events.length) {
        var empty = document.createElement('p'); empty.className = 'm-muted dash-intel-copy'; empty.textContent = 'No new matching changes yet. Monitoring is active.'; eventsRoot.appendChild(empty); return;
      }
      events.slice(0, 12).forEach(function (event) {
        var article = document.createElement('article'); article.className = 'dash-radar-event' + (event.importance === 'important' ? ' is-important' : '');
        var meta = document.createElement('p'); meta.className = 'dash-radar-event-meta'; meta.textContent = eventLabel(event.event_type) + ' · ' + formatWhen(event.occurred_at);
        var title = document.createElement('a'); title.href = '/' + event.record_type + '/' + event.record_id; title.textContent = event.title; title.addEventListener('click', function () { if (window.ilTrackUtility) window.ilTrackUtility('open_change'); });
        article.append(meta, title); eventsRoot.appendChild(article);
      });
    }

    function renderBriefings(briefings) {
      briefingsRoot.replaceChildren();
      var heading = document.createElement('p');
      heading.className = 'dash-section-label dash-briefing-heading';
      heading.textContent = 'Weekly briefings';
      briefingsRoot.appendChild(heading);
      if (!briefings.length) {
        var empty = document.createElement('p');
        empty.className = 'm-muted dash-intel-copy';
        empty.textContent = 'Your first briefing will appear after the next Monday generation cycle.';
        briefingsRoot.appendChild(empty);
        return;
      }
      briefings.forEach(function (briefing, index) {
        var details = document.createElement('details');
        details.className = 'dash-briefing-card';
        if (index === 0) details.open = true;
        var summary = document.createElement('summary');
        summary.textContent = briefing.title;
        var body = document.createElement('div');
        body.className = 'dash-briefing-body';
        var overview = document.createElement('p'); overview.textContent = briefing.summary; body.appendChild(overview);
        var payload = briefing.payload || {};
        ['integrity', 'regulatory', 'research', 'trials'].forEach(function (kind) {
          var records = Array.isArray(payload[kind]) ? payload[kind] : [];
          if (!records.length) return;
          var title = document.createElement('h4'); title.textContent = kind.charAt(0).toUpperCase() + kind.slice(1); body.appendChild(title);
          var list = document.createElement('ul');
          records.slice(0, 5).forEach(function (record) {
            var item = document.createElement('li');
            var anchor = document.createElement('a'); anchor.href = record.source_url || '/research'; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = record.title || 'Source record';
            item.appendChild(anchor); list.appendChild(item);
          });
          body.appendChild(list);
        });
        details.append(summary, body); briefingsRoot.appendChild(details);
      });
    }

    function render(data) {
      var watched = new Set((data.watches || []).map(function (watch) { return watch.watch_type + ':' + watch.watch_key; }));
      renderOptions(topicsRoot, 'topic', (data.topics || []).map(function (topic) { return { key: topic.slug, label: topic.name, count: Number(topic.research_count || 0) + Number(topic.trial_count || 0) }; }), watched);
      renderOptions(entitiesRoot, 'entity', data.options && data.options.entities || [], watched);
      renderOptions(countriesRoot, 'country', data.options && data.options.countries || [], watched);
      renderOptions(trialsRoot, 'trial', data.options && data.options.trials || [], watched);
      renderEvents(data.radar_events || []);
      if (badge) { badge.hidden = !data.unread_count; badge.textContent = data.unread_count ? data.unread_count + ' new' : ''; }
      enabledInput.checked = data.briefings_enabled !== false;
      renderBriefings(data.briefings || []);
      if (!markedSeen && data.generated_at && (data.radar_events || []).length) { markedSeen = true; post('mark_radar_seen', { seen_at: data.generated_at }, true); }
    }

    enabledInput.addEventListener('change', function () { post('set_briefings', { enabled: enabledInput.checked }); });
    fetch(MEMBER_INTELLIGENCE_FN, { method: 'GET', headers: headers() })
      .then(function (response) {
        if (response.status === 401) { sessionStorage.removeItem(SESSION_KEY); window.location.replace('/join'); throw new Error('Unauthorized'); }
        if (!response.ok) throw new Error('Load failed'); return response.json();
      })
      .then(render)
      .catch(function (error) { if (error.message !== 'Unauthorized') topicsRoot.textContent = 'Watchlist is temporarily unavailable.'; });
  }

  function setupDailyClaim(sessionToken, pointsEl, initialStreak, lastDailyClaimIso) {
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
        countdownEl.textContent = 'Next claim in ' + formatHms(left);
      }
      tick();
      countdownTimer = setInterval(tick, 1000);
    }

    function setClaimedUi(nextClaimIso) {
      btn.disabled = true;
      btn.textContent = '✓ Claimed · available again in 20 hours';
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

    var initialNextClaim = nextClaimAt(lastDailyClaimIso);
    if (initialNextClaim > Date.now()) {
      setClaimedUi(new Date(initialNextClaim).toISOString());
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
        body: '{}',
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, status: r.status, j: j };
          });
        })
        .then(function (pack) {
          var data = pack.j;
          if (pack.status === 401) {
            sessionStorage.removeItem(SESSION_KEY);
            window.location.replace('/join');
            return;
          }
          if (!pack.ok || data.error) {
            btn.disabled = false;
            return;
          }
          if (data.success === true && data.new_total != null) {
            animatePoints(pointsEl, startPts, data.new_total, 600, function () {
              statusEl.hidden = false;
              var streakBonus = Number(data.streak_bonus);
              setStreakLine(streakEl, data.login_streak ?? 0);
              btn.disabled = true;
              btn.textContent = '✓ Claimed · available again in 20 hours';
              btn.classList.add('dash-btn-daily--inactive');
              startCountdown(data.next_claim_at);

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

              if (streakBonus > 0) {
                var liBonus = document.createElement('li');
                liBonus.className = 'dash-log-row';
                liBonus.innerHTML =
                  '<span class="dash-log-action">' +
                  esc(ACTION_LABELS.streak_bonus) +
                  '</span>' +
                  '<span class="dash-log-pts">+' +
                  esc(String(streakBonus)) +
                  '</span>' +
                  '<span class="dash-log-time">' +
                  esc(formatWhen(new Date().toISOString())) +
                  '</span>';
                logEl.insertBefore(liBonus, li.nextSibling);
                statusEl.textContent =
                  '🔥 ' + data.streak_bonus_label + ' — +' + data.streak_bonus + ' pts!';
              } else {
                statusEl.textContent = '✓ Claimed today';
              }
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
      document.getElementById('dashAvatar').src = m.profile_avatar_url || '';
      document.getElementById('dashAvatar').alt = m.profile_display_name || '';
      document.getElementById('dashDisplay').textContent = m.profile_display_name || '';
      document.getElementById('dashUser').textContent = m.auth_provider === 'linkedin'
        ? 'LinkedIn member'
        : '@' + (m.profile_handle || '');
      document.getElementById('dashTier').textContent = data.tier || 'Member';
      var ogBadge = document.getElementById('dashOgBadge');
      if (ogBadge) {
        ogBadge.hidden = !(m.is_og === true || m.is_og === 1 || m.is_og === 'true');
      }
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
        ? 'https://www.immortal.life/invite/' + encodeURIComponent(refCode)
        : 'https://www.immortal.life/join';
      document.getElementById('dashReferralUrl').textContent = refUrl;

      document.getElementById('btnCopyLink').addEventListener('click', function () {
        navigator.clipboard.writeText(refUrl).then(function () {
          flash(document.getElementById('btnCopyLink'));
        });
      });

      var tweet =
        'The founding circle at immortal.life is forming — I\'m in. Join me before it closes: https://www.immortal.life/invite/' +
        encodeURIComponent(refCode);
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

      setupDailyClaim(session, pointsEl, m.login_streak ?? 0, m.last_daily_claim);
      setupMemberIntelligence(session);

      var btnDeleteAccount = document.getElementById('btnDeleteAccount');
      var deleteModal = document.getElementById('deleteModal');
      deleteModal.hidden = true;
      var btnDeleteConfirm = document.getElementById('btnDeleteConfirm');
      var btnDeleteCancel = document.getElementById('btnDeleteCancel');
      var deleteError = document.getElementById('deleteError');

      if (btnDeleteAccount && deleteModal) {
        btnDeleteAccount.addEventListener('click', function () {
          deleteModal.hidden = false;
        });
      }

      if (btnDeleteCancel && deleteModal && deleteError) {
        btnDeleteCancel.addEventListener('click', function () {
          deleteModal.hidden = true;
          deleteError.hidden = true;
        });
      }

      if (btnDeleteConfirm && deleteModal && deleteError) {
        btnDeleteConfirm.addEventListener('click', function () {
          btnDeleteConfirm.disabled = true;
          btnDeleteConfirm.textContent = 'Deleting…';
          deleteError.hidden = true;

          fetch(window.IL_FN_BASE + '/delete-member', {
            method: 'POST',
            headers: Object.assign({}, window.ilFnHeaders(), {
              Authorization: 'Bearer ' + session,
            }),
            body: '{}',
          })
            .then(function (r) {
              return r.json().then(function (data) {
                return { status: r.status, data: data };
              });
            })
            .then(function (result) {
              var data = result.data;
              if (result.status === 401) {
                sessionStorage.removeItem(SESSION_KEY);
                window.location.replace('/join');
                return;
              }
              if (data.error) {
                deleteError.textContent = data.error;
                deleteError.hidden = false;
                btnDeleteConfirm.disabled = false;
                btnDeleteConfirm.textContent = 'Yes, delete my account';
              } else {
                sessionStorage.removeItem(SESSION_KEY);
                window.location.replace('/?deleted=1');
              }
            })
            .catch(function () {
              deleteError.textContent = 'Something went wrong. Please try again.';
              deleteError.hidden = false;
              btnDeleteConfirm.disabled = false;
              btnDeleteConfirm.textContent = 'Yes, delete my account';
            });
        });
      }
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
