(function () {
  var ALLOWED_SOURCES = ['web', 'sns', 'referral', 'company', 'search'];
  var SOURCE_STORAGE_KEY = 'shudoku_source';
  var UTM_SOURCE_MAP = {
    instagram: 'sns', ig: 'sns', threads: 'sns', twitter: 'sns', x: 'sns',
    facebook: 'sns', line: 'sns', youtube: 'sns', tiktok: 'sns', note: 'sns',
    google: 'search', yahoo: 'search', bing: 'search',
    newsletter: 'referral', email: 'referral', mail: 'referral'
  };

  function getUrlSource() {
    var params = new URLSearchParams(window.location.search);
    var sourceParam = params.get('source');
    if (sourceParam && ALLOWED_SOURCES.indexOf(sourceParam) !== -1) {
      return sourceParam;
    }
    var utmSource = params.get('utm_source');
    if (utmSource && ALLOWED_SOURCES.indexOf(utmSource) !== -1) {
      return utmSource;
    }
    if (utmSource) {
      var mapped = UTM_SOURCE_MAP[utmSource.toLowerCase()];
      if (mapped && ALLOWED_SOURCES.indexOf(mapped) !== -1) {
        return mapped;
      }
    }
    return null;
  }

  function getStoredSource() {
    try {
      var value = sessionStorage.getItem(SOURCE_STORAGE_KEY);
      if (value && ALLOWED_SOURCES.indexOf(value) !== -1) {
        return value;
      }
    } catch (e) {}
    return null;
  }

  function storeSource(value) {
    try {
      sessionStorage.setItem(SOURCE_STORAGE_KEY, value);
    } catch (e) {}
  }

  function stripSourceParamsFromUrl() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('source');
      url.searchParams.delete('utm_source');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  var urlSource = getUrlSource();
  if (urlSource) {
    storeSource(urlSource);
    stripSourceParamsFromUrl();
  }

  const form = document.getElementById('newsletter-form');
  if (!form) return;

  const emailInput = document.getElementById('newsletter-email');
  const submitBtn = document.getElementById('newsletter-submit');
  const statusEl = document.getElementById('newsletter-status');

  if (emailInput) {
    emailInput.addEventListener('invalid', function () {
      if (emailInput.validity.valueMissing) {
        emailInput.setCustomValidity('素敵なメールアドレスを打ち込んじゃってください！');
      } else {
        emailInput.setCustomValidity('');
      }
    });
    emailInput.addEventListener('input', function () {
      emailInput.setCustomValidity('');
    });
  }

  function setStatus(message, isError) {
    if (isError) {
      statusEl.textContent = message;
    } else {
      statusEl.innerHTML = message;
    }
    statusEl.className = 'newsletter-status ' + (isError ? 'newsletter-status--error' : 'newsletter-status--success');
  }

  function resolveSource() {
    var urlSource = getUrlSource();
    if (urlSource) {
      return urlSource;
    }
    var storedSource = getStoredSource();
    if (storedSource) {
      return storedSource;
    }
    return form.dataset.source || 'web';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    const email = emailInput.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';
    statusEl.textContent = '';
    statusEl.className = 'newsletter-status';

    var source = resolveSource();
    fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: source }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          setStatus('一通目、さっき旅立ちました。<br>もし迷惑メールに紛れていたら、拾ってあげてください。', false);
          form.reset();
        } else {
          var msg = result.data && result.data.error ? result.data.error : '登録に失敗しました。もう一度お試しください。';
          setStatus(msg, true);
        }
      })
      .catch(function () {
        setStatus('通信エラーが発生しました。もう一度お試しください。', true);
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = '購読する';
      });
  });
})();
