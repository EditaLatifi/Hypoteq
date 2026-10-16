"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { recommendedMode } from "@/lib/funnel-v3/steps";
import type { Mode, Role } from "@/lib/funnel-v3/types";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import LanguageSwitch from "./LanguageSwitch";
import { startRole } from "./logic";

const ROLES: { role: Role; labelKey: string }[] = [
  { role: "berater", labelKey: "start.advisor.title" },
  { role: "kunde", labelKey: "start.client.title" },
];

/** Handover 1, in the order of the prototype: Schnellanmeldung, Begleitete Anmeldung. */
const ENTRIES: { mode: Mode; eyebrow: string; title: string; sub: string; time: string }[] = [
  { mode: "schnell", eyebrow: "start.mode.fast.eyebrow", title: "start.mode.fast.title", sub: "start.mode.fast.text", time: "start.mode.fast.duration" },
  { mode: "begleitet", eyebrow: "start.mode.guided.eyebrow", title: "start.mode.guided.title", sub: "start.mode.guided.sub", time: "start.mode.guided.time" },
];

/**
 * Step 0 (Handover 1): the switch «HYPOTEQ Berater | Kunde selbst», then the two entries —
 * Schnellanmeldung (documents first) and Begleitete Anmeldung (step by step), each with
 * eyebrow, text and time. «Empfohlen» (lime) on the entry the role suggests: Berater →
 * Schnell, Kunde → Begleitet (steps.ts recommendedMode). A role preset by the link
 * (`?customer=`, the Partnerportal) is already chosen (DECISIONS V41).
 */
export default function StartScreen() {
  const { t } = useFunnelT();
  const role = useFunnelV3((s) => s.role);
  const shown = startRole(role);
  const recommended = recommendedMode(shown);

  const pickRole = (r: Role) => {
    if (r !== role) useFunnelV3.getState().setRole(r);
  };
  const start = (mode: Mode) => {
    const s = useFunnelV3.getState();
    if (s.role !== shown) s.setRole(shown);
    s.setMode(mode);
    if (s.step === 0) useFunnelV3.getState().next();
  };

  return (
    <div className="v3-start">
      <div className="v3-start-wedge" aria-hidden="true" />
      <div className="v3-start-pad">
        <div className="v3-start-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="v3-start-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
          <LanguageSwitch dark />
        </div>
        <div className="v3-start-hero">
          <span className="v3-start-rule" aria-hidden="true" />
          <h1 className="v3-start-title">{t("start.title")}</h1>
          <p className="v3-start-lead">{t("start.leadModes")}</p>
        </div>
        <div className="v3-start-choose">
          <div className="v3-roleswitch" role="group" aria-label={t("start.roleLabel")}>
            {ROLES.map((r) => (
              <button key={r.role} type="button" className="v3-roleswitch-btn" aria-pressed={shown === r.role} onClick={() => pickRole(r.role)}>
                {t(r.labelKey)}
              </button>
            ))}
          </div>
          <div className="v3-start-cards">
            {ENTRIES.map((e) => {
              const rec = e.mode === recommended;
              return (
                <button key={e.mode} type="button" className={`v3-start-card${rec ? " v3-start-card--accent" : ""}`} onClick={() => start(e.mode)}>
                  <span className="v3-start-card-top">
                    <span className="v3-start-card-eyebrow">{t(e.eyebrow)}</span>
                    {rec ? <span className="v3-start-card-rec">{t("start.recommended")}</span> : null}
                  </span>
                  <span className="v3-start-card-title">{t(e.title)}</span>
                  <span className="v3-start-card-sub">{t(e.sub)}</span>
                  <span className="v3-start-card-foot">
                    <span className="v3-start-card-time">{t(e.time)}</span>
                    <span className="v3-start-card-cta" aria-hidden="true">
                      {t("start.cta")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <span className="v3-start-claim">{t("start.claim")}</span>
      </div>
    </div>
  );
}
