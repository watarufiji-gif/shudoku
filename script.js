// =============================================
// 週読 - JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    if (enforcePrivateAuthPages()) return;
    initNavLogoAsset();
    initRemainingWeeksBadge();
    initCurrentWeekBadge();
    initSupabaseSetupPanel();
    initMicroCMSSetupPanel();
    initAnalytics();
    initAffiliateTracking();
    initMicroCMSContentAutoRefresh();
    initCountdown();
    initNewsletterForm();
    initAuthForms();
    initReadingDatabasePage();
    initBookMetadataEditor();
    initSmoothScroll();
    initScrollAnimations();
});

const CMS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const WEEK_DATE_REFRESH_INTERVAL_MS = 60 * 1000;
let latestMicroCMSBook = null;

function initNavLogoAsset() {
    const probe = new Image();
    probe.onload = () => {
        document.documentElement.classList.add('has-brand-logo');
    };
    probe.onerror = () => {
        document.documentElement.classList.remove('has-brand-logo');
    };
    probe.src = 'assets/shudoku-logo.png';
}

function isAuthPagesPublicEnabled() {
    return window.AUTH_PAGES_PUBLIC_ENABLED === true;
}

function enforcePrivateAuthPages() {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const privatePages = new Set(['login.html', 'my-library.html']);
    if (!privatePages.has(currentPage)) return false;
    if (isAuthPagesPublicEnabled()) return false;
    if (isOperatorMode()) return false;

    window.location.replace('index.html');
    return true;
}

function initRemainingWeeksBadge() {
    const targets = [
        document.getElementById('home-year-remaining'),
        document.getElementById('detail-year-remaining')
    ].filter(Boolean);
    if (targets.length === 0) return;

    const remainingWeeks = getRemainingWeeksInYear();
    const label = remainingWeeks > 0
        ? `今年あと${remainingWeeks}週`
        : '今年最後の一冊';

    targets.forEach((target) => {
        target.textContent = label;
    });
}

function initCurrentWeekBadge() {
    applyCurrentWeekBadge();

    window.setInterval(() => {
        if (document.hidden) return;
        if (latestMicroCMSBook) return;
        applyCurrentWeekBadge();
    }, WEEK_DATE_REFRESH_INTERVAL_MS);
}

function applyCurrentWeekBadge() {
    const weekNumber = getCurrentWeekNumberJst();
    const weekLabel = `第${weekNumber}週`;
    const start = getCurrentWeeklyBaseDateJst();
    const end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));
    const weekDate = `${formatJpDate(start)}〜${formatJpDate(end)}`;

    const homeWeekNumberEl = document.getElementById('home-week-number');
    const homeWeekDateEl = document.getElementById('home-week-date');
    const detailWeekNumberEl = document.getElementById('detail-week-number');

    setTextIfValue(homeWeekNumberEl, weekLabel);
    setTextIfValue(homeWeekDateEl, weekDate);
    setTextIfValue(detailWeekNumberEl, weekLabel);
}

function getCurrentWeekNumberJst() {
    const dayMs = 24 * 60 * 60 * 1000;
    const baseDate = toJstDateOnly(getCurrentWeeklyBaseDateJst());
    const currentYear = baseDate.getUTCFullYear();
    const firstSaturday = new Date(Date.UTC(currentYear, 0, 1));
    const offsetToSaturday = (6 - firstSaturday.getUTCDay() + 7) % 7;
    firstSaturday.setUTCDate(firstSaturday.getUTCDate() + offsetToSaturday);

    const diffMs = baseDate.getTime() - firstSaturday.getTime();
    if (diffMs < 0) return 1;
    return Math.floor(diffMs / (7 * dayMs)) + 1;
}

function getRemainingWeeksInYear() {
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);

    const daysUntilSaturday = (6 - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + daysUntilSaturday);

    // 土曜の更新時間（9:00）を過ぎていれば、次週分からカウント
    if (now.getDay() === 6 && now.getHours() >= 9) {
        cursor.setDate(cursor.getDate() + 7);
    }

    let count = 0;
    while (cursor <= endOfYear) {
        count += 1;
        cursor.setDate(cursor.getDate() + 7);
    }
    return count;
}

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
        setAuthMessage('register-message', '現在、新規登録機能は準備中です。しばらくしてからお試しください。');
        setAuthMessage('login-message', '現在、ログイン機能は準備中です。しばらくしてからお試しください。');
        disableFormControls(loginForm);
        disableFormControls(registerForm);
        activeOAuthButtons.forEach((button) => {
            button.disabled = true;
        });
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

