// =============================================
// 週読 - JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    initSupabaseSetupPanel();
    initMicroCMSSetupPanel();
    initAnalytics();
    initAffiliateTracking();
    initAffiliateStatsPanel();
    initMicroCMSContent();
    initCountdown();
    initNewsletterForm();
    initAuthForms();
    initReadingDatabasePage();
    initBookMetadataEditor();
    initSmoothScroll();
    initScrollAnimations();
});

// =============================================
// Countdown Timer
// 次の土曜日までのカウントダウン
// =============================================
function initCountdown() {
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');

    if (!daysEl || !hoursEl || !minutesEl) return;

    function getNextSaturday() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;

        const nextSaturday = new Date(now);
        nextSaturday.setDate(now.getDate() + daysUntilSaturday);
        nextSaturday.setHours(9, 0, 0, 0); // 土曜日の朝9時に更新

        if (nextSaturday <= now) {
            nextSaturday.setDate(nextSaturday.getDate() + 7);
        }

        return nextSaturday;
    }

    function updateCountdown() {
        const now = new Date();
        const target = getNextSaturday();
        const diff = target - now;

        if (diff <= 0) {
            daysEl.textContent = '0';
            hoursEl.textContent = '0';
            minutesEl.textContent = '0';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        daysEl.textContent = days;
        hoursEl.textContent = hours;
        minutesEl.textContent = minutes;
    }

    updateCountdown();
    setInterval(updateCountdown, 60000); // 1分ごとに更新
}

// =============================================
// Newsletter Form
// =============================================
function initNewsletterForm() {
    const form = document.getElementById('newsletter-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const input = form.querySelector('.newsletter-input');
        const email = input.value.trim();

        if (!email) return;

        // ここで実際のニュースレターサービス（Mailchimp, ConvertKit等）と連携
        // 今はデモとしてアラートを表示
        
        const btn = form.querySelector('.newsletter-btn');
        const originalText = btn.textContent;
        btn.textContent = '登録中...';
        btn.disabled = true;

        // 擬似的な遅延（実際はAPIコールに置き換え）
        setTimeout(() => {
            btn.textContent = '✓ 登録完了';
            btn.style.background = '#4CAF50';
            input.value = '';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.disabled = false;
            }, 3000);
        }, 1000);
    });
}

// =============================================
// Auth Forms (Supabase)
// =============================================
function initAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const oauthButtons = document.querySelectorAll('[data-oauth-provider]');
    const oauthContainer = document.querySelector('.oauth-buttons');
    const oauthDivider = document.querySelector('.auth-divider');

    const enabledProviders = Array.isArray(window.ENABLED_OAUTH_PROVIDERS)
        ? window.ENABLED_OAUTH_PROVIDERS.map((provider) => String(provider).toLowerCase())
        : [];

    const activeOAuthButtons = Array.from(oauthButtons).filter((button) => {
        const provider = String(button.getAttribute('data-oauth-provider') || '').toLowerCase();
        const shouldShow = enabledProviders.includes(provider);
        button.hidden = !shouldShow;
        return shouldShow;
    });

    if (oauthContainer) oauthContainer.hidden = activeOAuthButtons.length === 0;
    if (oauthDivider) oauthDivider.hidden = activeOAuthButtons.length === 0;

    if (!loginForm && !registerForm && activeOAuthButtons.length === 0) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
        setAuthMessage('register-message', 'Supabase未設定です。`supabase-config.js` を設定してください。');
        setAuthMessage('login-message', 'Supabase未設定です。`supabase-config.js` を設定してください。');
        return;
    }

    bindAuthStateRedirect(supabase);
    redirectIfAlreadySignedIn(supabase);

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSignUp(registerForm, supabase);
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSignIn(loginForm, supabase);
        });
    }

    if (activeOAuthButtons.length > 0) {
        activeOAuthButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const provider = button.getAttribute('data-oauth-provider');
                if (!provider) return;
                handleOAuthSignIn(provider, supabase);
            });
        });
    }
}

