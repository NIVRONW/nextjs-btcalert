"use client";

import { useEffect, useMemo, useState } from "react";

type Action = "BUY" | "SELL" | "NONE";

type SignalPayload = {
  at: number;
  verdict: boolean;
  action: Action;
  score: number;
  price: number;
  rsi14: number;
  ema50: number;
  ema200: number;
  change1h?: number;
  change24h?: number;
  rebound2h?: number;
  reason?: string[];
};

type Candle = {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatPct(n?: number) {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function CandleChart({ candles }: { candles: Candle[] }) {
  // Render simple OHLC candlestick chart in pure HTML/CSS (no libs)
  // We map candles to normalized y-coordinates.
  const W = 980;
  const H = 260;
  const pad = 18;

  const { minP, maxP } = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const c of candles) {
      if (Number.isFinite(c.l)) lo = Math.min(lo, c.l);
      if (Number.isFinite(c.h)) hi = Math.max(hi, c.h);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      lo = 0;
      hi = 1;
    }
    return { minP: lo, maxP: hi };
  }, [candles]);

  const y = (p: number) => {
    const t = (p - minP) / (maxP - minP);
    return pad + (H - pad * 2) * (1 - t);
  };

  const count = candles.length || 1;
  const step = (W - pad * 2) / count;
  const bodyW = Math.max(4, Math.min(10, step * 0.55));

  return (
    <div
      style={{
        marginTop: 14,
        background: "#070b14",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: 14,
        overflowX: "auto",
      }}
    >
      <svg
        width={Math.max(W, candles.length * 12)}
        height={H}
        style={{ display: "block" }}
      >
        {/* grid */}
        {[0.2, 0.4, 0.6, 0.8].map((t) => {
          const yy = pad + (H - pad * 2) * t;
          return (
            <line
              key={t}
              x1={pad}
              x2={Math.max(W, candles.length * 12) - pad}
              y1={yy}
              y2={yy}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {candles.map((c, i) => {
          const x = pad + i * step + step * 0.5;
          const up = c.c >= c.o;

          const yH = y(c.h);
          const yL = y(c.l);
          const yO = y(c.o);
          const yC = y(c.c);

          const top = Math.min(yO, yC);
          const bot = Math.max(yO, yC);
          const bodyH = Math.max(2, bot - top);

          return (
            <g key={c.t ?? i}>
              {/* wick */}
              <line
                x1={x}
                x2={x}
                y1={yH}
                y2={yL}
                stroke={up ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)"}
                strokeWidth="2"
              />
              {/* body */}
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                rx="2"
                fill={up ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)"}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleErr, setCandleErr] = useState<string>("");

  async function loadAll() {
    try {
      const s = await fetchJSON("/api/signal");
      setSignal(s?.lastSignal ?? null);
    } catch {
      // ignore
    }

    try {
      setCandleErr("");
      const c = await fetchJSON("/api/candles?limit=72");
      const arr = (c?.candles ?? []) as Candle[];
      if (!Array.isArray(arr) || arr.length < 20) {
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }
      setCandles(arr);
    } catch (e: any) {
      setCandles([]);
      setCandleErr(e?.message ?? "No se pudieron cargar las velas");
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, []);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 26,
        background:
          "radial-gradient(1200px 520px at 35% -10%, rgba(250,204,21,0.22), rgba(2,6,23,0))," +
          "radial-gradient(900px 520px at 90% 0%, rgba(148,163,184,0.25), rgba(2,6,23,0))," +
          "linear-gradient(180deg, #0b1220 0%, #050816 100%)",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* ✅ TITULO */}
        <h1
          style={{
            margin: "0 0 18px 0",
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 0.3,
          }}
        >
          <span style={{ color: "#facc15" }}>₿ BTCALERT</span>
          {/* ✅ AQUÍ estaba gris; ahora también es amarillo */}
          <span style={{ color: "#facc15" }}>
            {" "}
            – MONITOREO Y ALERTA DE INVERSION
          </span>
        </h1>

        <div
          style={{
            borderRadius: 26,
            padding: 28,
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.92) 100%)",
            border: "1px solid rgba(148,163,184,0.18)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          }}
        >
          {/* TOP ROW */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontWeight: 900,
                  fontSize: 22,
                  color: "#facc15",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: "#facc15",
                    display: "inline-block",
                    boxShadow: "0 0 18px rgba(250,204,21,0.45)",
                  }}
                />
                Sin señal clara
              </div>
              <div style={{ opacity: 0.72, marginTop: 6, fontSize: 16 }}>
                El mercado no muestra una oportunidad sólida ahora mismo.
              </div>
            </div>

            <div style={{ textAlign: "right", opacity: 0.8 }}>
              <div style={{ fontWeight: 700 }}>Última actualización</div>
              <div style={{ fontWeight: 800 }}>
                {signal?.at ? fmtTime(signal.at) : "—"}
              </div>
            </div>
          </div>

          {/* PRICE */}
          <div style={{ marginTop: 22, fontSize: 64, fontWeight: 900 }}>
            {formatUSD(signal?.price ?? 0)}
          </div>

          {/* SCORE */}
          <div style={{ marginTop: 20 }}>
            <div style={{ opacity: 0.7, fontSize: 16 }}>Score</div>
            <div style={{ fontSize: 34, fontWeight: 900 }}>
              {signal?.score ?? 0}/100
            </div>

            <div
              style={{
                marginTop: 12,
                height: 12,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${scoreBar}%`,
                  background: "rgb(239,68,68)",
                }}
              />
            </div>
          </div>

          {/* STATS */}
          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 18,
              alignItems: "end",
            }}
          >
            <div>
              <div style={{ opacity: 0.7 }}>RSI (14)</div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>
                {(signal?.rsi14 ?? 0).toFixed(2)}
              </div>
              <div style={{ opacity: 0.6, marginTop: 2 }}>
                1h: {formatPct(signal?.change1h)} • 24h: {formatPct(signal?.change24h)}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7 }}>EMA 50</div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>
                {formatUSD(signal?.ema50 ?? 0)}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7 }}>EMA 200</div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>
                {formatUSD(signal?.ema200 ?? 0)}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.7 }}>Rebote 2h</div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>
                {formatPct(signal?.rebound2h)}
              </div>
            </div>
          </div>

          {/* CANDLES */}
          <div style={{ marginTop: 22, fontWeight: 900, fontSize: 18, opacity: 0.9 }}>
            Gráfico de velas (últimas 72 horas)
          </div>

          {candleErr ? (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.08)",
                color: "rgba(252,165,165,0.95)",
              }}
            >
              <div>No se pudieron cargar las velas desde /api/candles.</div>
              <div style={{ opacity: 0.9, marginTop: 6 }}>Detalle: {candleErr}</div>
            </div>
          ) : (
            <CandleChart candles={candles} />
          )}
        </div>
      </div>
    </main>
  );
}
