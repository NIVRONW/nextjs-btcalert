"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "loading" | "ok" | "error";
type MarketPoint = { t: number; p: number };

type SignalPayload = {
  at: number;
  verdict: boolean;
  score: number;
  price: number;
  rsi14: number;
  ema50: number;
  ema200: number;
  change1h: number;
  change24h: number;
  rebound2h: number;
  reason: string[];
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function makePath(points: MarketPoint[], w = 520, h = 160, pad = 10) {
  const xs = points.map((d) => d.t);
  const ys = points.map((d) => d.p);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (x: number) =>
    pad + ((x - minX) / Math.max(1, maxX - minX)) * (w - pad * 2);

  const scaleY = (y: number) =>
    h - pad - ((y - minY) / Math.max(1, maxY - minY)) * (h - pad * 2);

  return points
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(2)}`
    )
    .join(" ");
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [price, setPrice] = useState<number | null>(null);
  const [chg24, setChg24] = useState<number | null>(null);
  const [series, setSeries] = useState<MarketPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [debug, setDebug] = useState("");

  // 🔔 Alertas
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alert, setAlert] = useState<SignalPayload | null>(null);
  const [alertToastOpen, setAlertToastOpen] = useState(false);

  const lastAlertAtRef = useRef<number>(0); // cooldown
  const lastSeenSignalAtRef = useRef<number>(0);

  // AudioContext se crea solo con gesto del usuario
  const audioCtxRef = useRef<AudioContext | null>(null);

  function playBeep() {
    try {
      const AudioContextImpl =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextImpl) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AudioContextImpl();
      const ctx = audioCtxRef.current;

      // Si está suspendido, intentar reanudar (puede requerir gesto)
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = 880;

      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime
