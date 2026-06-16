/* ═══════════════════════════════════════════════════════════════ */
/*  WebAnalytics — Client-side Application Logic                  */
/* ═══════════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────
//  STATE
// ──────────────────────────────────────────────
const state = {
  currentPage: 'home',
  gaPageViews: 0,
  gaEvents: 0,
  sessionStart: Date.now(),
  pagesVisited: new Set(['home']),
};

// ──────────────────────────────────────────────
//  NAVIGATION (SPA)
// ──────────────────────────────────────────────
function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  // Update nav links
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
  const activeLink = document.getElementById('nav-' + page);
  if (activeLink) activeLink.classList.add('active');

  // Close mobile menu
  document.getElementById('mobile-menu').classList.remove('open');

  // Track page view
  state.currentPage = page;
  state.pagesVisited.add(page);
  state.gaPageViews++;

  // Fire GA pageview
  if (typeof gtag === 'function') {
    gtag('event', 'page_view', {
      page_title: page.charAt(0).toUpperCase() + page.slice(1),
      page_location: window.location.origin + '/' + page,
    });
  }

  // Log to GA simulation
  addGAEvent('page_view', 'Navigated to: ' + page);

  // Update GA stats
  updateGAStats();

  // Load page-specific data
  if (page === 'dashboard') {
    loadServerLogs();
    loadBrowserData();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

// ──────────────────────────────────────────────
//  GOOGLE ANALYTICS SIMULATION
// ──────────────────────────────────────────────
window.gaSimLog = function (category, action, label) {
  state.gaEvents++;
  addGAEvent(action, `${category}: ${label}`);
  updateGAStats();
};

function addGAEvent(type, detail) {
  const log = document.getElementById('ga-event-log');
  if (!log) return;

  const now = new Date();
  const time = now.toTimeString().split(' ')[0];

  const el = document.createElement('div');
  el.className = 'ga-event';
  el.innerHTML = `
    <span class="ga-event-time">${time}</span>
    <span class="ga-event-badge">${type}</span>
    <span class="ga-event-detail">${detail}</span>
  `;

  // Remove placeholder
  const placeholder = log.querySelector('.ga-event');
  if (placeholder && placeholder.querySelector('.ga-event-detail')?.textContent.includes('Waiting')) {
    log.innerHTML = '';
  }

  log.prepend(el);

  // Keep max 30 entries
  while (log.children.length > 30) {
    log.removeChild(log.lastChild);
  }
}

function updateGAStats() {
  const pvEl = document.getElementById('ga-pageviews');
  const evEl = document.getElementById('ga-events');
  const stEl = document.getElementById('ga-session-time');
  const ppEl = document.getElementById('ga-pages-per-session');

  if (pvEl) pvEl.textContent = state.gaPageViews;
  if (evEl) evEl.textContent = state.gaEvents;

  const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
  if (stEl) {
    if (elapsed < 60) stEl.textContent = elapsed + 's';
    else stEl.textContent = Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's';
  }

  if (ppEl) ppEl.textContent = state.pagesVisited.size;
}

// Update session timer every second
setInterval(updateGAStats, 1000);

// ──────────────────────────────────────────────
//  SERVER LOGS
// ──────────────────────────────────────────────
async function loadServerLogs() {
  try {
    // Load access logs
    const accessRes = await fetch('/api/logs/access');
    const accessData = await accessRes.json();

    const logViewer = document.getElementById('access-log-viewer');
    if (logViewer) {
      if (accessData.logs.length === 0) {
        logViewer.innerHTML = '<p class="log-placeholder">No access logs yet. Navigate the site to generate logs.</p>';
      } else {
        logViewer.innerHTML = accessData.logs
          .map((line) => `<div class="log-line">${escapeHtml(line)}</div>`)
          .join('');
        logViewer.scrollTop = logViewer.scrollHeight;
      }
    }

    // Load detailed logs
    const detailedRes = await fetch('/api/logs/detailed');
    const detailedData = await detailedRes.json();

    const tbody = document.getElementById('detailed-log-body');
    if (tbody) {
      if (detailedData.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="log-placeholder">No detailed logs yet.</td></tr>';
      } else {
        // Filter to page requests only (not API or static assets)
        const pageLogs = detailedData.logs.filter(
          (l) => !l.url.startsWith('/api/') && !l.url.endsWith('.css') && !l.url.endsWith('.js') && !l.url.endsWith('.ico')
        );

        tbody.innerHTML = detailedData.logs
          .slice(-25)
          .reverse()
          .map((l) => {
            const time = new Date(l.timestamp).toLocaleTimeString();
            const statusClass = l.statusCode < 400 ? 'color: var(--accent-green)' : 'color: var(--accent-red)';
            return `<tr>
              <td style="font-family: var(--font-mono); font-size: 0.78rem;">${time}</td>
              <td><span style="color: var(--accent-cyan)">${l.method}</span></td>
              <td style="font-family: var(--font-mono); font-size: 0.78rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(l.url)}</td>
              <td style="${statusClass}; font-weight: 600;">${l.statusCode}</td>
              <td style="font-family: var(--font-mono);">${l.responseTime}</td>
              <td>${escapeHtml(l.browser || '-')}</td>
              <td>${escapeHtml(l.os || '-')}</td>
            </tr>`;
          })
          .join('');

        // Update stats
        updateServerStats(detailedData.logs);
      }
    }
  } catch (err) {
    console.error('Failed to load server logs:', err);
  }
}

function updateServerStats(logs) {
  const totalEl = document.getElementById('stat-total-requests');
  const urlsEl = document.getElementById('stat-unique-urls');
  const avgEl = document.getElementById('stat-avg-response');
  const errEl = document.getElementById('stat-error-rate');

  if (totalEl) totalEl.textContent = logs.length;

  const urls = new Set(logs.map((l) => l.url));
  if (urlsEl) urlsEl.textContent = urls.size;

  const times = logs.map((l) => parseInt(l.responseTime)).filter((t) => !isNaN(t));
  if (avgEl && times.length > 0) {
    avgEl.textContent = Math.round(times.reduce((a, b) => a + b, 0) / times.length) + 'ms';
  }

  const errors = logs.filter((l) => l.statusCode >= 400).length;
  if (errEl) {
    errEl.textContent = logs.length > 0 ? Math.round((errors / logs.length) * 100) + '%' : '0%';
  }
}

async function clearLogs() {
  try {
    await fetch('/api/logs/clear');
    loadServerLogs();
  } catch (err) {
    console.error('Failed to clear logs:', err);
  }
}

// ──────────────────────────────────────────────
//  BROWSER DATA (Dev Tools Simulation)
// ──────────────────────────────────────────────
function loadBrowserData() {
  const grid = document.getElementById('browser-data-grid');
  if (!grid) return;

  const data = [
    { label: 'User Agent', value: navigator.userAgent },
    { label: 'Platform', value: navigator.platform || navigator.userAgentData?.platform || 'N/A' },
    { label: 'Language', value: navigator.language },
    { label: 'Languages', value: navigator.languages?.join(', ') || 'N/A' },
    { label: 'Cookies Enabled', value: navigator.cookieEnabled ? 'Yes' : 'No' },
    { label: 'Online Status', value: navigator.onLine ? 'Online ✅' : 'Offline ❌' },
    { label: 'Screen Resolution', value: `${screen.width} × ${screen.height}` },
    { label: 'Window Size', value: `${window.innerWidth} × ${window.innerHeight}` },
    { label: 'Device Pixel Ratio', value: window.devicePixelRatio },
    { label: 'Color Depth', value: screen.colorDepth + '-bit' },
    { label: 'Timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { label: 'Timezone Offset', value: 'UTC' + (new Date().getTimezoneOffset() > 0 ? '-' : '+') + Math.abs(new Date().getTimezoneOffset() / 60) },
    { label: 'Connection Type', value: navigator.connection?.effectiveType || 'N/A' },
    { label: 'Hardware Concurrency', value: navigator.hardwareConcurrency || 'N/A' },
    { label: 'Max Touch Points', value: navigator.maxTouchPoints },
    { label: 'Do Not Track', value: navigator.doNotTrack || 'N/A' },
    { label: 'Cookies (document)', value: document.cookie || '(empty)' },
    { label: 'Local Storage Keys', value: Object.keys(localStorage).length + ' keys' },
    { label: 'Referrer', value: document.referrer || 'Direct' },
    { label: 'Page Load Time', value: Math.round(performance.now()) + 'ms' },
  ];

  // Add performance navigation timing
  if (performance.getEntriesByType) {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      data.push({ label: 'DOM Content Loaded', value: Math.round(nav.domContentLoadedEventEnd) + 'ms' });
      data.push({ label: 'DNS Lookup', value: Math.round(nav.domainLookupEnd - nav.domainLookupStart) + 'ms' });
      data.push({ label: 'TCP Connect', value: Math.round(nav.connectEnd - nav.connectStart) + 'ms' });
      data.push({ label: 'Response Time', value: Math.round(nav.responseEnd - nav.responseStart) + 'ms' });
    }
  }

  grid.innerHTML = data
    .map(
      (d) => `
      <div class="browser-data-item">
        <div class="browser-data-label">${escapeHtml(d.label)}</div>
        <div class="browser-data-value">${escapeHtml(String(d.value))}</div>
      </div>
    `
    )
    .join('');
}

// ──────────────────────────────────────────────
//  DASHBOARD TABS
// ──────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.dash-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  const tabEl = document.getElementById('tab-' + tab);
  const contentEl = document.getElementById('content-' + tab);

  if (tabEl) tabEl.classList.add('active');
  if (contentEl) contentEl.classList.add('active');

  // Track tab switch
  trackEvent('Dashboard', 'tab_switch', tab);
}

// ──────────────────────────────────────────────
//  FORM HANDLING
// ──────────────────────────────────────────────
function handleFormSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const data = {};
  formData.forEach((v, k) => (data[k] = v));

  trackEvent('Form', 'submit', 'Contact Form');

  // Show success feedback
  const btn = form.querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;
  btn.innerHTML = '✅ Sent Successfully!';
  btn.style.background = 'var(--accent-green)';

  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.background = '';
    form.reset();
  }, 2500);
}

// ──────────────────────────────────────────────
//  UTILITIES
// ──────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ──────────────────────────────────────────────
//  INITIALIZATION
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Log initial page view
  state.gaPageViews = 1;
  state.gaEvents = 0;
  addGAEvent('page_view', 'Initial page load: home');
  updateGAStats();

  // Track scroll events (debounced)
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const pct = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );
      if (pct > 50) {
        trackEvent('Engagement', 'scroll', pct + '%');
      }
    }, 500);
  });

  // Track time on page
  setTimeout(() => {
    trackEvent('Engagement', 'time_on_page', '30s');
  }, 30000);

  // Store visit in localStorage for dev tools demo
  const visits = parseInt(localStorage.getItem('wa_visits') || '0') + 1;
  localStorage.setItem('wa_visits', visits);
  localStorage.setItem('wa_last_visit', new Date().toISOString());
  localStorage.setItem('wa_session_start', state.sessionStart.toString());

  console.log(
    '%c🔍 Web Analytics Comparison Project',
    'color: #8b5cf6; font-size: 16px; font-weight: bold;'
  );
  console.log(
    '%cOpen the Network, Application, and Console tabs to see data collected by Browser Developer Tools.',
    'color: #06b6d4; font-size: 12px;'
  );
  console.log('Visit count:', visits);
  console.log('Session ID:', state.sessionStart);
  console.log('User Agent:', navigator.userAgent);
  console.log('Screen:', screen.width + 'x' + screen.height);
  console.log('Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
});
