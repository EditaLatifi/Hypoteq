"use client";

import { useState } from "react";
import { ampelOf, type Ampel as Level } from "@/lib/funnel-v3/abgleich/rules";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";

/**
 * The confidence of a read value as a traffic light (HYPOTEQ 23.10.2026, Spezifikation
 * Datenabgleich 4.2): green ≥ 0.90, yellow 0.60–0.89, red below; only the applying light is lit.
 * Hover, focus or a tap shows why (10.3): a probability model — good, but always relying on a
 * person. A value a person corrected or confirmed is green. The internal view adds the percentage.
 */
export default function Ampel({ confidence, edited = false, intern = false }: { confidence: number | null | undefined; edited?: boolean; intern?: boolean }) {
  const { t } = useFunnelT();
  const [open, setOpen] = useState(false);
  const level: Level = edited ? "green" : ampelOf(confidence);
  const pct = intern && !edited && typeof confidence === "number" ? ` · ${Math.round(confidence * 100)} %` : "";
  const label = t(`abg.ampel.${level}`) + pct;
  return (
    <button
      type="button"
      className={`v3-ampel is-${level}${open ? " is-open" : ""}`}
      aria-label={`${label}. ${t("abg.ampel")}`}
      aria-expanded={open}
      onClick={(e) => {
        // Inside a field's <label>: the tap opens the explanation, not the input.
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      onBlur={() => setOpen(false)}
    >
      <span className="v3-ampel-lights" aria-hidden="true">
        {(["red", "yellow", "green"] as const).map((l) => (
          <span key={l} className={`v3-ampel-dot is-${l}${l === level ? " is-on" : ""}`} />
        ))}
      </span>
      <span className="v3-ampel-label">{label}</span>
      <span className="v3-ampel-tip" role="tooltip">
        {t("abg.ampel")}
      </span>
    </button>
  );
}
