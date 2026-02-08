"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "ok" | "error";
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
};

type Candle = {
  t: number;
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

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

const BUY_MIN_SCORE = 85;

function applyExtraConfirmation(signal: SignalPayload) {
  if (!signal.verdict) return "NONE";

  if (signal.action === "SELL") return "SELL";

  if (signal.action === "BUY" && signal.score >= BUY_MIN_SCORE)
    return "BUY";

  return "NONE";
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  async function loadData() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      const c = await fetchJSON("/api/candles?limit=72");

      setSignal(s?.lastSignal ?? null);
      setCandles(c?.candles ?? []);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!signal) return null;

  const safeAction = applyExtraConfirmation(signal);
  const scoreBar = clamp(signal.score, 0, 100);

  function getBanner() {
    if (safeAction === "NONE")
      return {
        text: "🟡 Sin señal clara",
        color: "#fbbf24",
      };

    if (safeAction === "SELL")
      return {
        text: "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴",
        color: "#f87171",
      };

    return {
      text: "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢",
      color: "#4ade80",
    };
  }

  const banner = getBanner();

  // === Gráfico de velas SVG ===

  const width = 720;
  const height = 260;
  const pad = 30;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);

  const max = Math.max(...highs);
  const min = Math.min(...lows);

  const scaleY = (v: number) =>
    pad + ((max - v) / (max - min)) * (height - pad * 2);

  const candleWidth = (width - pad * 2) / candles.length;

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        background: "#0b0f19",
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, marginBottom: 20 }}>
          ₿ BTCALERT – Panel Inteligente
        </h1>

        <div
          style={{
            borderRadius: 18,
            padding: 20,
            background: "#0f172a",
            border: "1px solid #1f2937",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 18,
              marginBottom: 20,
              color: banner.color,
            }}
          >
            {banner.text}
          </div>

          <div style={{ fontSize: 44, fontWeight: 900 }}>
            {formatUSD(signal.price)}
          </div>

          <div style={{ marginTop: 20 }}>
            Score: <b>{signal.score}/100</b>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: "#111827",
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${scoreBar}%`,
                  background:
                    scoreBar >= 75
                      ? "#22c55e"
                      : scoreBar >= 50
                      ? "#fbbf24"
                      : "#ef4444",
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: 25,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <div style={{ opacity: 0.7 }}>RSI (14)</div>
              <div style={{ fontWeight: 700 }}>
                {signal.rsi14.toFixed(2)}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7 }}>EMA 50</div>
              <div style={{ fontWeight: 700 }}>
                {formatUSD(signal.ema50)}
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7 }}>EMA 200</div>
              <div style={{ fontWeight: 700 }}>
                {formatUSD(signal.ema200)}
              </div>
            </div>
          </div>
        </div>

        {/* === GRAFICO DE VELAS === */}
        <div
          style={{
            marginTop: 30,
            background: "#0f172a",
            borderRadius: 18,
            padding: 20,
            border: "1px solid #1f2937",
          }}
        >
          <div style={{ marginBottom: 15, fontWeight: 700 }}>
            📊 Velas últimas 72h
          </div>

          <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
            {candles.map((c, i) => {
              const x = pad + i * candleWidth + candleWidth / 2;
              const openY = scaleY(c.o);
              const closeY = scaleY(c.c);
              const highY = scaleY(c.h);
              const lowY = scaleY(c.l);

              const color =
                c.c >= c.o ? "#22c55e" : "#ef4444";

              return (
                <g key={i}>
                  {/* mecha */}
                  <line
                    x1={x}
                    x2={x}
                    y1={highY}
                    y2={lowY}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* cuerpo */}
                  <rect
                    x={x - candleWidth / 3}
                    y={Math.min(openY, closeY)}
                    width={candleWidth / 1.5}
                    height={Math.max(
                      2,
                      Math.abs(openY - closeY)
                    )}
                    fill={color}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </main>
  );
}
