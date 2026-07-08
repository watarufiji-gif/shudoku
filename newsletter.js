(function () {
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

    var source = form.dataset.source || 'web';
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
