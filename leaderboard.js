(function () {
  'use strict';

  var FN = window.IL_FN_BASE + '/get-leaderboard';
  var lbRoot = document.getElementById('lbRoot');
  var lbLoading = document.getElementById('lbLoading');
  var lbTotal = document.getElementById('lbTotal');
  var lbTop = document.getElementById('lbTop');
  var lbMid = document.getElementById('lbMid');
  var lbRest = document.getElementById('lbRest');
  var lbRestNav = document.getElementById('lbRestNav');
  var lbPageLabel = document.getElementById('lbPageLabel');
  var lbPrev = document.getElementById('lbPrev');
  var lbNext = document.getElementById('lbNext');
  var lbCta = document.getElementById('lbCta');

  var beyondPage = 1;
  var totalMembers = 0;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function hasSession() {
    return !!sessionStorage.getItem('il_session');
  }

  if (!hasSession()) lbCta.hidden = false;

  function cardHtml(m, featured) {
    var cls = 'lb-card' + (featured ? ' lb-card-rank1' : '');
    var xLink = 'https://x.com/' + encodeURIComponent(m.x_username || '');
    return (
      '<article class="' +
      cls +
      '">' +
      '<div class="lb-rank">' +
      esc(m.rank) +
      '</div>' +
      '<img class="lb-av" src="' +
      esc(m.x_avatar_url || '') +
      '" alt="" width="56" height="56" loading="lazy" />' +
      '<div class="lb-meta">' +
      '<div class="lb-name">' +
      esc(m.x_display_name || '') +
      '</div>' +
      '<a class="lb-handle" href="' +
      esc(xLink) +
      '" target="_blank" rel="noopener">' +
      esc('@' + (m.x_username || '')) +
      '</a>' +
      '<div class="lb-points">' +
      esc(m.points) +
      ' pts</div>' +
      '<span class="lb-tier">' +
      esc(m.tier || '') +
      '</span>' +
      '</div></article>'
    );
  }

  function rowHtml(m) {
    var xLink = 'https://x.com/' + encodeURIComponent(m.x_username || '');
    return (
      '<div class="lb-row">' +
      '<span class="lb-row-rank">' +
      esc(m.rank) +
      '</span>' +
      '<img class="lb-row-av" src="' +
      esc(m.x_avatar_url || '') +
      '" alt="" width="32" height="32" loading="lazy" />' +
      '<div class="lb-row-meta">' +
      '<span class="lb-row-name">' +
      esc(m.x_display_name || '') +
      '</span>' +
      '<a href="' +
      esc(xLink) +
      '" target="_blank" rel="noopener" class="lb-row-handle">' +
      esc('@' + (m.x_username || '')) +
      '</a>' +
      '</div>' +
      '<span class="lb-row-pts">' +
      esc(m.points) +
      '</span>' +
      '<span class="lb-row-tier">' +
      esc(m.tier || '') +
      '</span>' +
      '</div>'
    );
  }

  fetch(FN + '?limit=100&offset=0', { headers: window.ilFnHeaders() })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      lbLoading.hidden = true;
      lbRoot.hidden = false;
      totalMembers = data.total ?? 0;
      lbTotal.textContent = String(totalMembers);

      var members = data.members || [];
      var top = members.slice(0, 10);
      var mid = members.slice(10, 100);

      lbTop.innerHTML = top
        .map(function (m) {
          return cardHtml(m, m.rank === 1);
        })
        .join('');

      lbMid.innerHTML = mid.map(rowHtml).join('');

      lbRestNav.hidden = totalMembers <= 100;
      if (!lbRestNav.hidden) loadBeyond();
    })
    .catch(function () {
      lbLoading.textContent = 'Could not load leaderboard.';
    });

  function loadBeyond() {
    var offset = 100 + (beyondPage - 1) * 50;
    lbRest.innerHTML = '<p class="m-muted">Loading…</p>';
    fetch(FN + '?limit=50&offset=' + offset, { headers: window.ilFnHeaders() })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var members = data.members || [];
        lbRest.innerHTML = members.length ? members.map(rowHtml).join('') : '<p class="m-muted">No more members.</p>';
        var maxPage = Math.max(1, Math.ceil(Math.max(0, totalMembers - 100) / 50));
        lbPageLabel.textContent = 'Page ' + beyondPage + ' of ' + maxPage;
        lbPrev.disabled = beyondPage <= 1;
        lbNext.disabled = beyondPage >= maxPage || members.length < 50;
      });
  }

  lbPrev.addEventListener('click', function () {
    if (beyondPage > 1) {
      beyondPage--;
      loadBeyond();
    }
  });
  lbNext.addEventListener('click', function () {
    beyondPage++;
    loadBeyond();
  });
})();
