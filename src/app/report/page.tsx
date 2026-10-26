import type { Metadata } from "next";

import { ReportView } from "@/components/report-view";

export const metadata: Metadata = {
  title: "Report · DROPTEST",
  description:
    "A printable, hypothetical position risk report generated from the inputs entered in DROPTEST. Save as PDF from the browser print dialog.",
};

export default function ReportPage() {
  return <ReportView />;
}
