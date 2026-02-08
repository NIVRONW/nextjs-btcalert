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

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `${res.status}`);
  return JSON.parse(text);
}

const BUY_MIN_SCORE = 85;

function applyExtraConfirmation(signal: SignalPayload): Action {
  const baseIsSignal = signal.verdict && signal.action !== "NONE";
  if (!baseIsSignal) return "NONE";

  if (signal.action === "SELL") return "SELL";

  if (signal.action === "BUY" && signal.score >= BUY_MIN_SCORE) return "BUY";

  return "NONE";
}

function getBanner(safeAction: Action, score: number) {
  if (safeAction === "NONE") {
    return {
      text: "🟡 Sin señal clara",
      color: "#fbbf24",
      sub:
        score > 0 && score < BUY_MIN_SCORE
          ? `Compra bloqueada: Score mínimo ${BUY_MIN_SCORE}.`
          : "El mercado no muestra una oportunidad sólida ahora mismo.",
    };
  }

  if (safeAction === "SELL") {
    return { text: "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴", color: "#f87171", sub: "" };
  }

  return { text: "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢", color: "#4ade80", sub: "" };
}

/** Render sencillo de velas en SVG */
function CandleChart({ candles }: { candles: Candle[] }) {
  const width = 720;
  const height = 260;
  const pad = 28;

  if (!candles || candles.length < 5) {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(148,163,184,0.18)",
          background: "rgba(11,18,32,0.55)",
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        No llegaron velas todavía (candles vacío). Si esto persiste, el endpoint
        /api/candles no está devolviendo datos.
      </div>
    );
  }

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);

  const max = Math.max(...highs);
  const min = Math.min(...lows);

  const span = Math.max(1e-9, max - min);

  const scaleY = (v: number) => pad + ((max - v) / span) * (height - pad * 2);

  const n = candles.length;
  const candleW = (width - pad * 2) / n;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 13, opacity: 0.95 }}>
        📊 Velas últimas {n}h
      </div>

      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(148,163,184,0.16)",
          background: "rgba(11,18,32,0.55)",
          padding: 10,
          overflow: "hidden",
        }}
      >
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
          {candles.map((c, i) => {
            const xCenter = pad + i * candleW + candleW / 2;

            const openY = scaleY(c.o);
            const closeY = scaleY(c.c);
            const highY = scaleY(c.h);
            const lowY = scaleY(c.l);

            const isUp = c.c >= c.o;
            const color = isUp ? "#22c55e" : "#ef4444";

            const bodyTop = Math.min(openY, closeY);
            const bodyH = Math.max(2, Math.abs(openY - closeY));
            const bodyW = Math.max(2, candleW / 1.6);

            return (
              <g key={i}>
                {/* mecha */}
                <line x1={xCenter} x2={xCenter} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
                {/* cuerpo */}
                <rect
                  x={xCenter - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={bodyH}
                  fill={color}
                  rx={1.5}
                />
              </g>
            );
          })}
        </svg>

        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
          Rango: {formatUSD(min)} – {formatUSD(max)}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errMsg, setErrMsg] = useState<string>("");

  async function loadData() {
    try {
      setStatus("loading");
      setErrMsg("");

      const [s, c] = await Promise.all([
        fetchJSON("/api/signal"),
        fetchJSON("/api/candles?limit=72"),
      ]);

      setSignal(s?.lastSignal ?? null);
      setCandles(Array.isArray(c?.candles) ? c.candles : []);

      setStatus("ok");
    } catch (e: any) {
      setStatus("error");
      setErrMsg(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 60_000);
    return () => clearInterval(id);
  }, []);

  const safeAction = signal ? applyExtraConfirmation(signal) : "NONE";
  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const banner = signal ? getBanner(safeAction, signal.score) : null;

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
        <h1 style={{ fontSize: 26, marginBottom: 20 }}>₿ BTCALERT – TE ALERTA EN QUE MOMENTO INVERTIR</h1>

        {status === "loading" && <p>Cargando datos...</p>}

        {status === "error" && (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(248,113,113,0.35)",
              background: "rgba(127,29,29,0.15)",
              color: "#fecaca",
              fontSize: 13,
            }}
          >
            Error cargando datos: {errMsg || "desconocido"}
          </div>
        )}

        {signal && banner && (
          <div
            style={{
              borderRadius: 22,
              padding: 22,
              background:
                "radial-gradient(1200px 500px at 20% 0%, rgba(96,165,250,0.18), rgba(15,23,42,1) 60%)",
              border: "1px solid rgba(148,163,184,0.18)",
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
            }}
          >
            {/* BANNER */}
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6, color: banner.color }}>
              {banner.text}
            </div>
            <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 18 }}>{banner.sub}</div>

            {/* PRECIO */}
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -0.5 }}>
              {formatUSD(signal.price)}
            </div>

            {/* SCORE */}
            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 6 }}>
                Score: <b>{signal.score}/100</b>
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(17,24,39,0.85)",
                  overflow: "hidden",
                  border: "1px solid rgba(148,163,184,0.12)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${scoreBar}%`,
                    background: scoreBar >= 75 ? "#22c55e" : scoreBar >= 50 ? "#fbbf24" : "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* INDICADORES */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div style={{ opacity: 0.7 }}>RSI (14)</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{signal.rsi14.toFixed(2)}</div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 50</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{formatUSD(signal.ema50)}</div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 200</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{formatUSD(signal.ema200)}</div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>Última actualización</div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {new Date(signal.at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* ✅ VELAS (DENTRO del panel, para que SIEMPRE se vea) */}
            <CandleChart candles={candles} />
          </div>
        )}
      </div>
    </main>
  );
}