function initSupabaseSetupPanel() {
    const panel = document.getElementById('supabase-setup-panel');
    const form = document.getElementById('supabase-setup-form');
    if (!panel || !form) return;

    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-anon-key');
    const messageEl = document.getElementById('supabase-setup-message');

    if (!urlInput || !keyInput) return;

    const hasClient = Boolean(getSupabaseClient());
    panel.hidden = hasClient;
    if (hasClient) return;

    if (window.SUPABASE_URL) urlInput.value = window.SUPABASE_URL;
    if (window.SUPABASE_ANON_KEY) keyInput.value = window.SUPABASE_ANON_KEY;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const url = String(urlInput.value || '').trim();
        const key = String(keyInput.value || '').trim();

        if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
            if (messageEl) messageEl.textContent = 'URL形式が不正です（https://xxxx.supabase.co）。';
            return;
        }
        if (key.length < 20) {
            if (messageEl) messageEl.textContent = 'Anon Keyが短すぎます。';
            return;
        }

        if (window.localStorage) {
            window.localStorage.setItem('supabase_url', url);
            window.localStorage.setItem('supabase_anon_key', key);
        }
        if (messageEl) messageEl.textContent = '保存しました。ページを再読み込みします。';
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });
}

function setAuthMessage(elementId, message) {
    const target = document.getElementById(elementId);
    if (!target) return;
    target.textContent = message;
}

async function handleSignUp(registerForm, supabase) {
    const formData = new FormData(registerForm);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    const passwordConfirm = String(formData.get('passwordConfirm') || '');
    const genre = String(formData.get('genre') || '');
    const newsletterOptIn = formData.get('newsletterOptIn') === 'on';

    if (password !== passwordConfirm) {
        setAuthMessage('register-message', 'パスワードが一致しません。');
        return;
    }

    const emailRedirectTo = new URL('my-library.html', window.location.href).toString();
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo,
            data: {
                display_name: name,
                favorite_genre: genre,
                newsletter_opt_in: newsletterOptIn
            }
        }
    });

    if (error) {
        setAuthMessage('register-message', `登録に失敗しました: ${error.message}`);
        return;
    }

    if (data && data.session) {
        setAuthMessage('register-message', '登録完了。ログイン済みのため読書記録ページへ移動します。');
        setTimeout(() => {
            window.location.href = 'my-library.html';
        }, 600);
    } else {
        setAuthMessage('register-message', '登録完了。確認メールをチェックしてからログインしてください。');
    }
    registerForm.reset();
}

async function handleSignIn(loginForm, supabase) {
    const formData = new FormData(loginForm);
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        setAuthMessage('login-message', `ログイン失敗: ${error.message}`);
        return;
    }

    setAuthMessage('login-message', 'ログインしました。読書記録ページへ移動します。');
    loginForm.reset();
    setTimeout(() => {
        window.location.href = 'my-library.html';
    }, 600);
}

async function handleOAuthSignIn(provider, supabase) {
    const redirectTo = new URL('my-library.html', window.location.href).toString();
    const options = {
        redirectTo
    };

    if (provider === 'google') {
        options.scopes = 'email profile';
    } else if (provider === 'facebook') {
        options.scopes = 'email';
    } else if (provider === 'apple') {
        options.scopes = 'name email';
    }

    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options
    });

    if (error) {
        setAuthMessage('login-message', `${provider}ログインに失敗しました: ${error.message}`);
    }
}

async function redirectIfAlreadySignedIn(supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data || !data.session) return;
    window.location.href = 'my-library.html';
}

function bindAuthStateRedirect(supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            if (window.location.pathname.endsWith('login.html')) {
                window.location.href = 'my-library.html';
            }
        }
    });
}

// =============================================
// Reading Database Page (Supabase)
// =============================================
function initReadingDatabasePage() {
    const page = document.getElementById('reading-db-page');
    if (!page) return;

    const loginRequired = document.getElementById('reading-login-required');
    const content = document.getElementById('reading-content');
    const userLabel = document.getElementById('reading-user-label');
    const form = document.getElementById('reading-form');
    const list = document.getElementById('reading-list');
    const count = document.getElementById('reading-count');
    const message = document.getElementById('reading-form-message');

    wireReadingPage(page, loginRequired, content, userLabel, form, list, count, message);
}

