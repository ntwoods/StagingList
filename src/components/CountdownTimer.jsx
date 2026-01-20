import { useEffect, useState } from "react";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === "number") return timestamp;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getRemaining(primaryTimestamp, now) {
  const base = toMillis(primaryTimestamp);
  const remainingMs = base + THIRTY_MINUTES_MS - now;
  return {
    remainingMs,
    isOverdue: remainingMs <= 0
  };
}

export function formatRemaining(remainingMs) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
