"use client";

import { useCallback, useSyncExternalStore, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  analyzePricePath,
  PATH_PRESETS,
  summarizePricePath,
  type PricePath,
} from "@/lib/engine/paths";
import type { RiskModelInput } from "@/lib/engine/risk";
import {
  DEFAULT_LAB,
  type LabInputs,
} from "@/lib/engine/scenarios";
import { INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT } from "@/lib/mezo/verified";
import { pct as fmtPct, ratio as fmtRatio, usd } from "@/lib/format";
import { PathCompareChart } from "@/components/charts";
import {
  saveReportSnapshot,
  STUDIO_STORAGE_KEY,
  type ReportSnapshot,
} from "@/lib/report";
import {
  createStableReader,
  notifyStorageChanged,
  subscribeToStorage,
} from "@/lib/local-store";

/**
 * Up to three user-named hypothetical price paths. State lives in
 * local storage so a comparison survives reloads, with explicit reset
 * and delete controls. Nothing here is a prediction or protocol data;
 * every path is a what-if drawn by the user.
 */
const MAX_PATHS = 3;

const LINE_COLORS = ["#0f766e", "#b45309", "#4a4f5a"];

interface StoredPath {
  id: string;
  name: string;
  stepLabel: string;
  /** Stored as strings so an empty edit box can be validated separately. */
  dropStrings: string[];
}

function defaultStoredPaths(): StoredPath[] {
  return PATH_PRESETS.slice(0, MAX_PATHS).map((p, i) => ({
    id: p.id,
    name: p.name,
    stepLabel: p.stepLabel,
    dropStrings: [...PATH_PRESETS[i].dropPcts].map(String),
  }));
}

function parseDrops(dropStrings: string[]): { drops: number[]; invalidIndexes: number[] } {
  const drops: number[] = [];
  const invalidIndexes: number[] = [];
  dropStrings.forEach((raw, i) => {
    const n = Number(raw.replace(/,/g, "").replace("%", ""));
    if (/^\s*$/.test(raw) || !Number.isFinite(n) || n < 0 || n > 100) {
      invalidIndexes.push(i);
      drops.push(0);
      return;
    }
    drops.push(n);
  });
  return { drops, invalidIndexes };
}

function loadStoredPaths(raw: string): StoredPath[] | null {
  const parsed = JSON.parse(raw) as StoredPath[];
  if (!Array.isArray(parsed) || parsed.length > MAX_PATHS) {
    return null;
  }
  return parsed.map((p, i) => ({
    id: typeof p.id === "string" ? p.id : `path-${i + 1}`,
    name: typeof p.name === "string" && p.name.trim() !== "" ? p.name : `Path ${i + 1}`,
    stepLabel: typeof p.stepLabel === "string" && p.stepLabel.trim() !== "" ? p.stepLabel : "Step",
    dropStrings: Array.isArray(p.dropStrings)
      ? p.dropStrings.map((d) => String(d))
      : [],
  }));
}

/** Stable reader over the studio's saved paths; server sees null. */
const readStudioPaths = createStableReader<StoredPath[] | null>({
  storage: () => window.localStorage,
  key: STUDIO_STORAGE_KEY,
  parse: loadStoredPaths,
  empty: () => null,
});

/** Write the paths through, then wake subscribers on this tab. */
function saveStudioPaths(next: StoredPath[]): void {
  try {
    window.localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode); the session still works.
  }
  notifyStorageChanged();
}

