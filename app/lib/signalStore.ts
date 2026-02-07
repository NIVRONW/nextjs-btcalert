// app/lib/signalStore.ts
export type SignalPayload = {
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

let lastSignal: SignalPayload | null = null;

export function setSignal(v: SignalPayload) {
  lastSignal = v;
}

export function getSignal() {
  return lastSignal;
}

