// api/stock.js — Yahoo Finance ללא API key
// עובד ישירות מ-Vercel serverless

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { sym, range = "6mo" } = req.query;
  if (!sym) return res.status(400).json({ error: "sym required" });

  const symbol = sym.toUpperCase();
  const interval = range === "1d" ? "5m" : range === "5d" ? "15m" : "1d";

  // נסה כמה endpoints של Yahoo
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`,
  ];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };

  let lastError = "";

  for (const url of urls) {
    try {
      const r = await fetch(url, { headers });

      if (!r.ok) {
        lastError = `HTTP ${r.status} from ${url}`;
        continue;
      }

      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) {
        lastError = "No result in response";
        continue;
      }

      const { timestamp, indicators, meta } = result;
      const q = indicators.quote[0];

      const candles = timestamp
        .map((t, i) => ({
          t,
          o: q.open[i]   != null ? +q.open[i].toFixed(2)   : null,
          h: q.high[i]   != null ? +q.high[i].toFixed(2)   : null,
          l: q.low[i]    != null ? +q.low[i].toFixed(2)    : null,
          c: q.close[i]  != null ? +q.close[i].toFixed(2)  : null,
          v: q.volume[i] ?? 0,
        }))
        .filter(c => c.c !== null);

      if (!candles.length) {
        lastError = "No candles after filtering";
        continue;
      }

      const price     = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose;
      const chgPct    = +((price - prevClose) / prevClose * 100).toFixed(2);

      return res.status(200).json({
        symbol,
        price:       +price.toFixed(2),
        prevClose:   +prevClose.toFixed(2),
        chgPct,
        high:        meta.regularMarketDayHigh,
        low:         meta.regularMarketDayLow,
        volume:      meta.regularMarketVolume,
        mktCap:      meta.marketCap,
        week52High:  meta.fiftyTwoWeekHigh,
        week52Low:   meta.fiftyTwoWeekLow,
        currency:    meta.currency,
        exchange:    meta.exchangeName,
        candles,
        source:      "yahoo",
      });

    } catch (e) {
      lastError = e.message;
    }
  }

  // אם Yahoo נכשל — החזר שגיאה ברורה
  return res.status(502).json({
    error: `Yahoo Finance חסום מ-Vercel: ${lastError}`,
    suggestion: "נסה להוסיף AV_KEY מ-alphavantage.co (חינמי)"
  });
}
