"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { SCREENS, screenLabelKey, timeLeft } from "@/lib/funnel-v3/steps";
import { RAIL_ID, useRailHead } from "./DocsRail";
import { useFunnelNav, useScreen } from "./hooks";
import LanguageSwitch from "./LanguageSwitch";
import { canOpenStep, nextLabelKey } from "./logic";
import { useFunnelUI } from "./uiStore";

/**
 * «Lieber Schritt für Schritt» / «Unterlagen schon bereit? Zur Schnellanmeldung» (Handover 1):
 * the other entry at any time, on the same topic, every answer kept (store switchMode,
 * steps.ts switchTarget). In the sidebar; on a phone at the end of the screen (DECISIONS V50).
 */
export function ModeSwitch({ className }: { className: string }) {
  const { t } = useFunnelT();
  const mode = useFunnelV3((s) => s.mode);
  const switchMode = useFunnelV3((s) => s.switchMode);
  return (
    <button type="button" className={className} onClick={switchMode}>
      {t(mode === "schnell" ? "side.toGuided" : "side.toFast")} →
    </button>
  );
}

/** «Schritt 2 von 4 · noch ca. 2:30 Min.» (Handover 0). */
function useProgress() {
  const { t } = useFunnelT();
  const { step, total, mode } = useScreen();
  const time = timeLeft(mode, step);
  return {
    step,
    total,
    mode,
    count: t("common.stepProgress", { n: step, total }),
    time: t("common.timeLeft", { time }),
    /** «2:30 Min.» — the phone header has room for no more. */
    short: t("common.minutes", { time }),
  };
}

/** Phone header (< 900 px): logo, progress, arrows, segment bar, rail toggle. */
export function MobileHeader({ showRail }: { showRail: boolean }) {
  const { t } = useFunnelT();
  const p = useProgress();
  const visited = useFunnelV3((s) => s.visited);
  const { goNext, goPrev, goTo } = useFunnelNav();
  const railOpen = useFunnelUI((s) => s.railOpen);
  const toggleRail = useFunnelUI((s) => s.toggleRail);
  const rail = useRailHead();
  const nextKey = nextLabelKey(p.mode, p.step);

  return (
    <header className="v3-mhead">
      <div className="v3-mhead-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="v3-mhead-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
        <div className="v3-mhead-right">
          <span className="v3-mhead-title" aria-label={`${p.count} · ${p.time}`}>
            {p.step}/{p.total} · {p.short}
          </span>
          <LanguageSwitch compact />
          <button type="button" className="v3-arrow--dark" aria-label={t("common.back")} onClick={goPrev}>
            ‹
          </button>
          {/* Not on the last step, as on desktop: its own action finishes it. */}
          {nextKey ? (
            <button type="button" className="v3-arrow--dark" aria-label={t(nextKey)} onClick={goNext}>
              ›
            </button>
          ) : null}
        </div>
      </div>
      <nav className="v3-segs" aria-label={t("side.path")}>
        {SCREENS[p.mode].map((screen, i) => {
          const n = i + 1;
          const open = canOpenStep(n, visited, p.total);
          return (
            <button
              key={screen}
              type="button"
              className={`v3-seg${p.step >= n ? " is-reached" : ""}`}
              aria-label={t(screenLabelKey(p.mode, screen))}
              aria-current={p.step === n ? "step" : undefined}
              aria-disabled={open ? undefined : true}
              onClick={() => open && p.step !== n && goTo(n)}
            />
          );
        })}
      </nav>
      {showRail ? (
        <button type="button" className="v3-mhead-rail" aria-expanded={railOpen} aria-controls={RAIL_ID} onClick={toggleRail}>
          <span className="v3-railbar-left">
            <span className="v3-railbar-n">{rail.count}</span>
            <span className="v3-railbar-label">{t(rail.titleKey)}</span>
          </span>
          <span className="v3-railbar-state">{t(railOpen ? "rail.hide" : "rail.show")}</span>
        </button>
      ) : null}
    </header>
  );
}

/** Desktop bar above the content: progress, «Schritt n von N · noch ca. m:ss Min.», arrows ‹ ›, language. */
export function TopBar() {
  const { t } = useFunnelT();
  const p = useProgress();
  const { goNext, goPrev } = useFunnelNav();
  const nextKey = nextLabelKey(p.mode, p.step);

  return (
    <div className="v3-topbar">
      <div className="v3-progress" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.step} aria-label={p.count}>
        <div className="v3-progress-fill" style={{ width: `${(p.step / p.total) * 100}%` }} />
      </div>
      <span className="v3-topbar-count">
        {p.count} · <strong>{p.time}</strong>
      </span>
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
  const rail = useRailHead();
  const railOpen = useFunnelUI((s) => s.railOpen);
  const toggleRail = useFunnelUI((s) => s.toggleRail);
  return (
    <div className="v3-railbar">
      <button type="button" className="v3-railbar-btn" aria-expanded={railOpen} aria-controls={RAIL_ID} onClick={toggleRail}>
        <span className="v3-railbar-left">
          <span className="v3-railbar-n">{rail.count}</span>
          <span className="v3-railbar-label">{t(rail.titleKey)}</span>
        </span>
        <span className="v3-railbar-state">{t(railOpen ? "rail.hide" : "rail.show")}</span>
      </button>
    </div>
  );
}

/** Zurück / Weiter. The last step has its own action, so only «Zurück» stays there. */
export function Footer() {
  const { t } = useFunnelT();
  const { step, mode } = useScreen();
  const { goNext, goPrev } = useFunnelNav();
  const nextKey = nextLabelKey(mode, step);
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
