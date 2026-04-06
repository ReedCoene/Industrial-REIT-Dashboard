// ── Config ──────────────────────────────────────────────────
const TRACKED = new Set(['CTRE', 'OHI', 'NHI']);
const BIG_MOVE_THRESHOLD = 2.5; // % — triggers alert banner

// ── Helpers ─────────────────────────────────────────────────
function fmtPrice(v) {
  if (v == null) return '—';
  return '$' + Number(v).toFixed(2);
}

function fmtChange(pct) {
  if (pct == null) return { text: '—', cls: 'flat' };
  const sign = pct > 0 ? '+' : '';
  const cls  = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return { text: `${sign}${Number(pct).toFixed(2)}%`, cls };
}

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T';
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M';
  return '$' + v;
}

function fmtYield(v) {
  if (v == null || v === 0) return '—';
  return Number(v).toFixed(2) + '%';
}

function rangeBar(stock) {
  const { price, fifty_two_week_low: low, fifty_two_week_high: high } = stock;
  if (!low || !high || high === low) return '<span class="flat">—</span>';
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  return `
    <div class="range-bar-wrap">
      <span>${fmtPrice(low)}</span>
      <div class="range-bar-track">
        <div class="range-bar-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <span>${fmtPrice(high)}</span>
    </div>`;
}

function timeSince(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600)  return Math.round(diff / 60) + 'm ago';
  if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
  return Math.round(diff / 86400) + 'd ago';
}

// ── Render: Alert Banner ─────────────────────────────────────
function renderAlert(stocks) {
  const big = Object.values(stocks)
    .filter(s => Math.abs(s.pct_change) >= BIG_MOVE_THRESHOLD)
    .sort((a, b) => Math.abs(b.pct_change) - Math.abs(a.pct_change));

  const banner = document.getElementById('alertBanner');
  if (!big.length) { banner.classList.add('hidden'); return; }

  const parts = big.map(s => {
    const { text } = fmtChange(s.pct_change);
    return `<strong>${s.ticker}</strong> ${text}`;
  });
  banner.innerHTML = `<strong>Notable moves today:</strong> ${parts.join(' &nbsp;&bull;&nbsp; ')}`;
  banner.classList.remove('hidden');
}

// ── Render: Movers ───────────────────────────────────────────
function renderMovers(data) {
  const container = document.getElementById('moversRow');
  const all = Object.values(data.stocks).sort((a, b) => b.pct_change - a.pct_change);
  const gainers = all.slice(0, 3);
  const losers  = all.slice(-3).reverse();
  const cards   = [...gainers, ...losers];

  container.innerHTML = cards.map(s => {
    const isGain    = s.pct_change >= 0;
    const cls       = isGain ? 'gain' : 'loss';
    const { text }  = fmtChange(s.pct_change);
    const colorCls  = isGain ? 'up' : 'down';
    const tracked   = TRACKED.has(s.ticker) ? '<div class="tracked-dot" title="Tracked position"></div>' : '';
    return `
      <div class="mover-card ${cls}">
        ${tracked}
        <div class="mover-ticker">${s.ticker}</div>
        <div class="mover-company">${s.name}</div>
        <div class="mover-price">${fmtPrice(s.price)}</div>
        <div class="mover-change ${colorCls}">${text}</div>
      </div>`;
  }).join('');
}

// ── Render: Table ────────────────────────────────────────────
let currentSort = { col: 'pct_change', dir: 'desc' };

function renderTable(stocks) {
  const sorted = Object.values(stocks).sort((a, b) => {
    const dir = currentSort.dir === 'asc' ? 1 : -1;
    const va = a[currentSort.col] ?? -Infinity;
    const vb = b[currentSort.col] ?? -Infinity;
    return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
  });

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = sorted.map(s => {
    const ch       = fmtChange(s.pct_change);
    const tracked  = TRACKED.has(s.ticker);
    const rowCls   = tracked ? 'tracked-row' : '';
    const trackedBadge = tracked ? '<span class="tracked-badge">TRACKED</span>' : '';
    return `
      <tr class="${rowCls}">
        <td>
          <div class="ticker-cell">
            <span class="ticker-tag">${s.ticker}</span>
            ${trackedBadge}
          </div>
        </td>
        <td class="company-name">${s.name}</td>
        <td class="col-num">${fmtPrice(s.price)}</td>
        <td class="col-num ${ch.cls}">${ch.text}</td>
        <td class="col-num">${fmtCap(s.market_cap)}</td>
        <td class="col-num">${fmtYield(s.dividend_yield)}</td>
        <td class="col-range">${rangeBar(s)}</td>
      </tr>`;
  }).join('');

  // Update sort header indicators
  document.querySelectorAll('.reit-table th.sortable').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.col === currentSort.col) {
      th.classList.add(currentSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function attachTableSort() {
  document.querySelectorAll('.reit-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (currentSort.col === col) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort = { col, dir: 'desc' };
      }
      renderTable(window._reitData.stocks);
    });
  });
}

// ── Render: Signal News ──────────────────────────────────────
function renderSignals(news) {
  const container = document.getElementById('signalNews');
  const signals   = news.filter(n => n.is_signal);

  if (!signals.length) {
    container.innerHTML = '<p class="empty-msg">No major signals today.</p>';
    return;
  }

  container.innerHTML = signals.slice(0, 12).map(n => `
    <div class="signal-card">
      <div class="signal-meta">
        <span class="signal-ticker">${n.ticker}</span>
        <span class="signal-date">${timeSince(n.published)}</span>
      </div>
      <div class="signal-title">
        ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.title}</a>` : n.title}
      </div>
    </div>`).join('');
}

// ── Render: All News ─────────────────────────────────────────
let currentFilter = 'ALL';

function renderNews(news, filter) {
  const container = document.getElementById('allNews');
  const filtered  = filter === 'ALL' ? news : news.filter(n => n.ticker === filter);

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-msg">No news for this company.</p>';
    return;
  }

  container.innerHTML = filtered.slice(0, 30).map(n => `
    <div class="news-card">
      <div class="news-meta">
        <span class="news-ticker-tag">${n.ticker}</span>
        <span class="news-date">${timeSince(n.published)}</span>
      </div>
      <div class="news-title">
        ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.title}</a>` : n.title}
      </div>
    </div>`).join('');
}

function populateFilter(stocks) {
  const sel = document.getElementById('newsFilter');
  const tickers = Object.keys(stocks).sort();
  tickers.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = `${t} — ${stocks[t].name}`;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    currentFilter = sel.value;
    renderNews(window._reitData.news, currentFilter);
  });
}

// ── Bootstrap ────────────────────────────────────────────────
async function init() {
  try {
    const res  = await fetch('data/market_data.json?t=' + Date.now());
    const data = await res.json();
    window._reitData = data;

    document.getElementById('marketDate').textContent  = data.market_date || '—';
    document.getElementById('lastUpdated').textContent =
      'Last updated: ' + new Date(data.last_updated).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      });

    renderAlert(data.stocks);
    renderMovers(data);
    renderTable(data.stocks);
    attachTableSort();
    populateFilter(data.stocks);
    renderSignals(data.news || []);
    renderNews(data.news || [], 'ALL');

  } catch (err) {
    console.error('Failed to load market data:', err);
    document.getElementById('lastUpdated').textContent = 'Error loading data.';
  }
}

init();