export function ScenarioStudio() {
  const router = useRouter();
  // Position inputs mirror the lab defaults; the studio reuses the same
  // engine input shape so both tools agree on the math.
  const [fields, setFields] = useState<LabInputs>(DEFAULT_LAB);
  // Saved paths read through the storage store: server and first client
  // render see null (so the presets render), then the stored value loads.
  const storedPaths = useSyncExternalStore(
    subscribeToStorage,
    readStudioPaths,
    () => null,
  );
  const paths = storedPaths ?? defaultStoredPaths();

  const parsedFields = useMemo(() => {
    const btc = Number(String(fields.btcCollateral).replace(/,/g, ""));
    const debt = Number(String(fields.musdDebt).replace(/,/g, ""));
    const price = Number(String(fields.btcPriceUsd).replace(/,/g, ""));
    const valid = (v: number) => Number.isFinite(v) && v > 0;
    if (!valid(btc) || !valid(debt) || !valid(price)) return null;
    return {
      btcCollateral: btc,
      musdDebt: debt,
      btcPriceUsd: price,
      liquidationThresholdPct: fields.liquidationThresholdPct,
    } satisfies RiskModelInput;
  }, [fields]);

  const evaluated = useMemo(() => {
    if (!parsedFields || !paths) return [];
    return paths.map((p, pi) => {
      const { drops, invalidIndexes } = parseDrops(p.dropStrings);
      const path: PricePath = {
        id: p.id,
        name: p.name || `Path ${pi + 1}`,
        stepLabel: p.stepLabel || "Step",
        dropPcts: drops,
      };
      return {
        stored: p,
        invalidIndexes,
        color: LINE_COLORS[pi % LINE_COLORS.length],
        points: analyzePricePath(parsedFields, path),
        summary: summarizePricePath(parsedFields, path),
      };
    });
  }, [parsedFields, paths]);

  const setName = (id: string, name: string) => {
    saveStudioPaths(paths.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const setStepLabel = (id: string, stepLabel: string) => {
    saveStudioPaths(paths.map((p) => (p.id === id ? { ...p, stepLabel } : p)));
  };

  const setDrop = (id: string, index: number, raw: string) => {
    saveStudioPaths(
      paths.map((p) =>
        p.id === id
          ? { ...p, dropStrings: p.dropStrings.map((d, i) => (i === index ? raw : d)) }
          : p,
      ),
    );
  };

  const addStage = (id: string) => {
    saveStudioPaths(
      paths.map((p) =>
        p.id === id ? { ...p, dropStrings: [...p.dropStrings, "0"] } : p,
      ),
    );
  };

  const removeStage = (id: string, index: number) => {
    saveStudioPaths(
      paths.map((p) =>
        p.id === id
          ? { ...p, dropStrings: p.dropStrings.filter((_, i) => i !== index) }
          : p,
      ),
    );
  };

  const replaceWithPreset = (id: string, presetId: string) => {
    const preset = PATH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    saveStudioPaths(
      paths.map((p) =>
        p.id === id
          ? {
              id: p.id,
              name: preset.name,
              stepLabel: preset.stepLabel,
              dropStrings: [...preset.dropPcts].map(String),
            }
          : p,
      ),
    );
  };

  const deletePath = (id: string) => {
    saveStudioPaths(paths.filter((p) => p.id !== id));
  };

  const addPath = () => {
    if (paths.length >= MAX_PATHS) return;
    const nextId = `path-${Date.now()}`;
    const preset = PATH_PRESETS[paths.length % PATH_PRESETS.length];
    saveStudioPaths([
      ...paths,
      {
        id: nextId,
        name: preset.name,
        stepLabel: preset.stepLabel,
        dropStrings: [...preset.dropPcts].map(String),
      },
    ]);
  };

  const resetAll = () => saveStudioPaths(defaultStoredPaths());

  const clearAll = () => saveStudioPaths([]);

  const openReport = useCallback(() => {
    if (!parsedFields || !paths || paths.length === 0) return;
    const snapshot: ReportSnapshot = {
      generatedAt: new Date().toISOString(),
      origin: "studio",
      inputs: parsedFields,
      paths: paths.map((p) => ({
        name: p.name,
        stepLabel: p.stepLabel,
        dropPcts: parseDrops(p.dropStrings).drops,
      })),
    };
    if (saveReportSnapshot(snapshot)) router.push("/report");
  }, [parsedFields, paths, router]);

  const maxStep = evaluated.reduce((m, e) => Math.max(m, e.points.length), 0);
  const sharedThreshold = parsedFields?.liquidationThresholdPct ?? DEFAULT_LAB.liquidationThresholdPct;
  const fieldError =
    parsedFields === null
      ? "All three position inputs must be numbers greater than zero."
      : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Scenario Studio
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Compare up to three hypothetical price paths against the same
            position. The math is the tested engine from the Risk Lab; the
            scenarios themselves are drawn by you, not by the protocol.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-strong"
          >
            Reset to presets
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-soft transition-colors hover:bg-surface-strong"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={openReport}
            disabled={!parsedFields || evaluated.length === 0}
            className="rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Printable report
          </button>
        </div>
      </div>

      {/* Position inputs, shared by all paths */}
      <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
        <h2 className="mb-1 text-sm font-semibold text-ink">Shared position</h2>
        <p className="mb-5 text-xs text-ink-faint">
          Every path evaluates this same hypothetical position. Defaults match
          the Stress Lab sample: 0.25 BTC, 11,165 MUSD debt at $67,000.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {(
            [
              ["BTC collateral", "btcCollateral", "BTC", "0.0001"],
              ["MUSD debt (total)", "musdDebt", "MUSD", "100"],
              ["Spot BTC price", "btcPriceUsd", "USD / BTC", "100"],
            ] as const
          ).map(([label, key, suffix, step]) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-soft">{label}</span>
              <div
                className={`flex items-baseline border bg-background px-3 py-2 focus-within:border-ink ${
                  !Number.isFinite(
                    Number(String(fields[key]).replace(/,/g, "")),
                  ) ||
                  Number(String(fields[key]).replace(/,/g, "")) <= 0
                    ? "border-amber/60"
                    : "border-hairline"
                }`}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={step}
                  value={String(fields[key])}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                  className="tabular w-full bg-transparent text-sm outline-none"
                  aria-label={label}
                />
                <span className="ml-2 shrink-0 text-[11px] text-ink-faint">{suffix}</span>
              </div>
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between text-xs font-medium text-ink-soft">
              Liquidation threshold
              <span className="tabular text-sm font-semibold text-ink">
                {fields.liquidationThresholdPct}%
              </span>
            </span>
            <input
              type="range"
              min={100}
              max={200}
              step={1}
              value={fields.liquidationThresholdPct}
              onChange={(e) =>
                setFields((prev) => ({
                  ...prev,
                  liquidationThresholdPct: Number(e.target.value),
                }))
              }
              className="accent-ink self-center w-full"
              aria-label="Liquidation threshold in percent"
            />
            <span className="text-[11px] text-ink-faint">
              {INDIVIDUAL_MIN_COLLATERAL_RATIO_PCT}% is the documented default.
            </span>
          </label>
        </div>
        {fieldError && (
          <p className="mt-3 text-xs text-amber">{fieldError}</p>
        )}
      </section>

      {/* Compared paths */}
      {evaluated.length > 0 && parsedFields && (
        <>
          <section className="mb-12 border border-hairline bg-surface-strong p-4 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Collateral ratio over time
                </h2>
                <p className="text-xs text-ink-soft">
                  Each line ends where its path ends. Dashed line: the
                  {` ${sharedThreshold}%`} threshold.
                </p>
              </div>
              <span className="hidden rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-ink-faint sm:inline">
                Hypothetical
              </span>
            </div>
            <PathCompareChart
              paths={evaluated.map((e) => ({
                id: e.stored.id,
                name: e.stored.name,
                color: e.color,
                points: e.points.map((pt) => ({
                  step: pt.step,
                  ratioPct: pt.collateralRatio * 100,
                })),
              }))}
              thresholdPct={sharedThreshold}
              maxStep={maxStep}
            />
          </section>

          <section className="mb-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {evaluated.map((e, pi) => (
              <div
                key={e.stored.id}
                className="flex flex-col border border-hairline bg-surface-strong p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-6 rounded-full"
                    style={{ background: e.color }}
                  />
                  <span className="text-[10px] uppercase tracking-widest text-ink-faint">
                    Path {pi + 1} · hypothetical
                  </span>
                </div>
                <input
                  type="text"
                  value={e.stored.name}
                  onChange={(ev) => setName(e.stored.id, ev.target.value)}
                  placeholder={`Path ${pi + 1} name`}
                  className="mt-2 w-full border border-hairline bg-background px-2 py-1.5 text-sm font-medium outline-none focus:border-ink"
                  aria-label={`Name of path ${pi + 1}`}
                />

                {/* Preset picker */}
                <label className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-soft">
                  <span className="shrink-0">Base preset</span>
                  <select
                    value=""
                    onChange={(ev) => {
                      if (ev.target.value !== "") replaceWithPreset(e.stored.id, ev.target.value);
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-hairline bg-background px-2 py-1 text-xs"
                    aria-label={`Load a preset into path ${pi + 1}`}
                  >
                    <option value="">Choose a preset…</option>
                    {PATH_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Steps */}
                <div className="mt-3">
                  <label className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                    <span>Time unit between steps</span>
                    <input
                      type="text"
                      value={e.stored.stepLabel}
                      onChange={(ev) => setStepLabel(e.stored.id, ev.target.value)}
                      className="w-24 rounded-sm border border-hairline bg-background px-2 py-1 text-xs"
                      aria-label={`Time unit for path ${pi + 1}`}
                    />
                  </label>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    Price drop at each step, in percent from the previous step.
                  </p>
                  <ul className="mt-1 space-y-1">
                    {e.stored.dropStrings.map((raw, si) => (
                      <li key={si} className="flex items-center gap-2">
                        <span className="tabular w-20 shrink-0 text-[11px] text-ink-faint">
                          {e.stored.stepLabel || "Step"} {si + 1}
                        </span>
                        <div
                          className={`flex items-baseline border bg-background px-2 py-1 ${
                            e.invalidIndexes.includes(si) ? "border-amber/60" : "border-hairline"
                          }`}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={1}
                            value={raw}
                            onChange={(ev) => setDrop(e.stored.id, si, ev.target.value)}
                            className="tabular w-16 bg-transparent text-xs outline-none"
                            aria-label={`${e.stored.name} drop at step ${si + 1} in percent`}
                          />
                          <span className="ml-1 text-[10px] text-ink-faint">%</span>
                        </div>
                        <span className="tabular flex-1 text-right text-[11px] text-ink-faint">
                          {e.points[si] ? usd(e.points[si].priceUsd, 0) : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStage(e.stored.id, si)}
                          className="shrink-0 px-1 text-[11px] text-ink-faint transition-colors hover:text-risk"
                          aria-label={`Remove step ${si + 1} of ${e.stored.name}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => addStage(e.stored.id)}
                    className="mt-1.5 rounded-sm border border-dashed border-hairline px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:border-ink"
                  >
                    + add step
                  </button>
                  {e.invalidIndexes.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber">
                      Empty or invalid steps are treated as 0. Values must be
                      numbers from 0 to 100.
                    </p>
                  )}
                </div>

                {/* Summary */}
                <dl className="mt-4 border-t border-hairline text-xs">
                  {[
                    [
                      "Lowest ratio",
                      `${fmtRatio(e.summary.lowestRatio)} at ${usd(e.summary.lowestRatioPriceUsd, 0)}`,
                    ],
                    [
                      "First threshold breach",
                      e.summary.firstBreach
                        ? `${e.summary.firstBreach.label} (${"−"}${fmtPct(e.summary.firstBreach.cumulativeDropPct)} from spot)`
                        : "None along this path",
                    ],
                    [
                      "Ending collateral value",
                      `${usd(e.summary.endingCollateralValueUsd, 0)} (ratio ${fmtRatio(e.summary.endingCollateralRatio)})`,
                    ],
                    [
                      "Ending price",
                      `${usd(e.summary.endingPriceUsd, 0)} after ${"−"}${fmtPct(e.summary.maxCumulativeDropPct)} total`,
                    ],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="text-ink-faint">{term}</dt>
                      <dd className="tabular text-right text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={() => deletePath(e.stored.id)}
                  className="mt-3 w-fit rounded-sm border border-hairline px-2 py-1 text-[11px] text-ink-soft transition-colors hover:border-risk/50 hover:text-risk"
                >
                  Delete path
                </button>
              </div>
            ))}
            {evaluated.length < MAX_PATHS && (
              <button
                type="button"
                onClick={addPath}
                className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-hairline bg-surface-strong p-4 text-sm text-ink-soft transition-colors hover:border-ink"
              >
                <span className="text-lg">+</span>
                Add a path ({evaluated.length} of {MAX_PATHS})
              </button>
            )}
          </section>

          <p className="text-xs text-ink-faint">
            All paths are hypothetical and stay in this browser&apos;s local
            storage. They are not Mezo data, not positions, and not
            predictions. The engine computes each step the same way the
            Stress Lab does.
          </p>
        </>
      )}

      {paths && paths.length === 0 && (
        <section className="border border-dashed border-hairline p-10 text-center">
          <p className="text-sm text-ink-soft">
            No paths yet. Add one to start comparing.
          </p>
          <button
            type="button"
            onClick={addPath}
            className="mt-4 rounded-sm bg-ink px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-ink-soft"
          >
            Add a path
          </button>
        </section>
      )}
    </main>
  );
}