function disableFormControls(form) {
    if (!form) return;
    form.querySelectorAll('input, select, button, textarea').forEach((element) => {
        element.disabled = true;
    });
}

function isOperatorMode() {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get('admin');
    if (adminParam === '1') {
        if (window.localStorage) window.localStorage.setItem('operator_mode', '1');
        return true;
    }
    if (adminParam === '0') {
        if (window.localStorage) window.localStorage.removeItem('operator_mode');
        return false;
    }

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;

    return Boolean(window.localStorage && window.localStorage.getItem('operator_mode') === '1');
}

function ensureOperatorToolsVisible() {
    const wrapper = document.getElementById('operator-tools');
    if (!wrapper) return false;
    if (!isOperatorMode()) {
        wrapper.hidden = true;
        return false;
    }
    wrapper.hidden = false;
    return true;
}

function initSupabaseSetupPanel() {
    const panel = document.getElementById('supabase-setup-panel');
    const form = document.getElementById('supabase-setup-form');
    if (!panel || !form) return;
    if (!ensureOperatorToolsVisible()) return;

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
            loginRequired.innerHTML = '<p>現在この機能は準備中です。公開までお待ちください。</p>';
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
    document.querySelectorAll('a[href*="amazon.co.jp"]').forEach((link) => {
        if (!link.dataset.platform) {
            if (link.href.includes('amazon.co.jp')) link.dataset.platform = 'amazon';
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
        const shouldStoreLocal = isOperatorMode() && window.localStorage && window.localStorage.getItem('enable_local_affiliate_stats') === '1';

        if (shouldStoreLocal) {
            saveAffiliateClick({
                platform,
                page,
                bookTitle,
                href,
                at: new Date().toISOString()
            });
        }

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
    if (!ensureOperatorToolsVisible()) return;

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
    if (!isOperatorMode()) {
        form.hidden = true;
        return;
    }
    form.hidden = false;

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

        if (coverUrl && isOfficialImageUrl(coverUrl)) {
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
        latestMicroCMSBook = null;
        setCMSStatus('home', 'CMS未接続のため、固定表示を使用しています。');
        setCMSStatus('detail', 'CMS未接続のため、固定表示を使用しています。');
        renderArchiveLists([]);
        return null;
    }

    try {
        const books = await fetchBooksFromMicroCMS(config);
        const latestBook = books[0] || null;

        if (!latestBook) {
            latestMicroCMSBook = null;
            setCMSStatus('home', 'CMSからデータを取得できませんでした。固定表示を使用しています。');
            setCMSStatus('detail', 'CMSからデータを取得できませんでした。固定表示を使用しています。');
            renderArchiveLists([]);
            return null;
        }

        latestMicroCMSBook = latestBook;
        applyMicroCMSBookToHome(latestBook);
        applyMicroCMSBookToDetail(latestBook);
        renderArchiveLists(books);

        const missingFields = validateRequiredBookFields(latestBook);
        if (missingFields.length > 0) {
            const message = `CMS必須項目不足: ${missingFields.join(', ')}（入力済み項目のみ反映）`;
            setCMSStatus('home', message, true);
            setCMSStatus('detail', message, true);
            console.warn('microCMS required fields missing:', missingFields);
            return latestBook;
        }

        setCMSStatus('home', 'CMSの最新データを反映中');
        setCMSStatus('detail', 'CMSの最新データを反映中');
        return latestBook;
    } catch (error) {
        latestMicroCMSBook = null;
        setCMSStatus('home', 'CMS取得エラーのため固定表示を使用しています。', true);
        setCMSStatus('detail', 'CMS取得エラーのため固定表示を使用しています。', true);
        renderArchiveLists([]);
        console.error('microCMS fetch failed:', error);
        return null;
    }
}

function initMicroCMSContentAutoRefresh() {
    initMicroCMSContent();

    // 予約投稿や週切り替えに追従するため、表示中のみ定期再取得する。
    window.setInterval(() => {
        if (document.hidden) return;
        initMicroCMSContent();
    }, CMS_REFRESH_INTERVAL_MS);

    // weekDate未入力時の自動算出表示を、ページを開きっぱなしでも更新する。
    window.setInterval(() => {
        if (!latestMicroCMSBook) return;
        if (document.hidden) return;

        const weekDateEl = document.getElementById('home-week-date');
        if (!weekDateEl) return;
        const weekDate = resolveWeekDateLabel(latestMicroCMSBook);
        setTextIfValue(weekDateEl, weekDate);
    }, WEEK_DATE_REFRESH_INTERVAL_MS);
}

function getMicroCMSConfig() {
    const serviceDomain = String(window.MICROCMS_SERVICE_DOMAIN || '').trim();
    const apiKey = String(window.MICROCMS_API_KEY || '').trim();
    const endpoint = String(window.MICROCMS_ENDPOINT || 'books').trim();
    const query = String(window.MICROCMS_QUERY || 'limit=100&orders=-publishedAt').trim();

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
    if (!ensureOperatorToolsVisible()) return;

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

async function fetchBooksFromMicroCMS(config) {
    const pageSize = 100;
    const firstPayload = await fetchMicroCMSPayload(config, { offset: 0, limit: pageSize });
    if (!firstPayload) return [];

    // Object API: { ... }
    if (!Array.isArray(firstPayload.contents)) {
        return [firstPayload];
    }

    const totalCount = Number(firstPayload.totalCount || firstPayload.contents.length || 0);
    const books = Array.isArray(firstPayload.contents) ? [...firstPayload.contents] : [];
    let offset = books.length;
    const maxFetch = 500;

    while (offset < totalCount && offset < maxFetch) {
        const payload = await fetchMicroCMSPayload(config, { offset, limit: pageSize });
        if (!payload || !Array.isArray(payload.contents) || payload.contents.length === 0) break;
        books.push(...payload.contents);
        offset += payload.contents.length;
    }

    return books
        .filter(isBookPublishedNow)
        .sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
}

async function fetchMicroCMSPayload(config, options) {
    const apiUrl = buildMicroCMSApiUrl(config, options);
    const response = await fetch(apiUrl, {
        headers: {
            'X-MICROCMS-API-KEY': config.apiKey
        }
    });
    if (!response.ok) {
        throw new Error(`microCMS response ${response.status}`);
    }
    return response.json();
}

function buildMicroCMSApiUrl(config, options = {}) {
    const params = new URLSearchParams(config.query || '');
    const limit = Number(options.limit || params.get('limit') || 100);
    const offset = Number(options.offset || 0);

    params.set('limit', String(Math.min(Math.max(limit, 1), 100)));
    params.set('offset', String(Math.max(offset, 0)));
    if (!params.has('orders')) params.set('orders', '-publishedAt');

    // 予約投稿の表示タイミングを安定化するため、公開日時が現在以前のみ取得
    const existingFilters = String(params.get('filters') || '').trim();
    if (!existingFilters) {
        params.set('filters', `publishedAt[less_than]${new Date().toISOString()}`);
    }

    return `https://${config.serviceDomain}.microcms.io/api/v1/${config.endpoint}?${params.toString()}`;
}

function isBookPublishedNow(book) {
    if (!book || !book.publishedAt) return true;
    const publishedAt = new Date(book.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) return true;
    return publishedAt.getTime() <= Date.now();
}

function toTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 0;
    return date.getTime();
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

    const normalized = normalizeBookPayload(book);
    const title = normalized.title;
    const author = normalized.author;
    const category = normalized.category;
    const quote = normalized.quote;
    const description = normalized.description;
    const weekLabel = normalized.weekLabel;
    const weekDate = resolveWeekDateLabel(book);
    const coverUrl = normalized.coverUrl;

    setTextIfValue(titleEl, title);
    setTextIfValue(authorEl, author);
    setTextIfValue(categoryEl, category);
    setTextIfValue(quoteEl, quote);
    setTextIfValue(weekNumberEl, weekLabel);
    setTextIfValue(weekDateEl, weekDate);
    setDescriptionParagraphs(descriptionEl, description);
    const imageApplied = setImageIfSafe(coverEl, coverUrl, title ? `今週の一冊: ${title}` : '');
    if (!imageApplied && coverUrl) {
        setCMSStatus('home', 'coverImageのURL形式またはドメインが許可条件外です。', true);
    }
    setAmazonAffiliateLink(amazonEl, normalized.amazonUrl, 'home');
    setAffiliateLinkMeta(amazonEl, 'amazon', title);
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
    const metaDescription = document.querySelector('meta[name="description"]');

    const normalized = normalizeBookPayload(book);
    const title = normalized.title;
    const author = normalized.author;
    const category = normalized.category;
    const quote = normalized.quote;
    const description = normalized.description;
    const weekLabel = normalized.weekLabel;
    const coverUrl = normalized.coverUrl;

    setTextIfValue(titleEl, title);
    setTextIfValue(authorEl, author);
    setTextIfValue(categoryEl, category);
    setTextIfValue(quoteEl, quote);
    setTextIfValue(weekEl, weekLabel);
    setDescriptionParagraphs(descriptionEl, description);
    const imageApplied = setImageIfSafe(coverEl, coverUrl, title ? `今週の一冊: ${title}` : '');
    if (!imageApplied && coverUrl) {
        setCMSStatus('detail', 'coverImageのURL形式またはドメインが許可条件外です。', true);
    }
    setAmazonAffiliateLink(amazonEl, normalized.amazonUrl, 'detail');
    setAffiliateLinkMeta(amazonEl, 'amazon', title);

    if (title) {
        document.title = `${title} | 週読`;
        if (metaDescription) {
            metaDescription.setAttribute('content', `${weekLabel || '今週'}の一冊：${title}${author ? `。著者：${author}` : ''}`);
        }
    }
}

function renderArchiveLists(books) {
    const allBooks = Array.isArray(books) ? books : [];
    const latestBook = allBooks[0] || null;
    const archiveBooks = allBooks.slice(1);
    const homeGrid = document.getElementById('home-archive-grid');
    const archiveGrid = document.getElementById('archive-page-grid');

    if (homeGrid) {
        const prioritizedHomeBooks = prioritizePreviousWeekBooks(archiveBooks, latestBook);
        renderArchiveItems(homeGrid, prioritizedHomeBooks.slice(0, 6), {
            emptyId: 'home-archive-empty'
        });
    }
    if (archiveGrid) {
        renderArchiveItems(archiveGrid, archiveBooks, {
            emptyId: 'archive-page-empty'
        });
    }
}

function prioritizePreviousWeekBooks(archiveBooks, latestBook) {
    const items = Array.isArray(archiveBooks) ? [...archiveBooks] : [];
    if (items.length <= 1 || !latestBook) return items;

    const latestWeekNumber = getBookWeekNumber(latestBook);
    if (!Number.isFinite(latestWeekNumber) || latestWeekNumber <= 1) return items;

    const targetWeek = latestWeekNumber - 1;
    const previousWeekIndex = items.findIndex((book) => getBookWeekNumber(book) === targetWeek);
    if (previousWeekIndex <= 0) return items;

    const previousWeekBook = items[previousWeekIndex];
    items.splice(previousWeekIndex, 1);
    items.unshift(previousWeekBook);
    return items;
}

function getBookWeekNumber(book) {
    if (!book) return null;
    const normalized = normalizeBookPayload(book);
    const weekLabel = firstNonEmpty(normalized.weekLabel, book.weekLabel, book.week, book.weekNumber);
    if (typeof weekLabel === 'number' && Number.isFinite(weekLabel)) return weekLabel;
    const raw = String(weekLabel || '');
    const match = raw.match(/(\d+)/u);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function renderArchiveItems(container, books, options = {}) {
    if (!container) return;
    const items = Array.isArray(books) ? books : [];
    const emptyEl = options.emptyId ? document.getElementById(options.emptyId) : null;
    const fallbackItems = container.querySelectorAll('[data-fallback="archive-item"]');

    // 動的に生成した項目だけ消す
    container.querySelectorAll('[data-generated="archive-item"]').forEach((node) => {
        node.remove();
    });

    if (items.length === 0) {
        fallbackItems.forEach((node) => {
            node.hidden = false;
        });
        if (emptyEl) emptyEl.hidden = fallbackItems.length > 0;
        return;
    }
    fallbackItems.forEach((node) => {
        node.hidden = true;
    });
    if (emptyEl) emptyEl.hidden = true;

    items.forEach((book, index) => {
        const normalized = normalizeBookPayload(book);
        const title = firstNonEmpty(normalized.title, 'タイトル未設定');
        const author = firstNonEmpty(normalized.author, '著者未設定');
        const weekLabel = firstNonEmpty(
            normalized.weekLabel,
            book.weekNumber ? `第${book.weekNumber}週` : `第${index + 2}週`
        );
        const coverUrl = normalized.coverUrl;
        const detailUrl = firstNonEmpty(book.pageUrl, book.detailUrl, book.url, '#');

        const link = document.createElement('a');
        link.href = /^https?:\/\//i.test(detailUrl) || detailUrl.startsWith('/') || detailUrl === '#'
            ? detailUrl
            : '#';
        link.className = 'archive-item';
        link.setAttribute('data-generated', 'archive-item');

        const img = document.createElement('img');
        img.className = 'archive-cover';
        img.alt = title;
        if (isOfficialImageUrl(coverUrl)) {
            img.src = coverUrl;
        } else {
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        }

        const info = document.createElement('div');
        info.className = 'archive-info';
        info.innerHTML = `
            <span class="archive-week">${escapeHtml(weekLabel)}</span>
            <h3 class="archive-book-title">${escapeHtml(title)}</h3>
            <p class="archive-author">${escapeHtml(author)}</p>
        `;

        link.appendChild(img);
        link.appendChild(info);
        container.appendChild(link);
    });
}

function validateRequiredBookFields(book) {
    const normalized = normalizeBookPayload(book);
    const required = [
        ['title', normalized.title],
        ['author', normalized.author],
        ['category', normalized.category],
        ['quote', normalized.quote],
        ['description', normalized.description],
        ['coverImage', normalized.coverUrl],
        ['AmazonURL', normalizeAmazonAffiliateUrl(normalized.amazonUrl)],
        ['weekLabel', normalized.weekLabel]
    ];
    return required.filter((entry) => !entry[1]).map((entry) => entry[0]);
}

function normalizeBookPayload(book) {
    const rawText = firstNonEmpty(book.description, book.summary, book.body, book.content, book.text);
    const extracted = extractBookMetaFromText(rawText);

    return {
        title: normalizeDisplayText(firstNonEmpty(book.title, book.bookTitle, extracted.title)),
        author: normalizeDisplayText(firstNonEmpty(book.author, book.bookAuthor, extracted.author)),
        category: normalizeDisplayText(firstNonEmpty(book.category, book.genre, extracted.category)),
        quote: normalizeDisplayText(firstNonEmpty(book.quote, book.catchCopy, extracted.quote)),
        description: normalizeBookDescription(firstNonEmpty(book.description, book.summary, book.body, extracted.description)),
        weekLabel: normalizeWeekLabel(firstNonEmpty(book.weekLabel, book.week, book.weekNumber, extracted.weekLabel)),
        amazonUrl: firstNonEmpty(book.AmazonURL, book.amazonUrl, book.amazonURL, book.amazon_link, extracted.amazonUrl),
        coverUrl: resolveImageUrl(book)
    };
}

function extractBookMetaFromText(value) {
    const raw = typeof value === 'string' ? value : '';
    if (!raw.trim()) {
        return { title: '', author: '', category: '', quote: '', description: '', weekLabel: '', amazonUrl: '' };
    }

    const compact = raw.replace(/\r/g, '');
    const pick = (patterns) => {
        for (const pattern of patterns) {
            const m = compact.match(pattern);
            if (m && m[1]) return m[1].trim();
        }
        return '';
    };

    return {
        weekLabel: pick([/(第\s*\d+\s*週)/u]),
        title: pick([/(?:本のタイトル|title)[:：]\s*([^\n]+)/iu]),
        author: pick([/(?:著者名|author)[:：]\s*([^\n]+)/iu]),
        category: pick([/(?:カテゴリ|category)[:：]\s*([^\n]+)/iu]),
        quote: pick([/(?:心に響く一節|quote)[:：]\s*([^\n]+)/iu]),
        amazonUrl: pick([/(?:Amazonリンク|AmazonURL)[:：]\s*(https?:\/\/\S+)/iu]),
        description: pick([/(?:本の紹介|紹介文|description)[:：]\s*([\s\S]+)/iu])
            .replace(/(?:Amazonリンク|AmazonURL)[:：][\s\S]*$/iu, '')
            .trim()
    };
}

function normalizeDisplayText(value) {
    if (typeof value !== 'string') return '';
    const labelPrefix = /^(?:本のタイトル|title|著者名|author|カテゴリ|category|心に響く一節|quote|本の紹介|紹介文|description|Amazonリンク|AmazonURL)\s*[:：]\s*/iu;
    return value
        .replace(/https?:\/\/\S+/giu, '')
        .replace(labelPrefix, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeWeekLabel(value) {
    const raw = normalizeDisplayText(value);
    if (!raw) return '';
    const m = raw.match(/第?\s*(\d+)\s*週?/u);
    if (m && m[1]) return `第${m[1]}週`;
    return raw;
}

function resolveWeekDateLabel(book) {
    const weekLabel = firstNonEmpty(book.weekLabel, book.week, book.weekNumber);
    if (isFirstWeekLabel(weekLabel)) {
        const nowBase = getCurrentWeeklyBaseDateJst();
        const start = getWeekStartSaturdayJst(nowBase);
        const end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));
        return `${formatJpDate(start)}〜${formatJpDate(end)}`;
    }

    const explicit = firstNonEmpty(book.weekDate, book.dateRange);
    if (explicit) return explicit;

    const baseDate = parseCmsDate(book.publishedAt, book.createdAt, book.revisedAt) || getCurrentWeeklyBaseDateJst();
    if (!baseDate) return '';

    const start = getWeekStartSaturdayJst(baseDate);
    const end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));
    return `${formatJpDate(start)}〜${formatJpDate(end)}`;
}

function isFirstWeekLabel(value) {
    if (typeof value !== 'string') return false;
    const normalized = value.replace(/\s+/g, '');
    return normalized === '第1週' || normalized === '1週目' || normalized === '1';
}

function getWeekStartSaturdayJst(date) {
    const dayMs = 24 * 60 * 60 * 1000;
    const jstDateOnly = toJstDateOnly(date);
    const dayOfWeek = jstDateOnly.getUTCDay(); // 0:Sun ... 6:Sat
    const daysFromSaturday = (dayOfWeek + 1) % 7; // Sat:0, Sun:1 ... Fri:6
    return new Date(jstDateOnly.getTime() - (daysFromSaturday * dayMs));
}

function parseCmsDate(...values) {
    for (const value of values) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

function getCurrentWeeklyBaseDateJst() {
    const dayMs = 24 * 60 * 60 * 1000;
    const jstNow = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const jstDateOnly = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()));
    const dayOfWeek = jstDateOnly.getUTCDay(); // 0:Sun ... 6:Sat (JST換算)
    const daysFromSaturday = (dayOfWeek + 1) % 7; // Sat:0, Sun:1 ... Fri:6
    const baseDate = new Date(jstDateOnly.getTime() - (daysFromSaturday * dayMs));

    // 土曜の公開時刻(9:00 JST)までは前週を表示する。
    if (dayOfWeek === 6 && jstNow.getUTCHours() < 9) {
        baseDate.setUTCDate(baseDate.getUTCDate() - 7);
    }

    return baseDate;
}

function toJstDateOnly(date) {
    const jstMs = date.getTime() + (9 * 60 * 60 * 1000);
    const jst = new Date(jstMs);
    return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function formatJpDate(date) {
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function normalizeBookDescription(value) {
    if (typeof value !== 'string') return '';
    const raw = value.trim();
    if (!raw) return '';

    const compact = raw.replace(/\r\n/g, '\n');
    const normalizedLineBreaks = compact
        .replace(/([。！？])\s*(?=[^\s])/g, '$1\n')
        .replace(/\n{3,}/g, '\n\n');

    // テンプレっぽい管理文言は除去
    const bannedLinePatterns = [
        /^第\s*\d+\s*週/u,
        /掲載期間/u,
        /本のタイトル/u,
        /^著者名/u,
        /^カテゴリ/u,
        /表紙画像/u,
        /心に響く一節/u,
        /Amazonリンク/u,
        /https?:\/\/\S+/iu,
        /適当に/u
    ];

    let lines = normalizedLineBreaks
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !bannedLinePatterns.some((pattern) => pattern.test(line)));

    // 「本の紹介: ...」が含まれていたらその後ろを優先
    const introMatch = raw.match(/本の紹介[:：]\s*([\s\S]+)/u);
    if (introMatch && introMatch[1]) {
        const introOnly = introMatch[1]
            .replace(/Amazonリンク[:：][\s\S]*$/u, '')
            .replace(/https?:\/\/\S+/giu, '')
            .trim();
        if (introOnly) {
            lines = introOnly
                .split(/\r?\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .filter((line) => !bannedLinePatterns.some((pattern) => pattern.test(line)));
        }
    }

    if (lines.length === 0) return '';
    return lines.join('\n');
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function resolveImageUrl(book) {
    if (!book || typeof book !== 'object') return '';

    // microCMS image field can be object({url}) or plain string depending on schema/migration.
    const candidates = [
        book.coverImage,
        book.cover_image,
        book.eyecatch,
        book.thumbnail,
        book.cover,
        book.image
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
        if (candidate && typeof candidate === 'object' && typeof candidate.url === 'string' && candidate.url.trim()) {
            return candidate.url.trim();
        }
    }

    const amazonUrl = firstNonEmpty(book.AmazonURL, book.amazonUrl, book.amazonURL, book.amazon_link);
    const amazonCoverUrl = resolveAmazonCoverUrl(amazonUrl);
    if (amazonCoverUrl) return amazonCoverUrl;

    return '';
}

function setTextIfValue(target, value) {
    if (!target || !value) return;
    target.textContent = value;
}

function setImageIfSafe(target, url, alt) {
    if (!target || !url) return false;
    if (!isOfficialImageUrl(url)) return false;
    target.src = url;
    if (alt) target.alt = alt;
    return true;
}

function isOfficialImageUrl(url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch (_) {
        return false;
    }

    if (parsedUrl.protocol !== 'https:') return false;

    const host = parsedUrl.hostname.toLowerCase();
    const allowedHostPatterns = [
        /(^|\.)images\.microcms-assets\.io$/,
        /(^|\.)openbd\.jp$/,
        /(^|\.)books\.google\.com$/,
        /(^|\.)books\.googleusercontent\.com$/,
        /(^|\.)googleusercontent\.com$/,
        /(^|\.)m\.media-amazon\.com$/,
        /(^|\.)images-na\.ssl-images-amazon\.com$/,
        /(^|\.)images-fe\.ssl-images-amazon\.com$/
    ];

    return allowedHostPatterns.some((pattern) => pattern.test(host));
}

function setLinkIfSafe(target, url) {
    if (!target || !url) return;
    if (!/^https:\/\//i.test(url)) return;
    target.href = url;
}

function setAmazonAffiliateLink(target, url, scope) {
    const normalized = normalizeAmazonAffiliateUrl(url);
    if (!target || !normalized) {
        setCMSStatus(scope, 'AmazonURLが無効です（https://www.amazon.co.jp と tag が必要）', true);
        return;
    }
    target.href = normalized;
}

function normalizeAmazonAffiliateUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return '';
    let parsed;
    try {
        parsed = new URL(url.trim());
    } catch (_) {
        return '';
    }

    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    if (host !== 'www.amazon.co.jp' && host !== 'amazon.co.jp') return '';

    const tag = String(parsed.searchParams.get('tag') || '').trim();
    if (!tag || tag === 'YOUR_AMAZON_ID') return '';
    return parsed.toString();
}

function resolveAmazonCoverUrl(amazonUrl) {
    const asin = extractAmazonAsin(amazonUrl);
    if (!asin) return '';
    return `https://m.media-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

function extractAmazonAsin(amazonUrl) {
    if (typeof amazonUrl !== 'string' || !amazonUrl.trim()) return '';

    let parsed;
    try {
        parsed = new URL(amazonUrl.trim());
    } catch (_) {
        return '';
    }

    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set(['www.amazon.co.jp', 'amazon.co.jp']);
    if (!allowedHosts.has(host)) return '';

    const path = parsed.pathname || '';
    const patterns = [
        /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
        /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
        /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
        /\/product-reviews\/([A-Z0-9]{10})(?:[/?]|$)/i,
        /\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i,
        /\/o\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i
    ];

    for (const pattern of patterns) {
        const match = path.match(pattern);
        if (match && match[1]) return match[1].toUpperCase();
    }

    const queryCandidates = [
        parsed.searchParams.get('asin'),
        parsed.searchParams.get('ASIN'),
        parsed.searchParams.get('pd_rd_i')
    ];
    for (const candidate of queryCandidates) {
        const normalized = String(candidate || '').trim().toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(normalized)) return normalized;
    }

    return '';
}

function setAffiliateLinkMeta(target, platform, title) {
    if (!target) return;
    target.dataset.trackType = 'affiliate';
    target.dataset.platform = platform;
    if (title) target.dataset.bookTitle = title;
}

function setCMSStatus(scope, message, isError = false) {
    if (!isOperatorMode()) return;
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
