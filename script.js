// =============================================
// 週読 - JavaScript
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    initCountdown();
    initNewsletterForm();
    initAuthForms();
    initSmoothScroll();
    initScrollAnimations();
});

// =============================================
// Countdown Timer
// 次の日曜日までのカウントダウン
// =============================================
function initCountdown() {
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');

    if (!daysEl || !hoursEl || !minutesEl) return;

    function getNextSunday() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
        
        const nextSunday = new Date(now);
        nextSunday.setDate(now.getDate() + daysUntilSunday);
        nextSunday.setHours(9, 0, 0, 0); // 日曜日の朝9時に更新

        return nextSunday;
    }

    function updateCountdown() {
        const now = new Date();
        const target = getNextSunday();
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
// Auth Forms (Demo: localStorage)
// =============================================
function initAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (!loginForm && !registerForm) return;

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();

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

            const users = getStoredUsers();
            const alreadyExists = users.some((user) => user.email === email);
            if (alreadyExists) {
                setAuthMessage('register-message', 'このメールアドレスはすでに登録済みです。');
                return;
            }

            users.push({
                name,
                email,
                password,
                genre,
                newsletterOptIn,
                createdAt: new Date().toISOString()
            });

            localStorage.setItem('shudokuUsers', JSON.stringify(users));
            setAuthMessage('register-message', '登録が完了しました。続けてログインしてください。');
            registerForm.reset();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(loginForm);
            const email = String(formData.get('email') || '').trim().toLowerCase();
            const password = String(formData.get('password') || '');

            const users = getStoredUsers();
            const matchedUser = users.find((user) => user.email === email && user.password === password);

            if (!matchedUser) {
                setAuthMessage('login-message', 'メールアドレスまたはパスワードが正しくありません。');
                return;
            }

            localStorage.setItem('shudokuSession', JSON.stringify({
                name: matchedUser.name,
                email: matchedUser.email,
                loggedInAt: new Date().toISOString()
            }));

            setAuthMessage('login-message', `${matchedUser.name} さん、ログインしました。`);
            loginForm.reset();
        });
    }
}

function getStoredUsers() {
    try {
        const raw = localStorage.getItem('shudokuUsers');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function setAuthMessage(elementId, message) {
    const target = document.getElementById(elementId);
    if (!target) return;
    target.textContent = message;
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
