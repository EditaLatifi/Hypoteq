"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelNav, useRequirements } from "./hooks";
import LanguageSwitch from "./LanguageSwitch";
import { PATH_STEPS, RAIL_STEPS, TOTAL_STEPS, canOpenStep, nextLabelKey } from "./logic";
import { useFunnelUI } from "./uiStore";

export const RAIL_ID = "v3-rail";

/** Phone header (< 900 px): logo, topic, arrows, segment bar, rail toggle. */
export function MobileHeader() {
  const { t } = useFunnelT();
  const step = useFunnelV3((s) => s.step);
  const visited = useFunnelV3((s) => s.visited);
  const { goNext, goPrev, goTo } = useFunnelNav();
  const reqs = useRequirements();
  const railOpen = useFunnelUI((s) => s.railOpen);
  const toggleRail = useFunnelUI((s) => s.toggleRail);

  return (
    <header className="v3-mhead">
      <div className="v3-mhead-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="v3-mhead-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
        <div className="v3-mhead-right">
          <span className="v3-mhead-title">
            {t(`step.${step}`)} · {step}/{TOTAL_STEPS}
          </span>
          <LanguageSwitch compact />
          <button type="button" className="v3-arrow--dark" aria-label={t("common.back")} onClick={goPrev}>
            ‹
          </button>
          {/* Not shown on the last step, as on desktop: the step's own actions finish it. */}
          {step < TOTAL_STEPS && (
            <button
              type="button"
              className="v3-arrow--dark"
              aria-label={t(nextLabelKey(step) ?? "common.next")}
              onClick={goNext}
            >
              ›
            </button>
          )}
        </div>
      </div>
      <nav className="v3-segs" aria-label={t("side.path")}>
        {PATH_STEPS.map((n) => {
          const open = canOpenStep(n, visited);
          return (
            <button
              key={n}
              type="button"
              className={`v3-seg${step >= n ? " is-reached" : ""}`}
              aria-label={t(`step.${n}`)}
              aria-current={step === n ? "step" : undefined}
              aria-disabled={open ? undefined : true}
              onClick={() => open && step !== n && goTo(n)}
            />
          );
        })}
      </nav>
      {RAIL_STEPS.includes(step) ? (
        <button
          type="button"
          className="v3-mhead-rail"
          aria-expanded={railOpen}
          aria-controls={RAIL_ID}
          onClick={toggleRail}
        >
          <span className="v3-railbar-left">
            <span className="v3-railbar-n">{reqs.total}</span>
            <span className="v3-railbar-label">{t("rail.title")}</span>
          </span>
          <span className="v3-railbar-state">{t(railOpen ? "rail.hide" : "rail.show")}</span>
        </button>
      ) : null}
    </header>
  );
}

/** Desktop bar above the content: progress, «Schritt N von 6», arrows ‹ ›, language. */
export function TopBar() {
  const { t } = useFunnelT();
  const step = useFunnelV3((s) => s.step);
  const { goNext, goPrev } = useFunnelNav();
  const nextKey = nextLabelKey(step);

  return (
    <div className="v3-topbar">
      <div
        className="v3-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
        aria-label={t("common.stepProgress", { n: step, total: TOTAL_STEPS })}
      >
        <div className="v3-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>
      <span className="v3-topbar-count">{t("common.stepProgress", { n: step, total: TOTAL_STEPS })}</span>
      <div className="v3-arrows">
        <button type="button" className="v3-arrow" title={`${t("common.back")} (←)`} aria-label={t("common.back")} onClick={goPrev}>
          ‹
        </button>
        <button
          type="button"
          className={`v3-arrow${nextKey ? "" : " is-hidden"}`}
          title={nextKey ? `${t(nextKey)} (→)` : undefined}
          aria-label={nextKey ? t(nextKey) : undefined}
          aria-hidden={nextKey ? undefined : true}
          tabIndex={nextKey ? undefined : -1}
          onClick={goNext}
        >
          ›
        </button>
      </div>
      <LanguageSwitch />
    </div>
  );
}

/** 900–1240 px: the rail no longer fits beside the content; a sticky bar opens it. */
export function RailBar() {
  const { t } = useFunnelT();
  const reqs = useRequirements();
  const railOpen = useFunnelUI((s) => s.railOpen);
  const toggleRail = useFunnelUI((s) => s.toggleRail);
  return (
    <div className="v3-railbar">
      <button type="button" className="v3-railbar-btn" aria-expanded={railOpen} aria-controls={RAIL_ID} onClick={toggleRail}>
        <span className="v3-railbar-left">
          <span className="v3-railbar-n">{reqs.total}</span>
          <span className="v3-railbar-label">{t("rail.title")}</span>
        </span>
        <span className="v3-railbar-state">{t(railOpen ? "rail.hide" : "rail.show")}</span>
      </button>
    </div>
  );
}

/** Zurück / Weiter. Step 6 has its own actions, so only «Zurück» stays there. */
export function Footer() {
  const { t } = useFunnelT();
  const step = useFunnelV3((s) => s.step);
  const { goNext, goPrev } = useFunnelNav();
  const nextKey = nextLabelKey(step);
  return (
    <footer className="v3-footer">
      <button type="button" className="v3-btn v3-btn--outline v3-btn--back" onClick={goPrev}>
        {t("common.back")}
      </button>
      {nextKey ? (
        <button type="button" className="v3-btn v3-btn--primary v3-btn--lg" onClick={goNext}>
          {t(nextKey)}
        </button>
      ) : null}
    </footer>
  );
}