async function wireReadingPage(page, loginRequired, content, userLabel, form, list, count, message) {
    const supabase = getSupabaseClient();
    if (!supabase) {
        if (loginRequired) {
            loginRequired.hidden = false;
            loginRequired.innerHTML = '<p>Supabase未設定です。`supabase-config.js` を設定してください。</p>';
        }
        if (content) content.hidden = true;
        return;
    }

    let activeUserId = null;

    async function syncReadingPage() {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData ? userData.user : null;
        if (!user) {
            activeUserId = null;
            if (loginRequired) loginRequired.hidden = false;
            if (content) content.hidden = true;
            if (userLabel) userLabel.textContent = '';
            if (list) list.innerHTML = '';
            if (count) count.textContent = '0冊';
            return null;
        }

        activeUserId = user.id;
        if (loginRequired) loginRequired.hidden = true;
        if (content) content.hidden = false;
        if (userLabel) {
            const displayName = user.user_metadata && user.user_metadata.display_name
                ? user.user_metadata.display_name
                : user.email;
            userLabel.textContent = `${displayName} さんの記録`;
        }

        await renderReadingEntries(supabase, user.id, list, count);
        return user;
    }

    await syncReadingPage();

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            await syncReadingPage();
            return;
        }

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
            await syncReadingPage();
        }
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeUserId) {
                if (message) message.textContent = 'ログイン状態を確認できません。再ログインしてください。';
                return;
            }

            const formData = new FormData(form);
            const title = String(formData.get('title') || '').trim();
            const author = String(formData.get('author') || '').trim();
            const status = String(formData.get('status') || '').trim();
            const completedOn = String(formData.get('completedOn') || '').trim() || null;
            const ratingRaw = String(formData.get('rating') || '').trim();
            const rating = ratingRaw ? Number(ratingRaw) : null;
            const note = String(formData.get('note') || '').trim() || null;

            const { error } = await supabase.from('reading_entries').insert({
                user_id: activeUserId,
                title,
                author,
                status,
                completed_on: completedOn,
                rating,
                note
            });

            if (error) {
                if (message) message.textContent = `保存に失敗しました: ${error.message}`;
                return;
            }

            if (message) message.textContent = '読書記録を保存しました。';
            form.reset();
            await renderReadingEntries(supabase, activeUserId, list, count);
        });
    }

    if (list) {
        list.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.reading-delete');
            if (!deleteButton) return;

            const entryId = deleteButton.getAttribute('data-entry-id');
            if (!entryId) return;
            if (!activeUserId) {
                if (message) message.textContent = 'ログイン状態を確認できません。再ログインしてください。';
                return;
            }

            const { error } = await supabase
                .from('reading_entries')
                .delete()
                .eq('id', entryId)
                .eq('user_id', activeUserId);

            if (error) {
                if (message) message.textContent = `削除に失敗しました: ${error.message}`;
                return;
            }
            if (activeUserId) {
                await renderReadingEntries(supabase, activeUserId, list, count);
            }
        });
    }

    const logoutButton = page.querySelector('#logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'login.html';
        });
    }
}

