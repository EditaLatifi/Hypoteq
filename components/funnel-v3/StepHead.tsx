"use client";

import { useEffect, useRef } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { screenLabelKey } from "@/lib/funnel-v3/steps";
import { useScreen } from "./hooks";
import { screenHead } from "./logic";

/**
 * The head of every screen (prototype head): accent rule, «Schritt n von N · Titel», h1 and
 * lead — title and lead by entry and screen (logic.ts screenHead).
 *
 * Focus moves to the heading when the screen opens, so a screen reader announces the new topic.
 */
export default function StepHead() {
  const { t } = useFunnelT();
  const { step, screen, total, mode } = useScreen();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Not on the first paint of a reload, only when the topic changes inside the funnel.
    if (document.activeElement && document.activeElement !== document.body) ref.current?.focus({ preventScroll: true });
  }, [step, mode]);

  if (!screen) return null;
  const head = screenHead(mode, screen);
  return (
    <div className="v3-head">
      <span className="v3-rule" aria-hidden="true" />
      <span className="v3-head-eyebrow">
        <strong>{t("common.stepProgress", { n: step, total })}</strong> · {t(screenLabelKey(mode, screen))}
      </span>
      <h1 ref={ref} tabIndex={-1} className="v3-h1">
        {t(head.titleKey)}
      </h1>
      <p className="v3-lead v3-lead--lg">{t(head.leadKey)}</p>
    </div>
  );
}
