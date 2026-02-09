"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  bounce2h?: number; // %
  change1h?: number; // %
  change24h?: number; // %
};

type Candle = { t: number; o: number; h: number; l: number; c: number };

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
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function drawCandles(canvas: HTMLCanvasElement, candles: Candle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // si el canvas todavía no tiene tamaño, no dibujes
  if (!cssW || !cssH) return;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;

  ctx.clearRect(0, 0, W, H);

  // fondo suave
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, W, H);

  if (!candles || candles.length < 2) return;

  const padL = 14;
  const padR = 10;
  const padT = 10;
  const padB = 16;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    minP = Math.min(minP, c.l);
    maxP = Math.max(maxP, c.h);
  }
  const span = Math.max(1e-9, maxP - minP);

  const xStep = innerW / Math.max(1, candles.length);
  const bodyW = Math.max(2, Math.min(9, xStep * 0.65));
  const yOf = (p: number) => padT + (maxP - p) * (innerH / span);

  // grid horizontal suave
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  const gridLines = 4;
  for (let i = 1; i <= gridLines; i++) {
    const y = padT + (innerH * i) / (gridLines + 1);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const xCenter = padL + xStep * (i + 0.5);

    const yH = yOf(c.h);
    const yL = yOf(c.l);
    const yO = yOf(c.o);
    const yC = yOf(c.c);

    const up = c.c >= c.o;

    // wick
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.beginPath();
    ctx.moveTo(xCenter, yH);
    ctx.lineTo(xCenter, yL);
    ctx.stroke();

    // body
    const yTop = Math.min(yO, yC);
    const yBot = Math.max(yO, yC);
    const h = Math.max(2, yBot - yTop);

    ctx.fillStyle = up ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)";
    ctx.fillRect(xCenter - bodyW / 2, yTop, bodyW, h);
  }
}

