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
  bounce2h?: number;
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

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = cssW;
  const H = cssH;

  ctx.clearRect(0, 0, W, H);

  if (!candles?.length) return;

  const pad = 14;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;

  let minP = Infinity;
  let maxP = -Infinity;

  for (const c of candles) {
    minP = Math.min(minP, c.l);
    maxP = Math.max(maxP, c.h);
  }

  const span = Math.max(1e-9, maxP - minP);
  const xStep = innerW / candles.length;

  const yOf = (p: number) =>
    pad + (maxP - p) * (innerH / span);

  candles.forEach((c, i) => {
    const x = pad + i * xStep + xStep / 2;
    const yH = yOf(c.h);
    const yL = yOf(c.l);
    const yO = yOf(c.o);
    const yC = yOf(c.c);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();

    const up = c.c >= c.o;
    ctx.fillStyle = up ? "#22c55e" : "#ef4444";

    const top = Math.min(yO, yC);
    const height = Math.max(2, Math.abs(yO - yC));

    ctx.fillRect(x - 4, top, 8, height);
  });
}

export default function Home() {
  const DEPLOY_MARKER = "BTCALERT-FULL-PREMIUM-V1";

  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [candles, setCandles] = useState<Candle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function loadSignal() {
    try {
      const s = await fetchJSON("/api/signal");
      setSignal(s?.lastSignal ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  async function loadCandles() {
    try {
      const j = await fetchJSON("/api/candles?limit=72");
      setCandles(j?.candles ?? []);
    } catch {}
  }

  useEffect(() => {
    loadSignal();
    loadCandles();
    const id = setInterval(() => {
      loadSignal();
      loadCandles();
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawCandles(canvasRef.current, candles);
  }, [candles]);

  const scoreBar = signal ? clamp(signal.score, 0, 100) : 0;
  const updatedAt = signal?.at
    ? new Date(signal.at).toLocaleString()
    : "";

  const bgGlow = useMemo(() => {
    if (!signal) return "";
    if (signal.action === "BUY")
      return "radial-gradient(800px 420px at 20% 0%, rgba(34,197,94,0.18), transparent 60%)";
    if (signal.action === "SELL")
      return "radial-gradient(800px 420px at 20% 0%, rgba(239,68,68,0.18), transparent 60%)";
    return "radial-gradient(800px 420px at 20% 0%, rgba(245,179,1,0.18), transparent 60%)";
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
      <div
        style={{
          position: "fixed",
          left: 10,
          bottom: 10,
          fontSize: 11,
          opacity: 0.2,
        }}
      >
        {DEPLOY_MARKER}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* HEADER */}
        <header style={{ textAlign: "center", marginBottom: 12 }}>
          <div className="title-main">₿ BTCALERT</div>
          <div className="title-sub">
            MONITOREO Y ALERTA DE INVERSION
          </div>
        </header>

        {/* GOLD GLOW */}
        <div className="gold-bar-wrapper">
          <div className="gold-bar" />
          <div className="gold-glow" />
        </div>

        {signal && (
          <div className="card">
            <div className="top-row">
              <div>
                <div className="status-dot" />
                <div className="status-text">
                  {signal.action === "NONE"
                    ? "Sin señal clara"
                    : signal.action}
                </div>
                <div className="status-sub">
                  El mercado no muestra una oportunidad sólida ahora mismo.
                </div>
              </div>
              <div className="updated">
                Última actualización
                <div>{updatedAt}</div>
              </div>
            </div>

            <div className="btc-price">
              {formatUSD(signal.price)}
            </div>

            <div className="score-block">
              <div>Score</div>
              <div className="score-value">
                {signal.score}/100
              </div>
              <div className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${scoreBar}%` }}
                />
              </div>
            </div>

            <div className="metrics-grid">
              <div>
                <div>RSI (14)</div>
                <div>{signal.rsi14.toFixed(2)}</div>
              </div>
              <div>
                <div>EMA 50</div>
                <div>{formatUSD(signal.ema50)}</div>
              </div>
              <div>
                <div>EMA 200</div>
                <div>{formatUSD(signal.ema200)}</div>
              </div>
              <div>
                <div>Rebote 2h</div>
                <div>
                  {signal.bounce2h
                    ? `${signal.bounce2h.toFixed(2)}%`
                    : "—"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <canvas
                ref={canvasRef}
                style={{
                  width: "100%",
                  height: 240,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .title-main {
          font-size: 36px;
          font-weight: 900;
          color: #f5b301;
        }

        .title-sub {
          font-size: 18px;
          font-weight: 800;
          color: #f5b301;
          letter-spacing: 2px;
        }

        .gold-bar-wrapper {
          position: relative;
          height: 26px;
          margin-bottom: 14px;
        }

        .gold-bar {
          width: 70%;
          height: 2px;
          margin: 0 auto;
          background: linear-gradient(
            90deg,
            transparent,
            #f5b301,
            transparent
          );
          box-shadow: 0 0 22px rgba(245,179,1,0.4);
        }

        .gold-glow {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          width: 70%;
          height: 70px;
          background: radial-gradient(
            closest-side,
            rgba(245,179,1,0.3),
            transparent
          );
        }

        .card {
          border-radius: 22px;
          padding: 22px;
          background: linear-gradient(
            145deg,
            rgba(10,16,30,0.95),
            rgba(5,10,20,0.95)
          );
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }

        .btc-price {
          font-size: 64px;
          font-weight: 900;
          background: linear-gradient(
            180deg,
            #fff6d1,
            #f5b301 60%,
            #c98600
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 30px rgba(245,179,1,0.35);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
          margin-top: 20px;
        }

        @media (max-width: 900px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 520px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
