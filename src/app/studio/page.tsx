import type { Metadata } from "next";

import { ScenarioStudio } from "@/components/scenario-studio";

export const metadata: Metadata = {
  title: "Scenario Studio · DROPTEST",
  description:
    "Compare up to three named hypothetical BTC price paths side by side and see when each would breach the liquidation threshold of a BTC-backed MUSD position.",
};

export default function StudioPage() {
  return <ScenarioStudio />;
}