async function renderReadingEntries(supabase, userId, listElement, countElement) {
    if (!listElement || !countElement) return;

    const { data, error } = await supabase
        .from('reading_entries')
        .select('id,title,author,status,completed_on,rating,note,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        listElement.innerHTML = `<p class="reading-empty">取得に失敗しました: ${escapeHtml(error.message)}</p>`;
        countElement.textContent = '0冊';
        return;
    }

    const userEntries = Array.isArray(data) ? data : [];
    countElement.textContent = `${userEntries.length}冊`;

    if (userEntries.length === 0) {
        listElement.innerHTML = '<p class="reading-empty">まだ読書記録がありません。最初の1冊を登録しましょう。</p>';
        return;
    }

    listElement.innerHTML = userEntries.map((entry) => {
        const dateLabel = entry.completed_on ? `読了日: ${escapeHtml(entry.completed_on)}` : '読了日: 未設定';
        const ratingLabel = entry.rating ? `評価: ${escapeHtml(entry.rating)}/5` : '評価: -';
        const noteHtml = entry.note ? `<p class="reading-note">${escapeHtml(entry.note)}</p>` : '';

        return `
            <article class="reading-item">
                <div class="reading-item-top">
                    <div>
                        <h3 class="reading-item-title">${escapeHtml(entry.title)}</h3>
                        <p class="reading-item-meta">${escapeHtml(entry.author)}</p>
                    </div>
                    <button type="button" class="reading-delete" data-entry-id="${escapeHtml(entry.id)}">削除</button>
                </div>
                <div class="reading-item-badges">
                    <span class="reading-badge">状態: ${escapeHtml(entry.status)}</span>
                    <span class="reading-badge">${dateLabel}</span>
                    <span class="reading-badge">${ratingLabel}</span>
                </div>
                ${noteHtml}
            </article>
        `;
    }).join('');
}

function getSupabaseClient() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        return null;
    }
    const url = String(window.SUPABASE_URL);
    const key = String(window.SUPABASE_ANON_KEY);
    if (
        url.includes('YOUR_PROJECT_ID') ||
        key.includes('YOUR_SUPABASE_ANON_KEY')
    ) {
        return null;
    }
    if (!window._supabaseClient) {
        window._supabaseClient = window.supabase.createClient(
            url,
            key
        );
    }
    return window._supabaseClient;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =============================================
// Analytics + Affiliate Tracking
// =============================================
function initAnalytics() {
    const measurementId = String(window.GA4_MEASUREMENT_ID || '').trim();
    if (!measurementId) return;
    if (window.gtag) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
}

function initAffiliateTracking() {
    document.querySelectorAll('a[href*="amazon.co.jp"], a[href*="books.rakuten.co.jp"]').forEach((link) => {
        if (!link.dataset.platform) {
            if (link.href.includes('amazon.co.jp')) link.dataset.platform = 'amazon';
            if (link.href.includes('books.rakuten.co.jp')) link.dataset.platform = 'rakuten';
        }
        if (!link.dataset.trackType) link.dataset.trackType = 'affiliate';
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[data-track-type="affiliate"]');
        if (!link) return;

        const platform = String(link.dataset.platform || '').trim();
        const bookTitle = String(link.dataset.bookTitle || getActiveBookTitle() || 'unknown').trim();
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const href = link.href;

        saveAffiliateClick({
            platform,
            page,
            bookTitle,
            href,
            at: new Date().toISOString()
        });

        if (typeof window.gtag === 'function') {
            window.gtag('event', 'affiliate_click', {
                platform,
                book_title: bookTitle,
                page_path: window.location.pathname,
                link_url: href
            });
        }
    });
}

function getActiveBookTitle() {
    const titleEl = document.getElementById('home-book-title') || document.getElementById('book-title-display');
    return titleEl ? titleEl.textContent.trim() : '';
}

function saveAffiliateClick(eventData) {
    const key = 'affiliate_click_events';
    const history = getAffiliateHistory();
    history.push(eventData);

    // 無限増加を防ぐため最新500件のみ保持
    const latest = history.slice(-500);
    if (window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(latest));
    }
}

