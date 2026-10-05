"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import type { Role } from "@/lib/funnel-v3/types";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import LanguageSwitch from "./LanguageSwitch";

const ENTRIES: { role: Role; prefix: "start.advisor" | "start.client"; accent: boolean }[] = [
  { role: "berater", prefix: "start.advisor", accent: true },
  { role: "kunde", prefix: "start.client", accent: false },
];

/** Step 0: «HYPOTEQ Berater» or «Kunde selbst» (spec 2.1). */
export default function StartScreen() {
  const { t } = useFunnelT();

  const pick = (role: Role) => {
    const s = useFunnelV3.getState();
    s.setRole(role);
    if (s.step === 0) s.next();
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
          <p className="v3-start-lead">{t("start.lead")}</p>
        </div>
        <div className="v3-start-cards">
          {ENTRIES.map((e) => (
            <button
              key={e.role}
              type="button"
              className={`v3-start-card${e.accent ? " v3-start-card--accent" : ""}`}
              onClick={() => pick(e.role)}
            >
              <span className="v3-start-card-eyebrow">{t(`${e.prefix}.eyebrow`)}</span>
              <span className="v3-start-card-title">{t(`${e.prefix}.title`)}</span>
              <span className="v3-start-card-sub">{t(`${e.prefix}.sub`)}</span>
              <span className="v3-start-card-cta" aria-hidden="true">
                {t("start.cta")}
              </span>
            </button>
          ))}
        </div>
        <span className="v3-start-claim">{t("start.claim")}</span>
      </div>
    </div>
  );
}
