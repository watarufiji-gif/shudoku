(function () {
  const form = document.getElementById('newsletter-form');
  if (!form) return;

  const emailInput = document.getElementById('newsletter-email');
  const submitBtn = document.getElementById('newsletter-submit');
  const statusEl = document.getElementById('newsletter-status');

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.className = 'newsletter-status ' + (isError ? 'newsletter-status--error' : 'newsletter-status--success');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';
    statusEl.textContent = '';
    statusEl.className = 'newsletter-status';

    fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          setStatus('ありがとうございます！確認メールをお送りしました。', false);
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
