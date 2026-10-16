// STUB: replaced by the signature branch
"use client";

/**
 * Placeholder for the HYPOTEQ Auskunftsermächtigung block (Handover 6). The real block —
 * Vorlage herunterladen → unterzeichnen → hochladen, «Später nachreichen» — comes from the
 * signature branch; this stub only keeps the closing compiling. Contract: default export, no
 * props, it reads the store.
 */

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";

export default function SignatureBlock() {
  const { t } = useFunnelT();
  return (
    <section className="v3-panel v3-sigstub" aria-label={t("sig.title")}>
      <span className="v3-eyebrow">{t("sig.title")}</span>
    </section>
  );
}
