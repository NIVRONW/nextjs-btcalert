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

/**
 * ✅ Confirmación extra para BUY (menos riesgo):
 * - BUY solo se muestra si score >= BUY_MIN_SCORE
 * - SELL no se bloquea (defensivo)
 */
const BUY_MIN_SCORE = 85;

function applyExtraConfirmation(signal: SignalPayload) {
  const baseIsSignal = signal.verdict && signal.action !== "NONE";

  // Si no hay señal base, queda NONE
  if (!baseIsSignal) {
    return {
      safeAction: "NONE" as Action,
      blockedReason: "",
    };
  }

  // SELL no se bloquea
  if (signal.action === "SELL") {
    return {
      safeAction: "SELL" as Action,
      blockedReason: "",
    };
  }

  // BUY: requiere score alto
  if (signal.action === "BUY" && signal.score >= BUY_MIN_SCORE) {
    return {
      safeAction: "BUY" as Action,
      blockedReason: "",
    };
  }

  // BUY bloqueada
  return {
    safeAction: "NONE" as Action,
    blockedReason: `Compra bloqueada: Score mínimo ${BUY_MIN_SCORE} (actual ${signal.score}).`,
  };
}

function getBanner(
  signal: SignalPayload,
  safeAction: Action,
  blockedReason: string
) {
  if (safeAction === "NONE") {
    return {
      text: "🟡 Sin señal clara",
      color: "#fbbf24",
      sub: blockedReason
        ? blockedReason
        : "El mercado no muestra una oportunidad sólida ahora mismo.",
    };
  }

  if (safeAction === "SELL") {
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
    sub: `Confirmación extra OK (Score ≥ ${BUY_MIN_SCORE}).`,
  };
}

function getPanelStyle(safeAction: Action) {
  if (safeAction === "NONE") {
    return {
      background:
        "radial-gradient(1200px 500px at 20% 0%, rgba(96,165,250,0.18), rgba(15,23,42,1) 60%)",
      border: "1px solid #1f2937",
    };
  }

  if (safeAction === "SELL") {
    return {
      background:
        "radial-gradient(1200px 500px at 20% 0%, rgba(248,113,113,0.20), rgba(15,23,42,1) 60%)",
      border: "1px solid rgba(248,113,113,0.35)",
    };
  }

  // BUY
  return {
    background:
      "radial-gradient(1200px 500px at 20% 0%, rgba(74,222,128,0.18), rgba(15,23,42,1) 60%)",
    border: "1px solid rgba(74,222,128,0.30)",
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

  const confirm = signal ? applyExtraConfirmation(signal) : null;
  const safeAction = confirm?.safeAction ?? "NONE";
  const blockedReason = confirm?.blockedReason ?? "";

  const banner = signal ? getBanner(signal, safeAction, blockedReason) : null;
  const panelStyle = getPanelStyle(safeAction);

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
              background: panelStyle.background,
              border: panelStyle.border,
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
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
                  background: "rgba(17,24,39,0.85)",
                  overflow: "hidden",
                  border: "1px solid rgba(148,163,184,0.15)",
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
