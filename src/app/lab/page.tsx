import type { Metadata } from "next";

import { RiskLab } from "@/components/risk-lab";

export const metadata: Metadata = {
  title: "Risk lab — DROPTEST",
  description:
    "Stress-test hypothetical BTC-backed MUSD borrowing positions on Mezo with verified protocol parameters and live-adjustable shock scenarios.",
};

export default function LabPage() {
  return <RiskLab />;
}