export default function Home() {
  const DEPLOY_MARKER = "BTCALERT-PROD-CANDLES-FIX-V1";

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      setSignal((s?.lastSignal ?? null) as SignalPayload | null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      setCandlesStatus("loading");
      setCandlesError("");

      const j = await fetchJSON("/api/candles?limit=72");
      const arr = (j?.candles ?? []) as Candle[];

      if (!Array.isArray(arr) || arr.length < 10) {
        throw new Error("No llegaron velas suficientes");
      }

      arr.sort((a, b) => a.t - b.t);
      setCandles(arr);
      setCandlesStatus("ok");
    } catch (e: any) {
      setCandles([]);
      setCandlesStatus("error");
      setCandlesError(e?.message || "candles_error");
    }
  }

  useEffect(() => {
    loadSignal();
    loadCandles();

    const id = setInterval(() => {
      loadSignal();
      loadCandles();
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  // ✅ FIX PRODUCCIÓN: asegurar layout antes de dibujar + redibujar al resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => drawCandles(canvas, candles);

    // delay para asegurar tamaño real (soluciona canvas vacío en prod)
    const t = setTimeout(draw, 50);
    window.addEventListener("resize", draw);

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", draw);
    };
  }, [candles]);

  const gold = "#f5b301";
  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const updatedAt = signal?.at ? new Date(signal.at).toLocaleString() : "";

  const bgGlow = useMemo(() => {
    if (!signal)
      return "radial-gradient(800px 420px at 20% 0%, rgba(245,179,1,0.18), rgba(0,0,0,0) 60%)";

    if (signal.action === "BUY")
      return "radial-gradient(800px 420px at 20% 0%, rgba(34,197,94,0.18), rgba(0,0,0,0) 60%)";

    if (signal.action === "SELL")
      return "radial-gradient(800px 420px at 20% 0%, rgba(239,68,68,0.18), rgba(0,0,0,0) 60%)";

    return "radial-gradient(800px 420px at 20% 0%, rgba(245,179,1,0.18), rgba(0,0,0,0) 60%)";
  }, [signal]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: "#050912",
        backgroundImage: bgGlow,
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      {/* marker */}
      <div
        style={{
          position: "fixed",
          left: 10,
          bottom: 10,
          fontSize: 11,
          opacity: 0.22,
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        {DEPLOY_MARKER}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* HEADER 2 líneas */}
        <header style={{ textAlign: "center", marginBottom: 12 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: 0.5,
              color: gold,
              textTransform: "uppercase",
              lineHeight: 1.05,
            }}
          >
            ₿ BTCALERT
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: 2,
              color: gold,
              textTransform: "uppercase",
            }}
          >
            MONITOREO Y ALERTA DE INVERSION
          </div>
        </header>

        {/* GOLD GLOW */}
        <div
          style={{
            position: "relative",
            height: 26,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "72%",
              height: 2,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, rgba(245,179,1,0), rgba(245,179,1,0.95), rgba(245,179,1,0))",
              boxShadow: "0 0 22px rgba(245,179,1,0.35)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: -26,
              left: "50%",
              transform: "translateX(-50%)",
              width: "72%",
              height: 70,
              background:
                "radial-gradient(closest-side, rgba(245,179,1,0.28), rgba(245,179,1,0) 70%)",
              filter: "blur(2px)",
              pointerEvents: "none",
            }}
          />
        </div>

        {status === "loading" && <p style={{ opacity: 0.8 }}>Cargando datos...</p>}
        {status === "error" && <p style={{ color: "#f87171" }}>Error cargando señal.</p>}

        {signal && (
          <div
  style={{
    borderRadius: 24,
    padding: 24,
    background:
      "linear-gradient(160deg, rgba(10,18,35,0.95), rgba(5,10,20,0.98))",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow:
      "0 25px 80px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(245,179,1,0.06)",
    backdropFilter: "blur(8px)",
    position: "relative",
  }}
>
            {/* top row */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background:
                        signal.action === "BUY"
                          ? "#22c55e"
                          : signal.action === "SELL"
                          ? "#ef4444"
                          : gold,
                    }}
                  />
                  <div style={{ fontWeight: 900, fontSize: 18, color: gold }}>
                    {signal.action === "NONE" ? "Sin señal clara" : "Señal detectada"}
                  </div>
                </div>
                <div style={{ marginTop: 8, opacity: 0.75 }}>
                  El mercado no muestra una oportunidad sólida ahora mismo.
                </div>
              </div>

              <div style={{ textAlign: "right", opacity: 0.75, fontWeight: 700 }}>
                <div>Última actualización</div>
                <div style={{ marginTop: 2 }}>{updatedAt}</div>
              </div>
            </div>

            {/* precio (dorado PRO por CSS) */}
            <div className="btc-price">{formatUSD(signal.price)}</div>

            {/* score */}
            <div style={{ marginTop: 18 }}>
              <div style={{ opacity: 0.7, marginBottom: 6 }}>Score</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 10 }}>
                {signal.score}/100
              </div>

              <div
                style={{
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
                    background:
                      scoreBar >= 75 ? "#22c55e" : scoreBar >= 50 ? "#fbbf24" : "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* métricas (responsive real) */}
            <div
              className="__grid4"
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 18,
              }}
            >
              <div>
                <div style={{ opacity: 0.65 }}>RSI (14)</div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>{signal.rsi14.toFixed(2)}</div>
                <div style={{ opacity: 0.6, marginTop: 4, fontSize: 13 }}>
                  1h:{" "}
                  {signal.change1h != null
                    ? `${signal.change1h > 0 ? "+" : ""}${signal.change1h.toFixed(2)}%`
                    : "—"}
                  {"  "}•{"  "}
                  24h:{" "}
                  {signal.change24h != null
                    ? `${signal.change24h > 0 ? "+" : ""}${signal.change24h.toFixed(2)}%`
                    : "—"}
                </div>
              </div>

              <div>
                <div style={{ opacity: 0.65 }}>EMA 50</div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>{formatUSD(signal.ema50)}</div>
              </div>

              <div>
                <div style={{ opacity: 0.65 }}>EMA 200</div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>{formatUSD(signal.ema200)}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ opacity: 0.65 }}>Rebote 2h</div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>
                  {signal.bounce2h != null
                    ? `${signal.bounce2h > 0 ? "+" : ""}${signal.bounce2h.toFixed(2)}%`
                    : "—"}
                </div>
              </div>
            </div>

            {/* velas */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>
                Gráfico de velas (últimas 72 horas)
              </div>

              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.14)",
                  padding: 12,
                }}
              >
                {candlesStatus === "loading" && (
                  <div style={{ opacity: 0.75 }}>Cargando velas...</div>
                )}

                {candlesStatus === "error" && (
                  <div style={{ color: "#fca5a5" }}>
                    No se pudieron cargar las velas desde <b>/api/candles</b>.
                    <div style={{ marginTop: 6, opacity: 0.85 }}>Detalle: {candlesError}</div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 8,
                    width: "100%",
                    height: 240,
                    position: "relative",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "block",
                      borderRadius: 16,
                      background: "rgba(0,0,0,0.22)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* CSS global */}
            <style jsx global>{`
              .btc-price {
                font-size: 64px;
                font-weight: 900;
                margin-top: 14px;
                letter-spacing: 0.5px;
                background: linear-gradient(
                  180deg,
                  #fff6d1 0%,
                  #f5b301 55%,
                  #c98600 100%
                );
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 0 28px rgba(245, 179, 1, 0.35);
              }

              @media (max-width: 900px) {
                .__grid4 {
                  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                }
              }
              @media (max-width: 520px) {
                .__grid4 {
                  grid-template-columns: 1fr !important;
                }
              }
            `}</style>
          </div>
        )}
      </div>
    </main>
  );
}
