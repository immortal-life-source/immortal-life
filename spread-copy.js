document.addEventListener('click', function (e) {
  var btn = e.target.closest('.dash-tweet-copy-btn');
  if (!btn) return;
  var card = btn.closest('.dash-tweet-card');
  if (!card) return;
  var text = card.querySelector('.dash-tweet-text').textContent.trim();

  function flash() {
    var orig = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(function () {
      btn.textContent = orig;
    }, 1500);
  }

  function fallbackCopy(str) {
    var ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch (err) {}
    document.body.removeChild(ta);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(function () {
      fallbackCopy(text);
      flash();
    });
  } else {
    fallbackCopy(text);
    flash();
  }
});
