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
  // opcional si lo tienes:
  bounce2h?: number; // porcentaje 0.55 = 0.55%
  change1h?: number;
  change24h?: number;
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

function headlineFromAction(action: Action) {
  if (action === "SELL") return "🔴 ES BUENA OPORTUNIDAD PARA VENDER 🔴";
  if (action === "BUY") return "🟢 ES BUENA OPORTUNIDAD PARA COMPRAR 🟢";
  return "";
}

function statusSubtitle(action: Action) {
  if (action === "BUY") return "Condiciones favorables para compra (confirmación aplicada).";
  if (action === "SELL") return "Condiciones favorables para venta.";
  return "El mercado no muestra una oportunidad sólida ahora mismo.";
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text);
}

function drawCandles(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  opts?: { bg?: string }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;

  // fondo
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = opts?.bg ?? "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, W, H);

  if (!candles?.length) return;

  const padL = 14;
  const padR = 10;
  const padT = 10;
  const padB = 16;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // rangos
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

  // grid suave
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

  // velas
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const xCenter = padL + xStep * (i + 0.5);

    const yH = yOf(c.h);
    const yL = yOf(c.l);
    const yO = yOf(c.o);
    const yC = yOf(c.c);

    const up = c.c >= c.o;

    // wick
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
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
  // 🔒 marcador para saber si Vercel está desplegando TU commit
  const DEPLOY_MARKER = "DEPLOY-2026-02-09-HEADER-2LINES-V1";

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesStatus, setCandlesStatus] = useState<Status>("loading");
  const [candlesError, setCandlesError] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // confirmación adicional BUY (puedes ajustar)
  const BUY_MIN_SCORE = 80;

  async function loadSignal() {
    try {
      setStatus("loading");
      const s = await fetchJSON("/api/signal");
      const last = (s?.lastSignal ?? null) as SignalPayload | null;

      // Confirmación adicional: si dice BUY pero score no llega, lo convertimos a NONE
      if (last && last.action === "BUY" && Number(last.score) < BUY_MIN_SCORE) {
        setSignal({ ...last, action: "NONE", verdict: false });
      } else {
        setSignal(last);
      }

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
        throw new Error("No llegaron velas suficientes desde /api/candles");
      }

      // asegurar orden por tiempo
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

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;

  // fondo cambia según acción
  const bgGlow = useMemo(() => {
    if (!signal)
      return "radial-gradient(800px 420px at 20% 0%, rgba(245,158,11,0.20), rgba(0,0,0,0) 55%)";
    if (signal.action === "BUY")
      return "radial-gradient(800px 420px at 20% 0%, rgba(34,197,94,0.18), rgba(0,0,0,0) 55%)";
    if (signal.action === "SELL")
      return "radial-gradient(800px 420px at 20% 0%, rgba(239,68,68,0.18), rgba(0,0,0,0) 55%)";
    return "radial-gradient(800px 420px at 20% 0%, rgba(245,158,11,0.20), rgba(0,0,0,0) 55%)";
  }, [signal]);

  // dibujar velas cuando existan
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const doDraw = () => drawCandles(canvas, candles);

    doDraw();

    const onResize = () => doDraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [candles]);

  const updatedAt = signal?.at ? new Date(signal.at).toLocaleString() : "";

  const topTitle = "₿ BTCALERT";
  const topSubtitle = "MONITOREO Y ALERTA DE INVERSION";
  const gold = "#f5b301";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 18,
        background: "#060a12",
        backgroundImage: bgGlow,
        color: "#e5e7eb",
        fontFamily: "system-ui",
      }}
    >
      {/* DEPLOY MARKER seguro (no rompe build) */}
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
        {/* HEADER 2 LÍNEAS CENTRADO */}
        <header style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              letterSpacing: 0.5,
              lineHeight: 1.05,
              color: gold,
              textTransform: "uppercase",
            }}
          >
            {topTitle}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 1.4,
              color: gold,
              textTransform: "uppercase",
            }}
          >
            {topSubtitle}
          </div>
        </header>

        {status === "loading" && <p>Cargando datos...</p>}
        {status === "error" && <p style={{ color: "#f87171" }}>Error cargando señal.</p>}

        {signal && (
          <div
            style={{
              borderRadius: 22,
              padding: 22,
              background: "rgba(10,16,30,0.78)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
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
                    {signal.action === "NONE" ? "Sin señal clara" : headlineFromAction(signal.action)}
                  </div>
                </div>
                <div style={{ marginTop: 8, opacity: 0.75 }}>{statusSubtitle(signal.action)}</div>
              </div>

              <div style={{ textAlign: "right", opacity: 0.75, fontWeight: 700 }}>
                <div>Última actualización</div>
                <div style={{ marginTop: 2 }}>{updatedAt}</div>
              </div>
            </div>

            {/* precio */}
            <div
              style={{
                fontSize: 58,
                fontWeight: 900,
                marginTop: 10,
                letterSpacing: 0.3,
              }}
            >
              {formatUSD(signal.price)}
            </div>

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

            {/* métricas */}
            {/* ✅ ARREGLO #1: agregar className="__grid4" para que el CSS responsive aplique */}
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
                  background: "rgba(0,0,0,0.18)",
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

                <div style={{ width: "100%", height: 240 }}>
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "block",
                      borderRadius: 12,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* responsive: 4 columnas -> 2 -> 1 */}
            <style jsx global>{`
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
