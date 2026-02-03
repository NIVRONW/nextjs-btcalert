"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AlertMode = "dca" | "dip" | "ma";
type AlertConfig = {
  enabled: boolean;
  mode: AlertMode;
  dipPercent: number;      // para "dip"
  dcaHour: number;         // para "dca"
  fastMA: number;          // para "ma"
  slowMA: number;          // para "ma"
  lastFiredAt?: number;    // evitar spam
};

type MarketPoint = { t: number; p: number };

const LS_KEY = "btc_alert_config_v1";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function movingAverage(values: number[], window: number) {
  if (window <= 1) return values.map((v) => v);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    const denom = Math.min(i + 1, window);
    out.push(sum / denom);
  }
  return out;
}

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

async function fetchPriceAndChange() {
  // CoinGecko: precio + cambio 24h %
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar precio");
  const json = await res.json();
  const usd = json?.bitcoin?.usd;
  const chg = json?.bitcoin?.usd_24h_change;
  if (typeof usd !== "number" || typeof chg !== "number") throw new Error("Respuesta inesperada");
  return { usd, chg };
}

async function fetchChart24h() {
  // CoinGecko: serie de precios últimas 24h
  // days=1 suele devolver puntos suficientemente frecuentes para un gráfico simple.
  const url =
    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar gráfico");
  const json = await res.json();
  const prices: [number, number][] = json?.prices;
  if (!Array.isArray(prices) || prices.length < 10) throw new Error("Serie inválida");
  return prices.map(([t, p]) => ({ t, p })) as MarketPoint[];
}

function makeSparkPath(points: MarketPoint[], w = 520, h = 160, pad = 10) {
  const xs = points.map((d) => d.t);
  const ys = points.map((d) => d.p);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);
  const scaleY = (y: number) =>
    h - pad - ((y - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);

  return points
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(2)}`)
    .join(" ");
}

function playBeep() {
  // Sonido simple sin archivos externos
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 200);
  } catch {}
}

function vibrate(ms = 200) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

export default function Home() {
  const [price, setPrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [series, setSeries] = useState<MarketPoint[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const [alertCfg, setAlertCfg] = useState<AlertConfig>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      enabled: false,
      mode: "dip",
      dipPercent: 3,
      dcaHour: 10,
      fastMA: 20,
      slowMA: 60,
    };
  });

  const lastPrices = useMemo(() => series.map((d) => d.p), [series]);
  const maFast = useMemo(() => movingAverage(lastPrices, alertCfg.fastMA), [lastPrices, alertCfg.fastMA]);
  const maSlow = useMemo(() => movingAverage(lastPrices, alertCfg.slowMA), [lastPrices, alertCfg.slowMA]);

  const firedRef = useRef<number | undefined>(alertCfg.lastFiredAt);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(alertCfg));
    } catch {}
  }, [alertCfg]);

  async function refreshAll() {
    try {
      setStatus("loading");
      const [p, s] = await Promise.all([fetchPriceAndChange(), fetchChart24h()]);
      setPrice(p.usd);
      setChange24h(p.chg);
      setSeries(s);
      setUpdatedAt(new Date().toLocaleString());
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  function shouldFireNow(now: number) {
    if (!alertCfg.enabled) return false;
    if (!price || series.length < 20) return false;

    // anti-spam: mínimo 30 min entre alertas
    const last = firedRef.current ?? alertCfg.lastFiredAt ?? 0;
    if (now - last < 30 * 60 * 1000) return false;

    if (alertCfg.mode === "dca") {
      const d = new Date(now);
      return d.getMinutes() === 0 && d.getHours() === alertCfg.dcaHour;
    }

    if (alertCfg.mode === "dip") {
      const max = Math.max(...lastPrices);
      const drop = ((max - price) / max) * 100;
      return drop >= alertCfg.dipPercent;
    }

    // "ma": cruce de medias (simple)
    if (alertCfg.mode === "ma") {
      const n = lastPrices.length;
      if (n < 5) return false;
      const f0 = maFast[n - 2], f1 = maFast[n - 1];
      const s0 = maSlow[n - 2], s1 = maSlow[n - 1];
      // dispara cuando fast cruza hacia arriba a slow
      return f0 <= s0 && f1 > s1;
    }

    return false;
  }

  function fireAlert(message: string) {
    const now = Date.now();
    firedRef.current = now;
    setAlertCfg((c) => ({ ...c, lastFiredAt: now }));

    // Popup
    alert(message);

    // Sonido + vibración
    playBeep();
    vibrate(250);
  }

  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 60_000); // 1 min
    return () => clearInterval(id);
  }, []);

  // Evaluar alerta cada vez que cambien datos
  useEffect(() => {
    const now = Date.now();
    if (shouldFireNow(now)) {
      const msg =
        alertCfg.mode === "dca"
          ? "Recordatorio DCA: hora de tu compra programada."
          : alertCfg.mode === "dip"
          ? `Oportunidad: BTC cayó ≥ ${alertCfg.dipPercent}% desde el máximo de 24h.`
          : "Señal: cruce de medias (tendencia al alza).";
      fireAlert(msg);
    }
  }, [price, series]);

  const sparkPath = useMemo(() => (series.length ? makeSparkPath(series) : ""), [series]);
  const changeColor = (change24h ?? 0) >= 0 ? "#22c55e" : "#ef4444"; // verde/rojo (simple)

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: "#0b0f19",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>₿ BTC en tiempo real</h1>

        <div
          style={{
            border: "1px solid #1f2937",
            borderRadius: 16,
            padding: 16,
            background: "#0f172a",
          }}
        >
          {status === "loading" && <p>Cargando precio y gráfico…</p>}

          {status === "error" && (
            <div>
              <p style={{ color: "#fca5a5" }}>No se pudo cargar. Reintenta.</p>
              <button
                onClick={refreshAll}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #334155",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {status === "ok" && price != null && change24h != null && (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: 42, fontWeight: 800
