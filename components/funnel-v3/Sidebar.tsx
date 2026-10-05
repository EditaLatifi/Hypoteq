"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelNav, useFunnelState, useRequirements } from "./hooks";
import { PATH_STEPS, canOpenStep, caseLine, doneCount, pathSubtitle, roleLine, stepSummary } from "./logic";
import { usePartnerLookup } from "./partner";

/** Case header and topic lines, shared by the desktop sidebar. */
export function useHeaderLines() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const partner = usePartnerLookup((s) => s.result);
  return {
    caseLine: caseLine(state.txt, t),
    roleLine: roleLine(state.role, state.txt, partner, t),
  };
}

/** The dark left column: case, question path (D6), document count. Hidden below 900 px. */
export default function Sidebar() {
  const { t, opt } = useFunnelT();
  const state = useFunnelState();
  const step = useFunnelV3((s) => s.step);
  const visited = useFunnelV3((s) => s.visited);
  const reqs = useRequirements();
  const lines = useHeaderLines();
  const { goTo } = useFunnelNav();

  return (
    <aside className="v3-side" aria-label={t("side.path")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="v3-side-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
      <div className="v3-side-case">
        <span className="v3-side-eyebrow">{t("side.request")}</span>
        <span className="v3-side-caseline">{lines.caseLine}</span>
        <span className="v3-side-roleline">{lines.roleLine}</span>
      </div>
      <div className="v3-side-pathhead">
        <span className="v3-side-eyebrow">{t("side.path")}</span>
        <span className="v3-side-pathline">{t("side.pathLine", { done: doneCount(step) })}</span>
      </div>
      <nav aria-label={t("side.path")}>
        <ol className="v3-path">
          {PATH_STEPS.map((n) => {
            const active = step === n;
            const done = step > n;
            const open = canOpenStep(n, visited);
            const summary =
              done ? stepSummary(n, state, t, opt, reqs.total ? { fulfilled: reqs.fulfilled, total: reqs.total } : undefined) : "";
            return (
              <li key={n}>
                <button
                  type="button"
                  className={`v3-path-item${done ? " is-done" : ""}${active ? " is-active" : ""}${n === PATH_STEPS.length ? " is-last" : ""}`}
                  aria-current={active ? "step" : undefined}
                  aria-disabled={open ? undefined : true}
                  onClick={() => open && !active && goTo(n)}
                >
                  <span className="v3-path-track" aria-hidden="true">
                    <span className="v3-path-dot" />
                    <span className="v3-path-line" />
                  </span>
                  <span className="v3-path-text">
                    <span className="v3-path-label">{t(`step.${n}`)}</span>
                    <span className="v3-path-sub">{pathSubtitle(n, step, summary, t)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="v3-side-foot">
        <div className="v3-side-count">
          <span className="v3-side-count-n">{reqs.total}</span>
          <span className="v3-side-count-text">{t("side.docsCount")}</span>
        </div>
      </div>
    </aside>
  );
}