function getAffiliateHistory() {
    if (!window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem('affiliate_click_events');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function initAffiliateStatsPanel() {
    const panel = document.getElementById('affiliate-stats-panel');
    const body = document.getElementById('affiliate-stats-body');
    if (!panel || !body) return;

    panel.hidden = false;
    const history = getAffiliateHistory();
    if (history.length === 0) {
        body.innerHTML = '<p class="auth-storage-note">まだクリック計測データがありません。</p>';
        return;
    }

    const aggregate = new Map();
    history.forEach((item) => {
        const platform = String(item.platform || 'unknown');
        const key = `${platform}`;
        aggregate.set(key, (aggregate.get(key) || 0) + 1);
    });

    const total = history.length;
    const latest = history[history.length - 1];
    const rows = Array.from(aggregate.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([platform, count]) => `<li>${escapeHtml(platform)}: ${count}クリック</li>`)
        .join('');

    body.innerHTML = `
        <p class="auth-storage-note">総クリック数: ${escapeHtml(total)}</p>
        <ul style="margin: 8px 0 0 18px; color: var(--color-text-secondary);">
            ${rows}
        </ul>
        <p class="auth-storage-note" style="margin-top: 10px;">最新クリック: ${escapeHtml(latest.at || '')}</p>
    `;
}

// =============================================
// Book Metadata Editor (ISBN -> Cover)
// =============================================
function initBookMetadataEditor() {
    const form = document.getElementById('book-meta-form');
    if (!form) return;

    const titleInput = document.getElementById('book-input-title');
    const authorInput = document.getElementById('book-input-author');
    const isbnInput = document.getElementById('book-input-isbn');
    const messageEl = document.getElementById('book-meta-message');
    const submitButton = form.querySelector('button[type="submit"]');

    const titleDisplay = document.getElementById('book-title-display');
    const authorDisplay = document.getElementById('book-author-display');
    const coverImage = document.getElementById('book-cover-image');
    const descriptionMeta = document.querySelector('meta[name="description"]');

    if (!titleInput || !authorInput || !isbnInput || !titleDisplay || !authorDisplay || !coverImage) return;

    const defaultButtonText = submitButton ? submitButton.textContent : '';

    function setMessage(message, isError = false) {
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.style.color = isError ? '#B00020' : 'var(--color-text-muted)';
    }

    function normalizeIsbn(rawIsbn) {
        return String(rawIsbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    }

    function isValidIsbn(isbn) {
        return isbn.length === 10 || isbn.length === 13;
    }

    function applyBookData(title, author, isbn, coverUrl) {
        titleDisplay.textContent = title;
        authorDisplay.textContent = author;
        coverImage.alt = `今週の一冊: ${title}`;

        if (coverUrl) {
            coverImage.src = coverUrl;
        }

        document.title = `${title} | 週読`;
        if (descriptionMeta) {
            const isbnSuffix = isbn ? `（ISBN: ${isbn}）` : '';
            descriptionMeta.setAttribute('content', `第1週の一冊：${title}。著者：${author}${isbnSuffix}`);
        }
    }

    async function fetchCoverFromOpenBD(isbn) {
        const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!Array.isArray(data) || !data[0] || !data[0].summary) return null;

        const summary = data[0].summary;
        if (!summary.cover) return null;

        return {
            cover: summary.cover,
            title: summary.title || '',
            author: summary.author || '',
            source: 'OpenBD'
        };
    }

    async function fetchCoverFromGoogleBooks(isbn) {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data || !Array.isArray(data.items) || !data.items[0] || !data.items[0].volumeInfo) return null;

        const volumeInfo = data.items[0].volumeInfo;
        const imageLinks = volumeInfo.imageLinks || {};
        const cover = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
        if (!cover) return null;

        return {
            cover: cover.replace('http://', 'https://'),
            title: volumeInfo.title || '',
            author: Array.isArray(volumeInfo.authors) ? volumeInfo.authors.join(' / ') : '',
            source: 'Google Books'
        };
    }

    async function fetchBookByIsbn(isbn) {
        const fromOpenBD = await fetchCoverFromOpenBD(isbn);
        if (fromOpenBD) return fromOpenBD;

        return fetchCoverFromGoogleBooks(isbn);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const inputTitle = titleInput.value.trim();
        const inputAuthor = authorInput.value.trim();
        const normalizedIsbn = normalizeIsbn(isbnInput.value);

        if (!inputTitle || !inputAuthor) {
            setMessage('タイトルと著者は必須です。', true);
            return;
        }

        if (!isValidIsbn(normalizedIsbn)) {
            setMessage('ISBNは10桁または13桁で入力してください。', true);
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = '取得中...';
        }
        setMessage('書影を取得しています...');

        try {
            const book = await fetchBookByIsbn(normalizedIsbn);
            if (!book || !book.cover) {
                applyBookData(inputTitle, inputAuthor, normalizedIsbn, '');
                setMessage('書影が見つかりませんでした。ISBNまたは取得元を確認してください。', true);
                return;
            }

            applyBookData(inputTitle, inputAuthor, normalizedIsbn, book.cover);
            setMessage(`表示を更新しました（書影取得元: ${book.source}）。`);
        } catch (error) {
            applyBookData(inputTitle, inputAuthor, normalizedIsbn, '');
            setMessage('書影取得に失敗しました。ネットワークまたはAPIの状態を確認してください。', true);
            console.error(error);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = defaultButtonText;
            }
        }
    });
}

