"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pct as fmtPct } from "@/lib/format";
import {
  SYSTEM_RECOVERY_MODE_TCR_PCT,
  type MezoNetwork,
} from "@/lib/mezo/verified";
import { createMezoClient } from "@/lib/mezo/client";
import {
  fetchBtcUsdPrice,
  type MezoReadClient,
  type OracleReading,
} from "@/lib/mezo/oracle";
import {
  fetchProtocolSnapshot,
  MEZO_PROTOCOL_SOURCE,
  MEZO_TCR_SOURCE,
  MEZO_TROVE_MANAGER_CONTRACT_SOURCE,
  type ProtocolSnapshot,
} from "@/lib/mezo/protocol";
import { ISSUANCE_FEE_PCT, REDEMPTION_FEE_PCT } from "@/lib/engine/fees";
import { dateTime, timeAgo } from "@/lib/format";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      oracle: OracleReading;
      protocol: ProtocolSnapshot;
      nowMs: number;
    };

export interface ProtocolHealthProps {
  network: MezoNetwork;
  /** Optional override; when present the panel reads TCR with it. */
  spotPriceUsd?: number;
  className?: string;
}

/** Fee rates are small; two decimals keeps 0.75% from reading as 0.8%. */
function pct2(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function Stat({
  label,
  value,
  note,
  tone = "ink",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ink" | "risk" | "amber" | "accent";
}) {
  const toneClass =
    tone === "risk"
      ? "text-risk"
      : tone === "amber"
        ? "text-amber"
        : tone === "accent"
          ? "text-accent"
          : "text-ink";
  return (
    <div className="bg-surface-strong px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-widest text-ink-faint">{label}</p>
      <p className={`tabular mt-1 text-sm font-medium ${toneClass}`}>{value}</p>
      {note && <p className="mt-0.5 text-[10px] leading-snug text-ink-faint">{note}</p>}
    </div>
  );
}

/**
 * Live system-health reads for the MUSD system.
 *
 * This is deliberately separate from any single position: MCR,
 * the system TCR, and the two live fee rates come from the protocol
 * contracts, and the panel labels them as on-chain so they are never
 * confused with the docs-derived assumptions used in the cost model.
 */
export function ProtocolHealth({ network, spotPriceUsd, className }: ProtocolHealthProps) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const client: MezoReadClient = useMemo(() => createMezoClient(network), [network]);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    const oracle = await fetchBtcUsdPrice(network, client);
    const priceUsd = spotPriceUsd ?? (oracle.kind === "ok" ? oracle.priceUsd : null);
    const protocol: ProtocolSnapshot =
      priceUsd === null
        ? {
            kind: "error",
            stage: "rpc",
            message:
              "The BTC/USD oracle read did not produce a usable price, so the system collateral ratio cannot be calculated.",
          }
        : await fetchProtocolSnapshot(network, client, priceUsd);
    setState({ status: "done", oracle, protocol, nowMs: Date.now() });
    setNow(Date.now());
  }, [network, client, spotPriceUsd]);

  useEffect(() => {
    const t = setTimeout(() => {
      setState({ status: "idle" });
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const decoded = state.status === "done" ? state.protocol : null;
  const oracle = state.status === "done" ? state.oracle : null;

  return (
    <div
      className={
        className ?? "flex flex-col gap-3 border border-hairline bg-background p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          System health · live on-chain
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-surface-strong"
        >
          {state.status === "loading" ? "Reading…" : "Refresh"}
        </button>
      </div>

      {state.status === "loading" && (
        <p className="text-xs text-ink-faint">
          Reading TroveManager and BorrowerOperations on {network.label}…
        </p>
      )}

      {state.status === "idle" && (
        <p className="text-xs text-ink-faint">No protocol reading yet.</p>
      )}

      {decoded?.kind === "error" && (
        <p className="text-xs text-risk">
          Protocol read failed ({decoded.stage}: {decoded.message}). No system
          number is invented and the documented parameters still apply below.
        </p>
      )}

      {decoded?.kind === "ok" && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden border border-hairline bg-hairline sm:grid-cols-4">
            <Stat
              label="System TCR"
              value={fmtPct(decoded.tcrPct)}
              note={
                decoded.recoveryMode
                  ? `Below the ${SYSTEM_RECOVERY_MODE_TCR_PCT}% Recovery Mode trigger`
                  : `Above the ${SYSTEM_RECOVERY_MODE_TCR_PCT}% Recovery Mode trigger`
              }
              tone={decoded.recoveryMode ? "amber" : "ink"}
            />
            <Stat
              label="MCR"
              value={fmtPct(decoded.mcrPct)}
              note="Per-trove liquidation line"
            />
            <Stat
              label="Borrowing fee"
              value={pct2(decoded.borrowingFeePct)}
              note={`Docs: ${ISSUANCE_FEE_PCT}%`}
            />
            <Stat
              label="Redemption fee"
              value={pct2(decoded.redemptionFeePct)}
              note={`Docs: ${REDEMPTION_FEE_PCT}%`}
            />
          </dl>

          <ul className="space-y-1 text-[11px] leading-relaxed text-ink-soft">
            <li>
              <span
                className={`rounded-sm border px-1.5 text-[10px] uppercase tracking-wider ${
                  decoded.recoveryMode
                    ? "border-amber/40 bg-amber/5 text-amber"
                    : "border-accent/40 bg-accent/5 text-accent"
                }`}
              >
                {decoded.recoveryMode ? "Recovery Mode active" : "Not in Recovery Mode"}
              </span>{" "}
              System TCR is {decoded.recoveryMode ? "below" : "at or above"} the
              documented {SYSTEM_RECOVERY_MODE_TCR_PCT}% trigger. This is a
              market-level condition, not a per-position liquidation line.
            </li>
            <li>
              <span
                className={`rounded-sm border px-1.5 text-[10px] uppercase tracking-wider ${
                  decoded.redemptionsOpen
                    ? "border-accent/40 bg-accent/5 text-accent"
                    : "border-risk/40 bg-risk/5 text-risk"
                }`}
              >
                {decoded.redemptionsOpen ? "Redemptions open" : "Redemptions closed"}
              </span>{" "}
              Redemption requires the system TCR to be at or above the MCR
              (the docs&apos; &ldquo;Cannot redeem when TCR &lt; MCR&rdquo;).
            </li>
            <li className="tabular text-ink-faint">
              MCR, TCR, borrowingRate and redemptionRate were read at block{" "}
              {decoded.blockNumber} on chain id {decoded.chainId} using a BTC/USD
              price of{" "}
              {decoded.priceUsdUsed.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
              .
            </li>
            {oracle?.kind === "ok" && (
              <li className={oracle.stale ? "text-amber" : "text-ink-faint"}>
                Oracle updated {dateTime(oracle.updatedAtMs)}
                {now !== null ? ` (${timeAgo(oracle.updatedAtMs, now)})` : ""}
                {oracle.stale ? " — stale, treat system figures as historical." : "."}
              </li>
            )}
            {oracle?.kind === "error" && (
              <li className="text-amber">
                Oracle read failed ({oracle.stage}); the TCR above uses the price
                you entered instead of a live oracle price.
              </li>
            )}
          </ul>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Reads <code className="tabular">MCR()</code> and{" "}
        <code className="tabular">getTCR(price)</code> from the TroveManager proxy,
        and <code className="tabular">borrowingRate()</code> /{" "}
        <code className="tabular">redemptionRate()</code> from BorrowerOperations.
        Selectors verified against{" "}
        <a
          href={MEZO_TROVE_MANAGER_CONTRACT_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          TroveManager.sol
        </a>{" "}
        and live mainnet. Fee context:{" "}
        <a
          href={MEZO_PROTOCOL_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          MUSD fees
        </a>{" "}
        and{" "}
        <a
          href={MEZO_TCR_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          redemption guide
        </a>
        . Read-only, no wallet, no signing.
      </p>
    </div>
  );
}
