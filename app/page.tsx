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

function getBanner(signal: SignalPayload) {
  // Regla: si no hay veredicto, lo tratamos como "sin señal clara"
  if (!signal.verdict || signal.action === "NONE") {
    return {
      text: "🟡 Sin señal clara",
      color: "#fbbf24",
      sub: "El mercado no muestra una oportunidad sólida ahora mismo.",
    };
  }

  if (signal.action === "SELL") {
    return {
      text: "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴",
      color: "#f87171",
      sub: "Se detectaron condiciones de salida.",
    };
  }

  // BUY
  return {
    text: "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢",
    color: "#4ade80",
    sub: "Se detectaron condiciones de entrada.",
  };
}

export default function Home() {
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      setSignal(s?.lastSignal ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    loadSignal();
    const id = setInterval(loadSignal, 60_000);
    return () => clearInterval(id);
  }, []);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const banner = signal ? getBanner(signal) : null;

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
        <h1 style={{ fontSize: 26, marginBottom: 20 }}>
          ₿ BTCALERT – Panel Inteligente
        </h1>

        {status === "loading" && <p>Cargando datos...</p>}
        {status === "error" && <p>Error cargando señal.</p>}

        {signal && banner && (
          <div
            style={{
              borderRadius: 18,
              padding: 20,
              background: "#0f172a",
              border: "1px solid #1f2937",
            }}
          >
            {/* BANNER */}
            <div
              style={{
                fontWeight: 900,
                fontSize: 18,
                marginBottom: 6,
                color: banner.color,
              }}
            >
              {banner.text}
            </div>
            <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 18 }}>
              {banner.sub}
            </div>

            {/* PRECIO GRANDE */}
            <div style={{ fontSize: 44, fontWeight: 900 }}>
              {formatUSD(signal.price)}
            </div>

            {/* SCORE BAR */}
            <div style={{ marginTop: 20 }}>
              <div style={{ marginBottom: 6 }}>
                Score: <b>{signal.score}/100</b>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "#111827",
                  overflow: "hidden",
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

            {/* INDICADORES LIMPIOS */}
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
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {signal.rsi14.toFixed(2)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 50</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {formatUSD(signal.ema50)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>EMA 200</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {formatUSD(signal.ema200)}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.7 }}>Última actualización</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {new Date(signal.at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
