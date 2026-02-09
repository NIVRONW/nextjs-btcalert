"use client";

import { useEffect, useRef, useState } from "react";

type Candle = { t: number; o: number; h: number; l: number; c: number };

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function drawCandles(canvas: HTMLCanvasElement, candles: Candle[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  if (!cssW || !cssH) return;

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0, 0, cssW, cssH);

  if (!candles.length) return;

  let min = Infinity;
  let max = -Infinity;

  candles.forEach(c => {
    min = Math.min(min, c.l);
    max = Math.max(max, c.h);
  });

  const span = max - min;
  const pad = 20;
  const width = cssW - pad * 2;
  const height = cssH - pad * 2;
  const step = width / candles.length;

  const y = (p: number) =>
    pad + (max - p) * (height / span);

  candles.forEach((c, i) => {
    const x = pad + i * step + step / 2;
    const up = c.c >= c.o;

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(x, y(c.h));
    ctx.lineTo(x, y(c.l));
    ctx.stroke();

    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    const top = Math.min(y(c.o), y(c.c));
    const h = Math.abs(y(c.o) - y(c.c));
    ctx.fillRect(x - 4, top, 8, Math.max(2, h));
  });
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [price] = useState(71048.32);

  const candles: Candle[] = []; // aquí irían las reales

  useEffect(() => {
    if (!canvasRef.current) return;
    drawCandles(canvasRef.current, candles);
  }, [candles]);

  return (
    <main className="page">

      <header className="header">
        ₿ BTCALERT – MONITOREO Y ALERTA DE INVERSION
      </header>

      <div className="card">

        <div className="left">

          <div className="status">
            <span className="dot" />
            Sin señal clara
          </div>

          <div className="price">
            {formatUSD(price)}
          </div>

          <div className="chart-title">
            Gráfico de velas (últimas 72 horas)
          </div>

          <div className="chart">
            <canvas ref={canvasRef} />
          </div>

        </div>

        <div className="right">
          <div className="dev">Developed by</div>
          <div className="logo">N DIGITAL</div>
          <div className="powered">Powered by ChatGPT</div>
        </div>

      </div>

      <style jsx global>{`

        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at 50% 0%, rgba(255,180,60,0.25), transparent 40%),
            linear-gradient(#0a0f1c, #050912);
          color: white;
          padding: 40px;
          font-family: system-ui;
        }

        .header {
          text-align: center;
          font-weight: 900;
          font-size: 32px;
          color: #f5b301;
          margin-bottom: 30px;
          text-shadow: 0 0 25px rgba(245,179,1,0.5);
        }

        .card {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 40px;
          padding: 40px;
          border-radius: 24px;
          background: linear-gradient(160deg,#0f1628,#060b16);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow:
            0 40px 120px rgba(0,0,0,0.7),
            inset 0 -2px 40px rgba(245,179,1,0.15);
        }

        .price {
          font-size: 64px;
          font-weight: 900;
          background: linear-gradient(#fff6d1,#f5b301,#c98600);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 40px rgba(245,179,1,0.4);
        }

        .chart {
          margin-top: 20px;
          height: 260px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: inset 0 -30px 60px rgba(245,179,1,0.12);
        }

        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        .right {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          opacity: 0.8;
        }

      `}</style>

    </main>
  );
}
