"use client";

import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { stateAtPrice, type ScenarioState } from "@/lib/engine/risk";
import { ratio as fmtRatio, pct as fmtPct, usd } from "@/lib/format";

const gridColor = "#eae7df";
const axisStyle = { fontSize: 11, fill: "#8a8d96" } as const;
const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e3e0d8",
  borderRadius: 2,
  fontSize: 12,
} as const;

interface RatioCurveProps {
  btcCollateral: number;
  musdDebt: number;
  spotPriceUsd: number;
  liquidationPriceUsd: number;
  liquidationThresholdPct: number;
}

/**
 * Collateral ratio as a function of BTC price, spot-relative window.
 * The red reference marks the configured liquidation threshold.
 */
export function RatioCurve({
  btcCollateral,
  musdDebt,
  spotPriceUsd,
  liquidationPriceUsd,
  liquidationThresholdPct,
}: RatioCurveProps) {
  const points = [];
  const low = Math.min(spotPriceUsd * 0.35, liquidationPriceUsd * 0.55);
  const high = spotPriceUsd * 1.6;
  for (let i = 0; i <= 60; i++) {
    const price = low + ((high - low) * i) / 60;
    points.push({
      price: Math.round(price),
      ratio: stateAtPrice(btcCollateral, musdDebt, price).collateralRatio * 100,
    });
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <ReferenceLine
          y={liquidationThresholdPct}
          stroke="#b91c1c"
          strokeDasharray="5 4"
          label={{ value: `Liquidation ${liquidationThresholdPct}%`, position: "insideTopLeft", fontSize: 10, fill: "#b91c1c" }}
        />
        <ReferenceLine
          x={Math.round(spotPriceUsd)}
          stroke="#16181d"
          label={{ value: "Spot", position: "top", fontSize: 10, fill: "#16181d" }}
        />
        <ReferenceDot
          x={Math.round(liquidationPriceUsd)}
          y={liquidationThresholdPct}
          r={4}
          fill="#b91c1c"
          stroke="none"
        />
        <XAxis
          dataKey="price"
          type="number"
          tick={axisStyle}
          tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
          tickLine={false}
          stroke={gridColor}
        />
        <YAxis
          tick={axisStyle}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
          tickLine={false}
          width={44}
          stroke={gridColor}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => `BTC price ${usd(Number(v), 0)}`}
          formatter={(v) => [`Collateral ratio ${fmtPct(Number(v))}`, undefined as never]}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ratio"
          stroke="#0f766e"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface TimelineChartProps {
  btcCollateral: number;
  musdDebt: number;
  spotPriceUsd: number;
  stages: { label: string; priceUsd: number; cumulativeDropPct: number }[];
  liquidationThresholdPct: number;
}

/**
 * Scenario timeline: collateral ratio at each stage of the cumulative
 * crash path, with liquidation crossings marked in red.
 */
export function TimelineChart({
  btcCollateral,
  musdDebt,
  spotPriceUsd,
  stages,
  liquidationThresholdPct,
}: TimelineChartProps) {
  const data = [
    {
      label: "Today",
      priceUsd: spotPriceUsd,
      ratioPct: (stateAtPrice(btcCollateral, musdDebt, spotPriceUsd).collateralRatio) * 100,
      liquidated: false,
      x: 0,
    },
    ...stages.map((stage, i) => {
      const at = stateAtPrice(btcCollateral, musdDebt, stage.priceUsd);
      return {
        label: stage.label,
        priceUsd: stage.priceUsd,
        ratioPct: at.collateralRatio * 100,
        liquidated: at.collateralRatio < liquidationThresholdPct / 100,
        x: i + 1,
      };
    }),
  ];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <ReferenceLine
          y={liquidationThresholdPct}
          stroke="#b91c1c"
          strokeDasharray="5 4"
          label={{ value: `Threshold ${liquidationThresholdPct}%`, position: "insideTopLeft", fontSize: 10, fill: "#b91c1c" }}
        />
        <XAxis
          dataKey="label"
          tick={{ ...axisStyle, fontSize: 10 }}
          tickLine={false}
          stroke={gridColor}
          interval={0}
        />
        <YAxis
          tick={axisStyle}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
          tickLine={false}
          width={44}
          stroke={gridColor}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, n, item) => {
            const payload = item?.payload as { priceUsd?: number } | undefined;
            return [`${fmtRatio(Number(Number(v)) / 100)} · at ${usd(payload?.priceUsd ?? 0, 0)}`, String(n)];
          }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ratioPct"
          stroke="#16181d"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; payload?: { liquidated?: boolean; label?: string } }) => {
            const { cx = 0, cy = 0, payload } = props;
            return (
              <circle
                key={payload?.label}
                cx={cx}
                cy={cy}
                r={4}
                fill={payload?.liquidated ? "#b91c1c" : "#16181d"}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface ScenarioBarsProps {
  scenarios: ScenarioState[];
  liquidationThresholdPct: number;
}

/** Collateral ratio after each preset shock; bars cross threshold turn red. */
export function ScenarioBars({ scenarios, liquidationThresholdPct }: ScenarioBarsProps) {
  const data = scenarios.map((s) => ({
    label: `−${s.dropPct}%`,
    ratioPct: s.collateralRatio * 100,
    liquidated: s.liquidated,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <ReferenceLine
          y={liquidationThresholdPct}
          stroke="#b91c1c"
          strokeDasharray="5 4"
          label={{ value: "Threshold", position: "insideTopLeft", fontSize: 10, fill: "#b91c1c" }}
        />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} stroke={gridColor} />
        <YAxis
          tick={axisStyle}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
          tickLine={false}
          width={44}
          stroke={gridColor}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [`Collateral ratio ${fmtPct(Number(v))}`, undefined as never]}
          isAnimationActive={false}
        />
        <Bar dataKey="ratioPct" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.liquidated ? "#b91c1c" : d.ratioPct < liquidationThresholdPct * 1.25 ? "#b45309" : "#0f766e"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
