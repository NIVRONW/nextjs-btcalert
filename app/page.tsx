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
  l
