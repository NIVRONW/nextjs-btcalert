"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "loading" | "ok" | "error";
type MarketPoint = { t: number; p: number };

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
        `${i === 0 ? "M" : "L"} ${scaleX(d.t).toFixed(2)} ${scaleY(d.p).toFixed(
          2
        )}`
    )
    .join(" ");
}

async function getBTC() {
  const res = await fetch("/api/btc", { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`/api/btc -> ${res.status}: ${text}`);
  const json = JSON.parse(text);

  const usd = Number(json.usd);
  const chg = json.chg === null ? null : Number(json.chg);

  if (!Number.isFinite(usd)) throw new Error("BTC usd inválido");
  return { usd, chg } as { usd: number; chg: number | null };
}

async function getChart() {
  const res = await fetch("/api/btc-chart", { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`/api/btc-chart -> ${res.status}: ${text}`);
  const json = JSON.parse(text);

  const prices: [number, number][] = json?.prices;
  if (!Array.isArray(prices) || prices.length < 10) throw new Error("Serie inválida");

  return prices.map(([t, p]) => ({ t: Number(t), p: Number(p) })) as MarketPoint[];
}

async function get24hChange() {
  // Si no existe el endpoint, devolvemos null y no rompemos UI
  try {
    const res = await fetch("/api/btc-24h", { cache: "no-store" });
    const text = await res.text().catch(() => "");
    if (!res.ok) return null;
    const json = JSON.parse(text);
    const chg = Number(json?.chg);
    return Number.isFinite(chg) ? chg : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [price, setPrice] = useState<number | null>(null);
  const [chg24, setChg24] = useState<number | null>(null);
  const [series, setSeries] = useState<MarketPoint[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [debug, setDebug] = useState<string>("");

  async function refresh() {
    try {
      setStatus("loading");
      setDebug("");

      const [p, s, chg] = await Promise.all([getBTC(), getChart(), get24hChange()]);
      setPrice(p.usd);
      setSeries(s);

      // Si tu /api/btc no trae cambio 24h, usamos el de /api/btc-24h
      // Si no existe /api/btc-24h, queda null y mostramos "--"
      setChg24(chg ?? p.chg
