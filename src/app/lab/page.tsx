import type { Metadata } from "next";

import { RiskLab } from "@/components/risk-lab";

export const metadata: Metadata = {
  title: "Stress Lab · DROPTEST",
  description:
    "Stress-test hypothetical BTC-backed MUSD borrowing positions on Mezo with documented protocol parameters. Find the liquidation price, headroom, and reverse stress breakeven for any crash.",
};

export default function LabPage() {
  return <RiskLab />;
}
