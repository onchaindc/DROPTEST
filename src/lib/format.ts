export function usd(value: number, maxDigits = 2): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: value < 100 ? 2 : 0,
    style: "currency",
    currency: "USD",
  });
}

export function ratio(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function pct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

export function btc(amount: number): string {
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} BTC`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Format a timestamp as a human-readable date and time, UTC. */
export function dateTime(ms: number): string {
  if (!Number.isFinite(ms)) return "unknown";
  return dateTimeFormatter.format(new Date(ms)) + " UTC";
}

/** Rough relative age for freshness labels, e.g. "3 min ago". */
export function timeAgo(fromMs: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(fromMs)) return "unknown";
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
