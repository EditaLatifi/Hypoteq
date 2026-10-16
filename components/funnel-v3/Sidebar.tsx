"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { SCREENS, screenLabelKey, screenWhyKey, timeLeft } from "@/lib/funnel-v3/steps";
import { ModeSwitch } from "./Chrome";
import { useFunnelNav, useFunnelState, useRequirements, useScreen } from "./hooks";
import { canOpenStep, caseLine, pathLine, pathSubtitle, roleLine, screenSummary } from "./logic";
import { usePartnerLookup } from "./partner";

/**
 * The dark left column (prototype aside): the case, «Fragepfad» with the entry and the time
 * left («Begleitete Anmeldung · noch ca. 2:30 Min.»), the path of the mode's screens with
 * their «warum» lines (D6: a visited screen can be reopened), the mode switch (Handover 1),
 * the document count. Hidden below 900 px.
 */
export default function Sidebar() {
  const { t, opt } = useFunnelT();
  const state = useFunnelState();
  const { step, mode, total } = useScreen();
  const visited = useFunnelV3((s) => s.visited);
  const partner = usePartnerLookup((s) => s.result);
  const reqs = useRequirements();
  const { goTo } = useFunnelNav();
  const screens = SCREENS[mode];

  return (
    <aside className="v3-side" aria-label={t("side.path")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="v3-side-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
      <div className="v3-side-case">
        <span className="v3-side-eyebrow">{t("side.request")}</span>
        <span className="v3-side-caseline">{caseLine(state.txt, t, state.ans.kn)}</span>
        <span className="v3-side-roleline">{roleLine(state.role, state.txt, partner, t)}</span>
      </div>
      <div className="v3-side-pathhead">
        <span className="v3-side-eyebrow">{t("side.path")}</span>
        <span className="v3-side-pathline">{pathLine(mode, timeLeft(mode, step), t)}</span>
      </div>
      <nav aria-label={t("side.path")}>
        <ol className="v3-path">
          {screens.map((screen, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            const open = canOpenStep(n, visited, total);
            const summary = done ? screenSummary(screen, state, t, opt, reqs.total ? { fulfilled: reqs.fulfilled, total: reqs.total } : undefined) : "";
            return (
              <li key={screen}>
                <button
                  type="button"
                  className={`v3-path-item${done ? " is-done" : ""}${active ? " is-active" : ""}${n === screens.length ? " is-last" : ""}`}
                  aria-current={active ? "step" : undefined}
                  aria-disabled={open ? undefined : true}
                  onClick={() => open && !active && goTo(n)}
                >
                  <span className="v3-path-track" aria-hidden="true">
                    <span className="v3-path-dot" />
                    <span className="v3-path-line" />
                  </span>
                  <span className="v3-path-text">
                    <span className="v3-path-label">{t(screenLabelKey(mode, screen))}</span>
                    <span className="v3-path-sub">{pathSubtitle(n, step, summary, t(screenWhyKey(mode, screen)), t)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <ModeSwitch className="v3-side-switch" />
      <div className="v3-side-foot">
        <div className="v3-side-count">
          <span className="v3-side-count-n">{reqs.total}</span>
          <span className="v3-side-count-text">{t("side.docsCount")}</span>
        </div>
        <span className="v3-side-saved">{t("common.saved")}</span>
      </div>
    </aside>
  );
}
