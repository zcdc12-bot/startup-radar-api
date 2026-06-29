// api/stock.js — Alpha Vantage
const AV_KEY  = "95X0D7ZZABCS7ZJ9";
const AV_BASE = "https://www.alphavantage.co/query";

const RANGE_DAYS = {
  "1d":5, "5d":10, "1mo":30, "3mo":90, "6mo":180, "1y":365, "2y":730
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { sym, range = "6mo" } = req.query;
  if (!sym) return res.status(400).json({ error: "sym required" });

  const symbol = sym.toUpperCase();
  const days = RANGE_DAYS[range] || 180;

  try {
    // היסטוריה יומית מלאה
    const url = `${AV_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${AV_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    if (data["Note"]) throw new Error("API limit — נסה שוב בעוד דקה");
    if (data["Error Message"]) throw new Error(`סמל לא נמצא: ${symbol}`);
    if (data["Information"]) throw new Error("API limit — נסה שוב מחר");

    const ts = data["Time Series (Daily)"];
    if (!ts) throw new Error("אין נתונים");

    const entries = Object.entries(ts)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]));

    const candles = entries
      .slice(0, days)
      .reverse()
      .map(([date, v]) => ({
        t: Math.floor(new Date(date).getTime() / 1000),
        o: +parseFloat(v["1. open"]).toFixed(2),
        h: +parseFloat(v["2. high"]).toFixed(2),
        l: +parseFloat(v["3. low"]).toFixed(2),
        c: +parseFloat(v["5. adjusted close"]).toFixed(2),
        v: parseInt(v["6. volume"]),
      }));

    if (!candles.length) throw new Error("אין נתונים לטווח זה");

    const last    = candles[candles.length - 1];
    const prev    = candles[candles.length - 2];
    const price   = last.c;
    const prevClose = prev?.c || last.o;
    const chgPct  = +((price - prevClose) / prevClose * 100).toFixed(2);

    const year      = entries.slice(0, 252);
    const week52High = +Math.max(...year.map(([,v]) => parseFloat(v["2. high"]))).toFixed(2);
    const week52Low  = +Math.min(...year.map(([,v]) => parseFloat(v["3. low"]))).toFixed(2);

    return res.status(200).json({
      symbol, price, prevClose, chgPct,
      high: last.h, low: last.l, volume: last.v,
      week52High, week52Low,
      lastDate: entries[0][0],
      candles,
      source: "alphavantage",
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