// =============================================
// microCMS Content Loader
// =============================================
async function initMicroCMSContent() {
    const config = getMicroCMSConfig();
    if (!config) {
        setCMSStatus('home', 'CMS未接続のため、固定表示を使用しています。');
        setCMSStatus('detail', 'CMS未接続のため、固定表示を使用しています。');
        return;
    }

    try {
        const latestBook = await fetchLatestBookFromMicroCMS(config);
        if (!latestBook) {
            setCMSStatus('home', 'CMSからデータを取得できませんでした。固定表示を使用しています。');
            setCMSStatus('detail', 'CMSからデータを取得できませんでした。固定表示を使用しています。');
            return;
        }

        const missingFields = validateRequiredBookFields(latestBook);
        if (missingFields.length > 0) {
            const message = `CMS必須項目不足: ${missingFields.join(', ')}`;
            setCMSStatus('home', `${message}（固定表示を維持）`, true);
            setCMSStatus('detail', `${message}（固定表示を維持）`, true);
            return;
        }

        applyMicroCMSBookToHome(latestBook);
        applyMicroCMSBookToDetail(latestBook);
        setCMSStatus('home', 'CMSの最新データを反映中');
        setCMSStatus('detail', 'CMSの最新データを反映中');
    } catch (error) {
        setCMSStatus('home', 'CMS取得エラーのため固定表示を使用しています。', true);
        setCMSStatus('detail', 'CMS取得エラーのため固定表示を使用しています。', true);
        console.error('microCMS fetch failed:', error);
    }
}

function getMicroCMSConfig() {
    const serviceDomain = String(window.MICROCMS_SERVICE_DOMAIN || '').trim();
    const apiKey = String(window.MICROCMS_API_KEY || '').trim();
    const endpoint = String(window.MICROCMS_ENDPOINT || 'books').trim();
    const query = String(window.MICROCMS_QUERY || 'limit=1&orders=-publishedAt').trim();

    if (!serviceDomain || !apiKey) return null;
    if (serviceDomain.includes('YOUR_SERVICE_DOMAIN') || apiKey.includes('YOUR_READ_ONLY_API_KEY')) return null;
    if (!/^[a-z0-9-]+$/i.test(serviceDomain)) return null;
    if (!/^[a-z0-9-_]+$/i.test(endpoint)) return null;

    return { serviceDomain, apiKey, endpoint, query };
}

function initMicroCMSSetupPanel() {
    const panel = document.getElementById('microcms-setup-panel');
    const form = document.getElementById('microcms-setup-form');
    if (!panel || !form) return;

    const domainInput = document.getElementById('microcms-service-domain');
    const keyInput = document.getElementById('microcms-api-key');
    const messageEl = document.getElementById('microcms-setup-message');
    if (!domainInput || !keyInput) return;

    const hasConfig = Boolean(getMicroCMSConfig());
    panel.hidden = hasConfig;
    if (hasConfig) return;

    if (window.MICROCMS_SERVICE_DOMAIN) domainInput.value = window.MICROCMS_SERVICE_DOMAIN;
    if (window.MICROCMS_API_KEY) keyInput.value = window.MICROCMS_API_KEY;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const domain = String(domainInput.value || '').trim();
        const key = String(keyInput.value || '').trim();

        if (!/^[a-z0-9-]+$/i.test(domain)) {
            if (messageEl) messageEl.textContent = 'Service Domainは英数字とハイフンのみで入力してください。';
            return;
        }
        if (key.length < 20) {
            if (messageEl) messageEl.textContent = 'API Keyが短すぎます。Read onlyキーを確認してください。';
            return;
        }

        if (window.localStorage) {
            window.localStorage.setItem('microcms_service_domain', domain);
            window.localStorage.setItem('microcms_api_key', key);
        }
        if (messageEl) messageEl.textContent = '保存しました。ページを再読み込みします。';
        setTimeout(() => {
            window.location.reload();
        }, 500);
    });
}

