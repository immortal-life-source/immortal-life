(function () {
  function openNewsModal() {
    var modal = document.getElementById('newsModal');
    var list = document.getElementById('newsModalList');
    if (!modal || !list) return;

    modal.hidden = false;

    if (list.dataset.loaded === 'true') return;

    fetch(window.IL_FN_BASE + '/get-news', {
      method: 'GET',
      headers: window.ilFnHeaders ? window.ilFnHeaders() : { 'Content-Type': 'application/json' },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        list.innerHTML = '';
        if (!data.news || !data.news.length) {
          list.innerHTML =
            '<li class="news-modal-item"><span class="news-modal-content">No news yet.</span></li>';
          return;
        }
        data.news.forEach(function (item) {
          var li = document.createElement('li');
          li.className = 'news-modal-item';
          var date = new Date(item.published_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          li.innerHTML =
            '<span class="news-modal-date">' +
            date +
            '</span>' +
            '<span class="news-modal-content">' +
            item.content +
            '</span>';
          list.appendChild(li);
        });
        list.dataset.loaded = 'true';
      })
      .catch(function () {
        list.innerHTML =
          '<li class="news-modal-item"><span class="news-modal-content">Could not load news.</span></li>';
      });
  }

  function closeNewsModal() {
    var modal = document.getElementById('newsModal');
    if (modal) modal.hidden = true;
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-news-trigger]');
    if (trigger) {
      e.preventDefault();
      openNewsModal();
      return;
    }
    if (e.target.closest('#btnNewsClose')) {
      closeNewsModal();
      return;
    }
    if (e.target.id === 'newsModal') {
      closeNewsModal();
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNewsModal();
  });
})();
