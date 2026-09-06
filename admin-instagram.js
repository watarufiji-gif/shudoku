(function () {
  'use strict';

  const API = {
    generate: '/.netlify/functions/instagram-generate',
    render: '/.netlify/functions/instagram-render',
    publish: '/.netlify/functions/instagram-publish',
    history: '/.netlify/functions/instagram-history',
  };

  // admin.html と同じ sessionStorage キーを使うため、既にログイン済みなら共有される。
  const TOKEN_KEY = 'adminToken';

  let state = {
    sourceUrl: '',
    sourceTitle: '',
    plan: null, // { slides, caption, hashtags }
    postId: null,
    imageUrls: [],
  };

  document.addEventListener('DOMContentLoaded', function () {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      showDashboard();
      loadHistory(saved);
    }

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      attemptLogin(document.getElementById('password-input').value);
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
      sessionStorage.removeItem(TOKEN_KEY);
      location.reload();
    });

    document.getElementById('generate-btn').addEventListener('click', onGenerate);
    document.getElementById('render-btn').addEventListener('click', onRender);
    document.getElementById('publish-btn').addEventListener('click', onPublish);
  });

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function authHeaders(extra) {
    return Object.assign({ Authorization: 'Bearer ' + token() }, extra || {});
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  function attemptLogin(password) {
    document.getElementById('login-error').textContent = '';
    fetch(API.history, { headers: { Authorization: 'Bearer ' + password } })
      .then(function (res) {
        if (res.status === 401) throw new Error('パスワードが正しくありません');
        if (!res.ok) throw new Error('サーバーエラー (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        sessionStorage.setItem(TOKEN_KEY, password);
        showDashboard();
        renderHistory(data.posts || []);
      })
      .catch(function (err) {
        document.getElementById('login-error').textContent = err.message;
      });
  }

  function showDashboard() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  }

  // ── Step 1: 生成 ───────────────────────────────────────────────────────────
  function onGenerate() {
    const url = document.getElementById('url-input').value.trim();
    const statusEl = document.getElementById('generate-status');
    if (!url) {
      statusEl.textContent = 'URLを入力してください。';
      statusEl.className = 'status-msg error';
      return;
    }

    setBusy('generate-btn', true, '生成中...（市場調査ありの場合、1〜2分ほどかかります）');
    statusEl.textContent = '';
    statusEl.className = 'status-msg';

    const skipResearch = document.getElementById('skip-research-checkbox').checked;

    fetch(API.generate, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: url, skipResearch: skipResearch }),
    })
      .then(handleJson)
      .then(function (data) {
        state.sourceUrl = url;
        state.sourceTitle = (data.source && data.source.title) || '';
        state.plan = data.plan;
        renderEditor(data.plan);
        document.getElementById('edit-card').hidden = false;
        document.getElementById('edit-card').scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg error';
      })
      .finally(function () {
        setBusy('generate-btn', false, '企画を生成する');
      });
  }

  function renderEditor(plan) {
    const container = document.getElementById('slides-editor');
    container.innerHTML = '';
    const roleLabel = { hook: 'フック（1枚目）', point: 'ポイント', cta: 'CTA（最終ページ）' };

    plan.slides
      .slice()
      .sort(function (a, b) { return a.index - b.index; })
      .forEach(function (slide) {
        const div = document.createElement('div');
        div.className = 'slide-editor';
        div.dataset.index = slide.index;
        div.innerHTML =
          '<span class="slide-role-tag">' + (roleLabel[slide.role] || slide.role) + ' #' + slide.index + '</span>' +
          '<div class="field"><textarea class="slide-headline" rows="2">' + esc(slide.headline) + '</textarea></div>' +
          '<div class="field"><input type="text" class="slide-subtext" value="' + escAttr(slide.subtext || '') + '" placeholder="補足テキスト（任意）"></div>';
        container.appendChild(div);
      });

    document.getElementById('caption-input').value = plan.caption || '';
    document.getElementById('hashtags-input').value = (plan.hashtags || []).join(', ');
  }

  // ── Step 2: 画像レンダリング ───────────────────────────────────────────────
  function onRender() {
    const statusEl = document.getElementById('render-status');
    const slides = collectSlidesFromEditor();
    const caption = document.getElementById('caption-input').value.trim();
    const hashtags = document.getElementById('hashtags-input').value
      .split(',')
      .map(function (h) { return h.trim().replace(/^#/, ''); })
      .filter(Boolean);

    if (!caption) {
      statusEl.textContent = 'キャプションを入力してください。';
      statusEl.className = 'status-msg error';
      return;
    }

    setBusy('render-btn', true, '画像を生成中...');
    statusEl.textContent = '';
    statusEl.className = 'status-msg';

    fetch(API.render, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        sourceUrl: state.sourceUrl,
        sourceTitle: state.sourceTitle,
        slides: slides,
        caption: caption,
        hashtags: hashtags,
      }),
    })
      .then(handleJson)
      .then(function (data) {
        state.postId = data.postId;
        state.imageUrls = data.imageUrls;
        renderPreview(data.imageUrls);
        document.getElementById('publish-card').hidden = false;
        document.getElementById('publish-card').scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg error';
      })
      .finally(function () {
        setBusy('render-btn', false, '画像を生成する');
      });
  }

  function collectSlidesFromEditor() {
    return Array.prototype.map.call(document.querySelectorAll('.slide-editor'), function (el) {
      const index = parseInt(el.dataset.index, 10);
      const original = state.plan.slides.find(function (s) { return s.index === index; });
      return {
        index: index,
        role: original.role,
        headline: el.querySelector('.slide-headline').value.trim(),
        subtext: el.querySelector('.slide-subtext').value.trim(),
      };
    });
  }

  function renderPreview(imageUrls) {
    const strip = document.getElementById('preview-strip');
    strip.innerHTML = imageUrls
      .map(function (url, i) { return '<img src="' + url + '" alt="slide ' + (i + 1) + '">'; })
      .join('');
  }

  // ── Step 3: Instagramに投稿 ────────────────────────────────────────────────
  function onPublish() {
    if (!state.postId) return;
    if (!confirm('この内容でInstagramに投稿します。よろしいですか？')) return;

    const statusEl = document.getElementById('publish-status');
    setBusy('publish-btn', true, '投稿中...');
    statusEl.textContent = '';
    statusEl.className = 'status-msg';

    fetch(API.publish, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ postId: state.postId }),
    })
      .then(handleJson)
      .then(function (data) {
        statusEl.innerHTML = '投稿しました！ <a href="' + data.permalink + '" target="_blank" rel="noopener">投稿を見る</a>';
        statusEl.className = 'status-msg success';
        loadHistory(token());
      })
      .catch(function (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg error';
      })
      .finally(function () {
        setBusy('publish-btn', false, 'Instagramに投稿する');
      });
  }

  // ── 履歴 ──────────────────────────────────────────────────────────────────
  function loadHistory(tok) {
    fetch(API.history, { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          location.reload();
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (data) renderHistory(data.posts || []);
      })
      .catch(function (err) {
        console.error('history load error:', err);
      });
  }

  function renderHistory(posts) {
    const tbody = document.getElementById('history-body');
    if (!posts.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">まだ投稿履歴がありません</td></tr>';
      return;
    }
    tbody.innerHTML = posts
      .map(function (p) {
        const thumb = (p.image_urls && p.image_urls[0])
          ? '<img src="' + p.image_urls[0] + '">'
          : '—';
        const link = p.status === 'published' && p.ig_media_id
          ? '<a href="https://www.instagram.com/p/' + p.ig_media_id + '/" target="_blank" rel="noopener">見る</a>'
          : (p.status === 'failed' ? '<span title="' + escAttr(p.error_message || '') + '" style="color:var(--danger);cursor:help;">詳細</span>' : '');
        return (
          '<tr>' +
          '<td class="thumb-cell">' + thumb + '</td>' +
          '<td>' + formatDate(p.created_at) + '</td>' +
          '<td>' + esc(p.source_title || p.source_url || '(無題)') + '</td>' +
          '<td><span class="badge ' + p.status + '">' + statusLabel(p.status) + '</span></td>' +
          '<td>' + link + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function statusLabel(s) {
    return { draft: '下書き', published: '投稿済み', failed: '失敗' }[s] || s;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function handleJson(res) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error(data.error || 'エラーが発生しました (HTTP ' + res.status + ')');
      return data;
    });
  }

  function setBusy(btnId, busy, label) {
    const btn = document.getElementById(btnId);
    btn.disabled = busy;
    btn.textContent = label;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(str) {
    return esc(str).replace(/"/g, '&quot;');
  }
})();
