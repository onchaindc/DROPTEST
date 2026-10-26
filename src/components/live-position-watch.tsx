"use client";

import { useCallback, useMemo, useState } from "react";

import {
  analyze,
  type RiskMetrics,
} from "@/lib/engine/risk";
import {
  INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT,
  SYSTEM_RECOVERY_MODE_TCR_PCT,
  type MezoNetwork,
} from "@/lib/mezo/verified";
import { createMezoClient } from "@/lib/mezo/client";
import { fetchBtcUsdPrice, type MezoReadClient, type OracleReading } from "@/lib/mezo/oracle";
import {
  fetchLiveTrove,
  liveTroveToPositionInput,
  troveStatusLabel,
  weiToTokens,
  totalDebtWei,
  accruedInterestSinceUpdate,
  MEZO_TROVE_MANAGER_SOURCE,
  type LiveTroveReading,
  type LivePositionInput,
} from "@/lib/mezo/live-position";
import { dateTime, timeAgo, usd as fmtUsd, pct as fmtPct, ratio as fmtRatio } from "@/lib/format";

export interface FilledLivePosition {
  /** The position values that came from the chain. */
  input: LivePositionInput;
  /** Oracle reading time, when the oracle read succeeded. */
  oracleUpdatedAtMs?: number;
  /** Block the trove was read at. */
  blockNumber: number;
  networkLabel: string;
}

export interface LivePositionWatchProps {
  /** Network the read targets. Must come from a labelled selector. */
  network: MezoNetwork;
  /**
   * Called with the verified live position when it fully loads, so the
   * Stress Lab can copy it into its inputs. Omitted in places without
   * lab inputs (e.g. the landing page).
   */
  onFill?: (filled: FilledLivePosition) => void;
}

function musd(amount: number): string {
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: Math.abs(amount) < 1 ? 4 : 2,
  })} MUSD`;
}

function btcAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} BTC`;
}

/** Small chip that says where a displayed number came from. */
function Provenance({ kind }: { kind: "on-chain" | "calculated" }) {
  return (
    <span
      className={`rounded-sm border px-1.5 text-[10px] uppercase tracking-wider ${
        kind === "on-chain"
          ? "border-accent/40 bg-accent/5 text-accent"
          : "border-hairline text-ink-faint"
      }`}
    >
      {kind === "on-chain" ? "on-chain" : "calculated"}
    </span>
  );
}

function Row({ label, provenance, children }: {
  label: string;
  provenance: "on-chain" | "calculated";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-2">
      <span className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          {label} <Provenance kind={provenance} />
        </span>
      </span>
      <span className="tabular text-sm text-ink">{children}</span>
    </div>
  );
}

type WatchState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "done";
      trove: LiveTroveReading;
      oracle: Extract<OracleReading, { kind: "ok" }> | null;
      oracleFailed: string | null;
      nowMs: number;
    };

/**
 * Live Position Watch: enter any public EVM address and read its real
 * trove from the TroveManager proxy on the selected Mezo network.
 * Strictly read-only: no wallet connection, no signing, no approvals,
 * no transactions — a pure eth_call workflow keyed by address.
 *
 * The failure taxonomy matters by design: "no position" (status
 * nonExistent) is a successful read and shown as such, while an RPC
 * failure or an undecodable response is an error that never pretends
 * to be a position. All computed fields (value, ratio, liquidation
 * price) are labelled "calculated"; chained fields are "on-chain".
 */
