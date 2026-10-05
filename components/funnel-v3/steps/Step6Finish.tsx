// STUB: replaced by the finish engineer
"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import StepHead from "../StepHead";

export default function Step6Finish() {
  const { t } = useFunnelT();
  return <StepHead step={6} title={t("s6.title")} large />;
}