async function fetchLatestBookFromMicroCMS(config) {
    const apiUrl = `https://${config.serviceDomain}.microcms.io/api/v1/${config.endpoint}?${config.query}`;
    const response = await fetch(apiUrl, {
        headers: {
            'X-MICROCMS-API-KEY': config.apiKey
        }
    });
    if (!response.ok) {
        throw new Error(`microCMS response ${response.status}`);
    }

    const payload = await response.json();
    if (!payload) return null;

    // List API: { contents: [...] } / Object API: { ... }
    if (Array.isArray(payload.contents)) {
        return payload.contents[0] || null;
    }
    return payload;
}

function applyMicroCMSBookToHome(book) {
    const titleEl = document.getElementById('home-book-title');
    if (!titleEl) return;

    const weekNumberEl = document.getElementById('home-week-number');
    const weekDateEl = document.getElementById('home-week-date');
    const categoryEl = document.getElementById('home-book-category');
    const authorEl = document.getElementById('home-book-author');
    const quoteEl = document.getElementById('home-book-quote');
    const descriptionEl = document.getElementById('home-book-description');
    const coverEl = document.getElementById('home-book-cover');
    const amazonEl = document.getElementById('buy-amazon');
    const rakutenEl = document.getElementById('buy-rakuten');

    const title = firstNonEmpty(book.title, book.bookTitle);
    const author = firstNonEmpty(book.author, book.bookAuthor);
    const category = firstNonEmpty(book.category, book.genre);
    const quote = firstNonEmpty(book.quote, book.catchCopy);
    const description = firstNonEmpty(book.description, book.summary, book.body);
    const weekLabel = firstNonEmpty(book.weekLabel, book.week, book.weekNumber);
    const weekDate = firstNonEmpty(book.weekDate, book.dateRange);
    const coverUrl = resolveImageUrl(book);

    setTextIfValue(titleEl, title);
    setTextIfValue(authorEl, author);
    setTextIfValue(categoryEl, category);
    setTextIfValue(quoteEl, quote);
    setTextIfValue(weekNumberEl, weekLabel);
    setTextIfValue(weekDateEl, weekDate);
    setDescriptionParagraphs(descriptionEl, description);
    setImageIfSafe(coverEl, coverUrl, title ? `今週の一冊: ${title}` : '');
    setLinkIfSafe(amazonEl, firstNonEmpty(book.amazonUrl, book.amazon_link));
    setLinkIfSafe(rakutenEl, firstNonEmpty(book.rakutenUrl, book.rakuten_link));
    setAffiliateLinkMeta(amazonEl, 'amazon', title);
    setAffiliateLinkMeta(rakutenEl, 'rakuten', title);
}

