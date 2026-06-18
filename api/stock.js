// api/stock.js
// שימוש: /api/stock?sym=NVDA&range=6mo
//
// אין צורך ב-KV, אין צורך ב-cookie. זו הגרסה הכי פשוטה שעובדת.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { sym, range = "6mo" } = req.query;
  if (!sym) return res.status(400).json({ error: "חסר פרמטר sym" });

  try {
    const symbol = sym.toUpperCase();
    const interval = range === "1d" ? "5m" : range === "5d" ? "15m" : "1d";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });

    if (!r.ok) {
      return res.status(502).json({ error: `Yahoo Finance החזיר שגיאה ${r.status}` });
    }

    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: "לא נמצאו נתונים לסמל הזה" });

    const { timestamp, indicators, meta } = result;
    const q = indicators.quote[0];

    const candles = timestamp
      .map((t, i) => ({
        t,
        o: q.open[i],
        h: q.high[i],
        l: q.low[i],
        c: q.close[i],
        v: q.volume[i] ?? 0,
      }))
      .filter(c => c.c != null);

    return res.status(200).json({
      symbol,
      price: meta.regularMarketPrice,
      prevClose: meta.chartPreviousClose,
      chgPct: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      mktCap: meta.marketCap,
      week52High: meta.fiftyTwoWeekHigh,
      week52Low: meta.fiftyTwoWeekLow,
      currency: meta.currency,
      candles,
      source: "yahoo",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