export function LivePositionWatch({ network, onFill }: LivePositionWatchProps) {
  const [addressInput, setAddressInput] = useState("");
  const [state, setState] = useState<WatchState>({ status: "idle" });

  const client: MezoReadClient = useMemo(() => createMezoClient(network), [network]);

  const fetchAddress = useCallback(async () => {
    const address = addressInput.trim();
    setState({ status: "loading" });
    const [trove, oracleResult] = await Promise.all([
      fetchLiveTrove(network, client, address),
      fetchBtcUsdPrice(network, client),
    ]);
    setState({
      status: "done",
      trove,
      oracle: oracleResult.kind === "ok" ? oracleResult : null,
      oracleFailed:
        oracleResult.kind === "error"
          ? `${oracleResult.stage}: ${oracleResult.message}`
          : null,
      nowMs: Date.now(),
    });
  }, [addressInput, client, network]);

  const reset = useCallback(() => {
    setAddressInput("");
    setState({ status: "idle" });
  }, []);

  const activePosition: RiskMetrics | null = useMemo(() => {
    if (state.status !== "done" || state.trove.kind !== "active" || !state.oracle) return null;
    const liveInput = liveTroveToPositionInput(state.trove.amounts, state.oracle.priceUsd);
    if (!liveInput) return null;
    try {
      // The documented 110% MCR is the per-trove liquidation line; it
      // is used for the live view exactly as the lab documents it.
      return analyze({ ...liveInput, liquidationThresholdPct: INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT });
    } catch {
      return null;
    }
  }, [state]);

  const fillReady =
    state.status === "done" &&
    state.trove.kind === "active" &&
    activePosition !== null &&
    onFill !== undefined;

  const handleFill = useCallback(() => {
    if (!fillReady || !onFill) return;
    if (state.status !== "done" || state.trove.kind !== "active" || !state.oracle) return;
    const liveInput = liveTroveToPositionInput(state.trove.amounts, state.oracle.priceUsd);
    if (!liveInput) return;
    onFill({
      input: liveInput,
      oracleUpdatedAtMs: state.oracle.updatedAtMs,
      blockNumber: state.trove.blockNumber,
      networkLabel: network.label,
    });
  }, [fillReady, onFill, state, network.label]);

  const accrued: bigint | null =
    state.status === "done" && state.trove.kind !== "empty" && state.trove.kind !== "error"
      ? accruedInterestSinceUpdate(state.trove.amounts)
      : null;

  return (
    <div className="flex flex-col gap-3 border border-hairline bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
          Live position watch · {network.label}
        </span>
        <button
          type="button"
          onClick={reset}
          className="rounded-sm border border-hairline px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-surface-strong"
        >
          {state.status === "loading" ? "Reading…" : "Reset"}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-soft">Public EVM address</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="0x…"
            className="tabular w-full min-w-0 border border-hairline bg-surface-strong px-3 py-2 text-sm outline-none focus-within:border-ink"
            aria-label="Public EVM address to read"
          />
          <button
            type="button"
            onClick={() => void fetchAddress()}
            disabled={state.status === "loading" || addressInput.trim() === ""}
            className="shrink-0 rounded-sm bg-ink px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.status === "loading" ? "Reading…" : "Read trove"}
          </button>
        </div>
        <span className="text-[11px] text-ink-faint">
          Read-only view calls. No wallet connection, no signing, no approvals.
        </span>
      </label>

      {state.status === "idle" && (
        <p className="text-xs text-ink-faint">Enter an address to look up its live trove.</p>
      )}

      {state.status === "loading" && (
        <p className="text-xs text-ink-faint">
          Reading <code className="break-all tabular">{network.contracts.troveManager}</code> on{" "}
          {network.label}, chain id {network.chainId}. The connected chain id is verified
          before any contract data is decoded.
        </p>
      )}

      {state.status === "done" && state.trove.kind === "empty" && (
        <p className="text-xs text-ink-soft">
          <span className="font-medium text-ink">No open position</span> for{" "}
          <code className="break-all tabular">{state.trove.address}</code>: the TroveManager
          reported status <code className="tabular">nonExistent</code> at block{" "}
          {state.trove.blockNumber}. This is a real on-chain answer, not an error.
        </p>
      )}

      {state.status === "done" && state.trove.kind === "closed" && (
        <p className="text-xs text-amber">
          The trove for <code className="break-all tabular">{state.trove.address}</code> is{" "}
          <code className="tabular">{state.trove.statusLabel}</code> (status{" "}
          {state.trove.status}) — it is not open, so there is nothing altruistically
          stress-testable here. Residual amounts show zero unless settled data remains.
        </p>
      )}

      {state.status === "done" && state.trove.kind === "active" && (
        <div className="flex flex-col">
          <Row label="Trove status" provenance="on-chain">
            {troveStatusLabel(state.trove.status)} · block {state.trove.blockNumber}
          </Row>
          <Row label="Collateral (incl. pending redistribution)" provenance="on-chain">
            {btcAmount(weiToTokens(state.trove.amounts.collWei))}
          </Row>
          <Row label="Principal debt" provenance="on-chain">
            {musd(weiToTokens(state.trove.amounts.principalWei))}
          </Row>
          <Row label="Interest total (stored + accrued to current block)" provenance="on-chain">
            {musd(weiToTokens(state.trove.amounts.interestWei))}
          </Row>
          {accrued !== null && (
            <Row label="…of which accrued since last update" provenance="calculated">
              {musd(weiToTokens(accrued))}
            </Row>
          )}
          {state.trove.amounts.interestRateBps !== null && (
            <Row label="Fixed per-trove interest rate" provenance="on-chain">
              {(state.trove.amounts.interestRateBps / 100).toFixed(2)}%
            </Row>
          )}
          {state.trove.amounts.lastInterestUpdateTimeSec !== null && (
            <Row label="Last interest settlement" provenance="on-chain">
              {dateTime(Number(state.trove.amounts.lastInterestUpdateTimeSec) * 1000)}
            </Row>
          )}
          {state.trove.amounts.pendingCollateralWei > 0n ||
          state.trove.amounts.pendingPrincipalWei > 0n ||
          state.trove.amounts.pendingInterestWei > 0n ? (
            <Row label="Pending redistribution (un-applied)" provenance="on-chain">
              {btcAmount(weiToTokens(state.trove.amounts.pendingCollateralWei))} +{" "}
              {musd(
                weiToTokens(
                  state.trove.amounts.pendingPrincipalWei +
                    state.trove.amounts.pendingInterestWei,
                ),
              )}
            </Row>
          ) : (
            <Row label="Pending redistribution (un-applied)" provenance="on-chain">
              none pending
            </Row>
          )}
          <Row label="Total debt (principal + interest)" provenance="calculated">
            {musd(weiToTokens(totalDebtWei(state.trove.amounts)))}
          </Row>
          {state.oracle && (
            <>
              <Row label="Oracle BTC/USD (Skip)" provenance="on-chain">
                {fmtUsd(state.oracle.priceUsd, 2)}
                {state.oracle.stale && (
                  <span className="ml-2 text-[11px] text-amber">
                    stale ({timeAgo(state.oracle.updatedAtMs, state.nowMs)})
                  </span>
                )}
              </Row>
              <Row label="Collateral value now" provenance="calculated">
                {fmtUsd(activePosition?.collateralValueUsd ?? Number.NaN, 0)}
              </Row>
              <Row label="Collateral ratio now" provenance="calculated">
                {fmtRatio(activePosition?.collateralRatio ?? Number.NaN)}
              </Row>
              <Row
                label={`Liquidation price at the documented ${INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% threshold`}
                provenance="calculated"
              >
                {fmtUsd(activePosition?.liquidationPriceUsd ?? Number.NaN, 0)}
                {" · drop "}
                {fmtPct(activePosition?.dropToLiquidationPct ?? Number.NaN)}
              </Row>
            </>
          )}
          {state.oracleFailed && (
            <p className="text-xs text-amber">
              Oracle read failed ({state.oracleFailed}). Position fields are live on-chain,
              but no ratio or liquidation price can be calculated without a real BTC/USD
              read — nothing was fabricated.
            </p>
          )}
          {state.oracle && (
            <p className="text-[11px] text-ink-faint">
              The {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% figure is the per-trove liquidation
              threshold. Recovery Mode is a system-wide trigger at {SYSTEM_RECOVERY_MODE_TCR_PCT}%{" "}
              total collateral ratio and is not shown per position.
            </p>
          )}
        </div>
      )}

      {state.status === "done" && state.trove.kind === "error" && (
        <p className="text-xs text-risk">
          Read failed ({state.trove.stage}: {state.trove.message}). No position was invented
          and no stale data was reused — check the RPC connection and try again.
        </p>
      )}

      {fillReady && (
        <button
          type="button"
          onClick={handleFill}
          className="w-fit rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
        >
          Load this position into the Stress Lab
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Reads <code className="break-all tabular">getTroveStatus(address)</code>,{" "}
        <code className="break-all tabular">getEntireDebtAndColl(address)</code>{" "}
        (debt/collateral/accrued interest/pending rewards semantics), and{" "}
        <code className="break-all tabular">Troves(address)</code> (rate + struct check) on
        the proxy{" "}
        <code className="break-all tabular">{network.contracts.troveManager}</code>, verified
        against{" "}
        <a
          href={MEZO_TROVE_MANAGER_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          mezo-org/musd TroveManager.sol
        </a>{" "}
        and the live chain before shipping.
      </p>
    </div>
  );
}