function applyMicroCMSBookToDetail(book) {
    const titleEl = document.getElementById('book-title-display');
    if (!titleEl) return;

    const weekEl = document.getElementById('detail-week-number');
    const categoryEl = document.getElementById('detail-book-category');
    const authorEl = document.getElementById('book-author-display');
    const quoteEl = document.getElementById('detail-book-quote');
    const descriptionEl = document.getElementById('detail-book-description');
    const coverEl = document.getElementById('book-cover-image');
    const amazonEl = document.getElementById('detail-buy-amazon');
    const rakutenEl = document.getElementById('detail-buy-rakuten');
    const metaDescription = document.querySelector('meta[name="description"]');

    const title = firstNonEmpty(book.title, book.bookTitle);
    const author = firstNonEmpty(book.author, book.bookAuthor);
    const category = firstNonEmpty(book.category, book.genre);
    const quote = firstNonEmpty(book.quote, book.catchCopy);
    const description = firstNonEmpty(book.description, book.summary, book.body);
    const weekLabel = firstNonEmpty(book.weekLabel, book.week, book.weekNumber);
    const coverUrl = resolveImageUrl(book);

    setTextIfValue(titleEl, title);
    setTextIfValue(authorEl, author);
    setTextIfValue(categoryEl, category);
    setTextIfValue(quoteEl, quote);
    setTextIfValue(weekEl, weekLabel);
    setDescriptionParagraphs(descriptionEl, description);
    setImageIfSafe(coverEl, coverUrl, title ? `今週の一冊: ${title}` : '');
    setLinkIfSafe(amazonEl, firstNonEmpty(book.amazonUrl, book.amazon_link));
    setLinkIfSafe(rakutenEl, firstNonEmpty(book.rakutenUrl, book.rakuten_link));
    setAffiliateLinkMeta(amazonEl, 'amazon', title);
    setAffiliateLinkMeta(rakutenEl, 'rakuten', title);

    if (title) {
        document.title = `${title} | 週読`;
        if (metaDescription) {
            metaDescription.setAttribute('content', `${weekLabel || '今週'}の一冊：${title}${author ? `。著者：${author}` : ''}`);
        }
    }
}

function validateRequiredBookFields(book) {
    const required = [
        ['title', firstNonEmpty(book.title, book.bookTitle)],
        ['author', firstNonEmpty(book.author, book.bookAuthor)],
        ['category', firstNonEmpty(book.category, book.genre)],
        ['quote', firstNonEmpty(book.quote, book.catchCopy)],
        ['description', firstNonEmpty(book.description, book.summary, book.body)],
        ['coverImage', resolveImageUrl(book)],
        ['amazonUrl', firstNonEmpty(book.amazonUrl, book.amazon_link)],
        ['rakutenUrl', firstNonEmpty(book.rakutenUrl, book.rakuten_link)],
        ['weekLabel', firstNonEmpty(book.weekLabel, book.week, book.weekNumber)]
    ];
    return required.filter((entry) => !entry[1]).map((entry) => entry[0]);
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function resolveImageUrl(book) {
    if (book.coverImage && typeof book.coverImage === 'object' && typeof book.coverImage.url === 'string') {
        return book.coverImage.url;
    }
    if (typeof book.cover === 'string') return book.cover;
    if (typeof book.image === 'string') return book.image;
    if (book.image && typeof book.image === 'object' && typeof book.image.url === 'string') {
        return book.image.url;
    }
    return '';
}

function setTextIfValue(target, value) {
    if (!target || !value) return;
    target.textContent = value;
}

function setImageIfSafe(target, url, alt) {
    if (!target || !url) return;
    if (!/^https:\/\//i.test(url)) return;
    target.src = url;
    if (alt) target.alt = alt;
}

function setLinkIfSafe(target, url) {
    if (!target || !url) return;
    if (!/^https:\/\//i.test(url)) return;
    target.href = url;
}

function setAffiliateLinkMeta(target, platform, title) {
    if (!target) return;
    target.dataset.trackType = 'affiliate';
    target.dataset.platform = platform;
    if (title) target.dataset.bookTitle = title;
}

function setCMSStatus(scope, message, isError = false) {
    const id = scope === 'detail' ? 'detail-cms-status' : 'home-cms-status';
    const target = document.getElementById(id);
    if (!target) return;
    target.hidden = false;
    target.textContent = message;
    target.style.color = isError ? '#B00020' : 'var(--color-text-muted)';
}

function setDescriptionParagraphs(container, value) {
    if (!container || !value) return;
    const lines = String(value)
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) return;

    container.innerHTML = '';
    lines.forEach((line) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        container.appendChild(paragraph);
    });
}

// =============================================
// Smooth Scroll
// =============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                const navHeight = document.querySelector('.nav').offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// =============================================
// Scroll Animations
// =============================================
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // セクションをオブザーブ
    document.querySelectorAll('.newsletter, .about, .archive').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
        observer.observe(section);
    });
}

// アニメーション用のCSSクラスを動的に追加
const style = document.createElement('style');
style.textContent = `
    .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }
`;
document.head.appendChild(style);
