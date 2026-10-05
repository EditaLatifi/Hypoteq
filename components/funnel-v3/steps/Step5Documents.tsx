// STUB: replaced by the documents engineer
"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import StepHead from "../StepHead";

export default function Step5Documents() {
  const { t } = useFunnelT();
  return <StepHead step={5} title={t("s5.title")} lead={t("s5.lead")} large />;
}
