"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FieldPath } from "@/lib/funnel-v3/types";
import { sourceDocLabel } from "../logic";

/**
 * The mark of a prefilled answer (Handover 3): «aus Dokument», or «aus Dokument · bitte
 * prüfen» below the confidence threshold (DECISIONS V7) with «Bestätigen», which keeps the
 * value and drops the doubt (store confirmSource). Editing the field removes the mark (store
 * touch). Renders nothing for a field no document filled.
 */
export default function FromDoc({ path, label }: { path: FieldPath; label?: string }) {
  const { t, lang } = useFunnelT();
  const mark = useFunnelV3((s) => s.src[path]);
  const confirm = useFunnelV3((s) => s.confirmSource);
  if (!mark) return null;
  const doc = sourceDocLabel(mark, lang, t);
  return (
    <span className="v3-fromdoc-wrap">
      {label ? <span className="v3-fromdoc-label">{label}</span> : null}
      <span className={`v3-fromdoc${mark.unsure ? " is-unsure" : ""}`} title={t(mark.unsure ? "fast.fromUnsure" : "fast.from", { doc })}>
        {t(mark.unsure ? "fast.fromDocUnsure" : "chip.fromDoc")}
      </span>
      {mark.unsure ? (
        <button
          type="button"
          className="v3-fromdoc-confirm"
          aria-label={`${t("fast.confirm")}: ${label ?? t("fast.from", { doc })}`}
          onClick={() => confirm(path)}
        >
          {t("fast.confirm")}
        </button>
      ) : null}
    </span>
  );
}
