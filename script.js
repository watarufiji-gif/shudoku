// =============================================
// 週読 - JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    initCountdown();
    initNewsletterForm();
    initAuthForms();
    initReadingDatabasePage();
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

    if (!loginForm && !registerForm && oauthButtons.length === 0) return;

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

    if (oauthButtons.length > 0) {
        oauthButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const provider = button.getAttribute('data-oauth-provider');
                if (!provider) return;
                handleOAuthSignIn(provider, supabase);
            });
        });
    }
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

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
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

    setAuthMessage('register-message', '登録完了。確認メールをチェックしてからログインしてください。');
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

    const { data: userData } = await supabase.auth.getUser();
    const user = userData ? userData.user : null;
    if (!user) {
        if (loginRequired) loginRequired.hidden = false;
        if (content) content.hidden = true;
        if (userLabel) userLabel.textContent = '';
        return;
    }

    if (loginRequired) loginRequired.hidden = true;
    if (content) content.hidden = false;
    if (userLabel) {
        const displayName = user.user_metadata && user.user_metadata.display_name
            ? user.user_metadata.display_name
            : user.email;
        userLabel.textContent = `${displayName} さんの記録`;
    }

    await renderReadingEntries(supabase, user.id, list, count);

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const title = String(formData.get('title') || '').trim();
            const author = String(formData.get('author') || '').trim();
            const status = String(formData.get('status') || '').trim();
            const completedOn = String(formData.get('completedOn') || '').trim() || null;
            const ratingRaw = String(formData.get('rating') || '').trim();
            const rating = ratingRaw ? Number(ratingRaw) : null;
            const note = String(formData.get('note') || '').trim() || null;

            const { error } = await supabase.from('reading_entries').insert({
                user_id: user.id,
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
            await renderReadingEntries(supabase, user.id, list, count);
        });
    }

    if (list) {
        list.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.reading-delete');
            if (!deleteButton) return;

            const entryId = deleteButton.getAttribute('data-entry-id');
            if (!entryId) return;

            const { error } = await supabase
                .from('reading_entries')
                .delete()
                .eq('id', entryId)
                .eq('user_id', user.id);

            if (error) {
                if (message) message.textContent = `削除に失敗しました: ${error.message}`;
                return;
            }
            await renderReadingEntries(supabase, user.id, list, count);
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
    if (!window._supabaseClient) {
        window._supabaseClient = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
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

// =============================================
// Analytics Tracking (Optional)
// 購入ボタンのクリックをトラッキング
// =============================================
document.addEventListener('click', (e) => {
    const buyButton = e.target.closest('#buy-button');
    if (buyButton) {
        // Google Analyticsなどでトラッキング
        if (typeof gtag !== 'undefined') {
            gtag('event', 'click', {
                'event_category': 'CTA',
                'event_label': 'Amazon Purchase Button',
                'value': 1
            });
        }
        console.log('Purchase button clicked - Track this event');
    }
});
