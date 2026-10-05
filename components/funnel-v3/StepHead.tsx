"use client";

import { useEffect, useRef } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { TOTAL_STEPS } from "./logic";

/**
 * The head of every step: accent rule, «Thema N von 6 · Titel», h1 and lead. Exported for the
 * documents and finish steps too, so all six look the same.
 *
 * Focus moves to the heading when the step opens, so a screen reader announces the new topic.
 */
export default function StepHead({
  step,
  title,
  lead,
  large,
}: {
  step: number;
  title: string;
  lead?: string;
  /** The larger lead (21 px) the prototype uses on steps 1, 5 and 6. */
  large?: boolean;
}) {
  const { t } = useFunnelT();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Not on the first paint of a reload, only when the topic changes inside the funnel.
    if (document.activeElement && document.activeElement !== document.body) ref.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <div className={`v3-head${large ? " v3-head--loose" : ""}`}>
      <span className="v3-rule" aria-hidden="true" />
      <span className="v3-head-eyebrow">
        <strong>{t("common.stepOf", { n: step, total: TOTAL_STEPS })}</strong> · {t(`step.${step}`)}
      </span>
      <h1 ref={ref} tabIndex={-1} className="v3-h1">
        {title}
      </h1>
      {lead ? <p className={`v3-lead${large ? " v3-lead--lg" : ""}`}>{lead}</p> : null}
    </div>
  );
}
