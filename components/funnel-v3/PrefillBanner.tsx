"use client";

import { FileCheck } from "lucide-react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { prefilledCount } from "@/lib/funnel-v3/prefill";

/**
 * Handover 3: «Ab Schritt 3 steht oben: N Angaben aus deinen Unterlagen vorausgefüllt –
 * markiert mit «aus Dokument»». Only in the Schnellanmeldung, only once something was filled.
 */
export default function PrefillBanner() {
  const { t } = useFunnelT();
  const n = useFunnelV3((s) => (s.mode === "schnell" ? prefilledCount(s.src) : 0));
  if (!n) return null;
  return (
    <div className="v3-prefill" role="status">
      <FileCheck size={20} aria-hidden="true" />
      <span>{t("fast.prefill", { n })}</span>
    </div>
  );
}
