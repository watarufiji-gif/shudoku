(function () {
  'use strict';

  const API = '/.netlify/functions/admin-stats';
  const PALETTE = {
    gold:        '#C9A962',
    accent:      '#8B7355',
    accentLight: '#C4B49A',
    muted:       '#8A847C',
    border:      '#E0DCD5',
    bg:          '#F6F5F1',
  };

  // ── State ────────────────────────────────────────────────────────────────────
  let charts = {};

  // ── Boot ─────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var savedToken = sessionStorage.getItem('adminToken');
    if (savedToken) {
      showDashboard();
      loadStats(savedToken);
    }

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = document.getElementById('password-input').value;
      attemptLogin(pw);
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
      sessionStorage.removeItem('adminToken');
      location.reload();
    });
  });

  // ── Auth ─────────────────────────────────────────────────────────────────────
  function attemptLogin(password) {
    document.getElementById('login-error').textContent = '';
    fetch(API, { headers: { Authorization: 'Bearer ' + password } })
      .then(function (res) {
        if (res.status === 401) throw new Error('パスワードが正しくありません');
        if (!res.ok)            throw new Error('サーバーエラー (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        sessionStorage.setItem('adminToken', password);
        showDashboard();
        renderAll(data);
      })
      .catch(function (err) {
        document.getElementById('login-error').textContent = err.message;
      });
  }

  function showDashboard() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  }

  // ── Data loading ─────────────────────────────────────────────────────────────
  function loadStats(token) {
    fetch(API, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem('adminToken');
          location.reload();
          return;
        }
        return res.json();
      })
      .then(function (data) {
        if (data) renderAll(data);
      })
      .catch(function (err) {
        console.error('Stats load error:', err);
      });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function renderAll(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dash-content').style.display = 'block';

    var now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    document.getElementById('last-updated').textContent = now + ' 更新 　';

    renderStatCards(data);
    renderGrowthChart(data.growthByWeek || []);
    renderSourceChart(data.sourceBreakdown || []);
    renderCampaignChart(data.campaigns || []);
    renderGenreChart(data.genreTrends || []);
    renderCampaignTable(data.campaigns || []);
  }

  function renderStatCards(data) {
    document.getElementById('stat-total').textContent = data.totalSubscribers ?? '—';
    document.getElementById('stat-campaigns').textContent = data.totalCampaigns ?? (data.campaigns || []).length;

    var latest = (data.campaigns || [])[0];
    if (latest) {
      document.getElementById('stat-open').textContent  = latest.openRate  + '%';
      document.getElementById('stat-click').textContent = latest.clickRate + '%';
      var label = formatDate(latest.sentAt) + '配信';
      document.getElementById('stat-open-sub').textContent  = label;
      document.getElementById('stat-click-sub').textContent = label;
    } else {
      document.getElementById('stat-open').textContent  = '—';
      document.getElementById('stat-click').textContent = '—';
    }
  }

  // ── Charts ───────────────────────────────────────────────────────────────────
  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); }
  }

  function renderGrowthChart(growthByWeek) {
    destroyChart('growth');
    var ctx = document.getElementById('chart-growth').getContext('2d');
    charts.growth = new Chart(ctx, {
      type: 'line',
      data: {
        labels: growthByWeek.map(function (d) { return formatDateShort(d.week); }),
        datasets: [{
          label: '新規購読者',
          data: growthByWeek.map(function (d) { return d.count; }),
          borderColor: PALETTE.accent,
          backgroundColor: 'rgba(139,115,85,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          tension: 0.3,
        }],
      },
      options: chartOptions({ beginAtZero: true }),
    });
  }

  function renderSourceChart(sourceBreakdown) {
    destroyChart('source');
    if (!sourceBreakdown.length) return;
    var ctx = document.getElementById('chart-source').getContext('2d');
    charts.source = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: sourceBreakdown.map(function (d) { return d.source; }),
        datasets: [{
          data: sourceBreakdown.map(function (d) { return d.count; }),
          backgroundColor: [PALETTE.gold, PALETTE.accent, PALETTE.accentLight, PALETTE.muted, '#D4C4A8'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 }, color: PALETTE.muted, padding: 12 },
          },
        },
        cutout: '65%',
      },
    });
  }

  function renderCampaignChart(campaigns) {
    destroyChart('campaign');
    if (!campaigns.length) return;
    var reversed = campaigns.slice().reverse();
    var ctx = document.getElementById('chart-campaigns').getContext('2d');
    charts.campaign = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: reversed.map(function (c) { return formatDateShort(c.sentAt); }),
        datasets: [
          {
            label: '開封率 %',
            data: reversed.map(function (c) { return c.openRate; }),
            backgroundColor: PALETTE.gold,
            borderRadius: 3,
          },
          {
            label: 'クリック率 %',
            data: reversed.map(function (c) { return c.clickRate; }),
            backgroundColor: PALETTE.accent,
            borderRadius: 3,
          },
        ],
      },
      options: chartOptions({ beginAtZero: true, max: 100 }),
    });
  }

  function renderGenreChart(genreTrends) {
    destroyChart('genre');
    if (!genreTrends.length) return;
    var ctx = document.getElementById('chart-genre').getContext('2d');
    charts.genre = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: genreTrends.map(function (d) { return d.category; }),
        datasets: [{
          label: '平均開封率 %',
          data: genreTrends.map(function (d) { return d.avgOpenRate; }),
          backgroundColor: genreTrends.map(function (_, i) {
            return i === 0 ? PALETTE.gold : PALETTE.accentLight;
          }),
          borderRadius: 3,
        }],
      },
      options: chartOptions({ beginAtZero: true, indexAxis: 'y' }),
    });
  }

  // ── Campaign table ────────────────────────────────────────────────────────────
  function renderCampaignTable(campaigns) {
    var tbody = document.getElementById('campaign-table-body');
    if (!campaigns.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">配信履歴がまだありません</td></tr>';
      return;
    }
    tbody.innerHTML = campaigns.map(function (c) {
      var openWidth  = Math.min(c.openRate,  100);
      var clickWidth = Math.min(c.clickRate, 100);
      return '<tr>' +
        '<td>' + formatDate(c.sentAt) + '</td>' +
        '<td>' + esc(c.bookTitle) + '</td>' +
        '<td style="color:var(--muted)">' + esc(c.bookCategory) + '</td>' +
        '<td>' + (c.recipientsCount || '—') + '</td>' +
        '<td>' +
          '<span class="rate-bar" style="width:' + openWidth + 'px"></span>' +
          c.openRate + '%' +
        '</td>' +
        '<td>' +
          '<span class="rate-bar click" style="width:' + clickWidth + 'px"></span>' +
          c.clickRate + '%' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function chartOptions(yOpts) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: yOpts.indexAxis || 'x',
      plugins: {
        legend: {
          labels: { font: { size: 11 }, color: PALETTE.muted },
        },
      },
      scales: {
        x: {
          grid:  { color: PALETTE.border },
          ticks: { color: PALETTE.muted, font: { size: 10 } },
        },
        y: {
          grid:  { color: PALETTE.border },
          ticks: { color: PALETTE.muted, font: { size: 10 } },
          beginAtZero: yOpts.beginAtZero !== false,
          max: yOpts.max,
        },
      },
    };
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
