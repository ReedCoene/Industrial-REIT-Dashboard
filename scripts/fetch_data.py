"""
Healthcare REIT Dashboard — Daily Data Fetcher
Runs via GitHub Actions after market close Mon–Fri.
Writes data/market_data.json for the static site to consume.
"""

import json
import os
import sys
from datetime import datetime, timezone

import feedparser
import yfinance as yf

# ── Coverage universe (>$500M market cap healthcare REITs) ────
REITS = {
    "WELL":  "Welltower",
    "VTR":   "Ventas",
    "DOC":   "Healthpeak Properties",
    "OHI":   "Omega Healthcare Investors",
    "CTRE":  "CareTrust REIT",
    "NHI":   "National Health Investors",
    "SBRA":  "Sabra Health Care REIT",
    "HR":    "Healthcare Realty Trust",
    "LTC":   "LTC Properties",
    "MPW":   "Medical Properties Trust",
    "CHCT":  "Community Healthcare Trust",
    "UHT":   "Universal Health Realty",
}

# Keywords that mark a news item as a meaningful signal
SIGNAL_KEYWORDS = [
    "earnings", "ffo", "dividend", "acquisition", "merger", "guidance",
    "upgrade", "downgrade", "price target", "initiates", "raises", "cuts",
    "cms", "medicare", "medicaid", "occupancy", "beat", "miss",
    "offering", "investment", "tenant", "operator", "rating", "coverage",
    "quarter", "annual", "guidance", "outlook", "forecast",
]


def fetch_prices() -> dict:
    """Fetch price + fundamentals for all tickers via yfinance."""
    results = {}
    tickers_str = " ".join(REITS.keys())

    try:
        batch = yf.Tickers(tickers_str)
    except Exception as e:
        print(f"Batch fetch failed, falling back to individual: {e}", file=sys.stderr)
        batch = None

    for ticker, name in REITS.items():
        try:
            stock = batch.tickers[ticker] if batch else yf.Ticker(ticker)
            info  = stock.info or {}
            hist  = stock.history(period="5d")

            # Find last two trading days with data
            hist = hist.dropna(subset=["Close"])
            if len(hist) >= 2:
                prev_close = float(hist["Close"].iloc[-2])
                curr_close = float(hist["Close"].iloc[-1])
            elif len(hist) == 1:
                curr_close = float(hist["Close"].iloc[-1])
                prev_close = curr_close
            else:
                print(f"No price history for {ticker}", file=sys.stderr)
                continue

            pct_change = ((curr_close - prev_close) / prev_close) * 100 if prev_close else 0

            results[ticker] = {
                "name":               name,
                "ticker":             ticker,
                "price":              round(curr_close, 2),
                "prev_close":         round(prev_close, 2),
                "pct_change":         round(pct_change, 2),
                "market_cap":         info.get("marketCap") or 0,
                "dividend_yield":     round((info.get("dividendYield") or 0) * 100, 2),
                "fifty_two_week_high": info.get("fiftyTwoWeekHigh") or 0,
                "fifty_two_week_low":  info.get("fiftyTwoWeekLow") or 0,
            }
            print(f"  {ticker}: ${curr_close:.2f} ({pct_change:+.2f}%)")

        except Exception as e:
            print(f"  ERROR {ticker}: {e}", file=sys.stderr)

    return results


def fetch_news() -> list:
    """Aggregate recent news via Yahoo Finance RSS for each ticker."""
    all_news = []

    for ticker, name in REITS.items():
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:4]:
                published = ""
                if hasattr(entry, "published"):
                    published = entry.published
                elif hasattr(entry, "updated"):
                    published = entry.updated

                summary = entry.get("summary", "") or ""
                all_news.append({
                    "ticker":    ticker,
                    "company":   name,
                    "title":     entry.get("title", "").strip(),
                    "link":      entry.get("link", ""),
                    "published": published,
                    "summary":   summary[:300] + ("…" if len(summary) > 300 else ""),
                    "is_signal": False,  # tagged below
                })
        except Exception as e:
            print(f"  News ERROR {ticker}: {e}", file=sys.stderr)

    # Tag signals
    for item in all_news:
        text = (item["title"] + " " + item["summary"]).lower()
        item["is_signal"] = any(kw in text for kw in SIGNAL_KEYWORDS)

    return all_news


def compute_movers(stocks: dict) -> tuple[list, list]:
    ranked = sorted(stocks.values(), key=lambda s: s["pct_change"], reverse=True)
    return ranked[:3], ranked[-3:]


def main():
    print("=== Healthcare REIT Data Fetch ===")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}\n")

    print("Fetching prices...")
    stocks = fetch_prices()
    if not stocks:
        print("ERROR: No price data fetched. Aborting.", file=sys.stderr)
        sys.exit(1)

    print("\nFetching news...")
    news = fetch_news()

    top_gainers, top_losers = compute_movers(stocks)

    payload = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "market_date":  datetime.now().strftime("%B %d, %Y"),
        "stocks":       stocks,
        "top_gainers":  top_gainers,
        "top_losers":   top_losers,
        "news":         news,
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "market_data.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)

    print(f"\nDone. {len(stocks)} stocks, {len(news)} news items, "
          f"{sum(1 for n in news if n['is_signal'])} signals.")
    print(f"Written to {os.path.abspath(out_path)}")


if __name__ == "__main__":
    main()
