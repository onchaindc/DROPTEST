export function usd(value: number, maxDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: value < 100 ? 2 : 0,
    style: "currency",
    currency: "USD",
  });
}

export function ratio(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function pct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function btc(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} BTC`;
}
