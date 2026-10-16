"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelState, useRequirements, useScreen } from "./hooks";
import { fillRailItems, railGroups } from "./logic";
import { useFunnelUI } from "./uiStore";

/** The rail's id, for the collapsed toggles' aria-controls. */
export const RAIL_ID = "v3-rail";

/**
 * The right column. On Anfrage · Objekt · Personen: «Deine Unterlagen», the requirement list as
 * it grows with the answers, grouped, each with its reason («weil: Baurecht = Ja»). On the
 * Schnellanmeldung's upload: «Deine Anfrage füllt sich» (Handover 3 Schritt 2). Beside the
 * content from 1240 px; above it, behind a toggle, on narrower screens.
 */
export default function DocsRail() {
  const { screen } = useScreen();
  return screen === "upload" ? <FillRail /> : <RequirementsRail />;
}

/** Count and title of the rail for the collapsed toggles (RailBar, mobile header). */
export function useRailHead(): { count: number; titleKey: string } {
  const { t, opt, lang } = useFunnelT();
  const { screen } = useScreen();
  const reqs = useRequirements();
  const state = useFunnelState();
  if (screen === "upload") {
    const { items, facts } = fillRailItems(state, t, opt, lang);
    return { count: items.length + facts.length, titleKey: "fast.rail.short" };
  }
  return { count: reqs.total, titleKey: "rail.title" };
}

function RequirementsRail() {
  const { t, opt } = useFunnelT();
  const state = useFunnelState();
  const reqs = useRequirements();
  const open = useFunnelUI((s) => s.railOpen);
  const groups = railGroups(reqs.list, state, reqs.okIds, t, opt);

  return (
    <aside id={RAIL_ID} className={`v3-rail${open ? " is-open" : ""}`} aria-label={t("rail.title")}>
      <div className="v3-rail-card">
        <div className="v3-rail-head">
          <span className="v3-rail-eyebrow">{t("rail.title")}</span>
          <span className="v3-rail-n" aria-live="polite">
            {reqs.total}
          </span>
          <span className="v3-rail-text">{t("rail.text")}</span>
        </div>
        <div className="v3-rail-divider" />
        <div className="v3-rail-groups">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="v3-rail-group-head">
                <span className="v3-rail-group-name">{g.name}</span>
                <span className="v3-rail-group-count">{g.count}</span>
              </div>
              <ul className="v3-rail-group">
                {g.items.map((r) => (
                  <li key={r.id} className={`v3-rail-item${r.ok ? " is-ok" : ""}`}>
                    <span className="v3-rail-dot" aria-hidden="true" />
                    <span className="v3-rail-item-text">
                      <span className="v3-rail-label">{r.label}</span>
                      <span className="v3-rail-why">{r.why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * «Deine Anfrage füllt sich»: each value the documents filled in, with its source («aus
 * Lohnausweis 2025», doubtful ones «· bitte bestätigen» with «Bestätigen»), then the facts read
 * for the mail and Salesforce (Geburtsdatum, Zivilstand, Bank …).
 */
function FillRail() {
  const { t, opt, lang } = useFunnelT();
  const state = useFunnelState();
  const confirm = useFunnelV3((s) => s.confirmSource);
  const open = useFunnelUI((s) => s.railOpen);
  const { items, facts } = fillRailItems(state, t, opt, lang);
  const n = items.length + facts.length;

  return (
    <aside id={RAIL_ID} className={`v3-rail${open ? " is-open" : ""}`} aria-label={t("fast.rail.title")}>
      <div className="v3-rail-card">
        <div className="v3-rail-head">
          <span className="v3-rail-eyebrow">{t("fast.rail.title")}</span>
          <span className="v3-rail-n" aria-live="polite">
            {n}
          </span>
          <span className="v3-rail-text">{t("fast.rail.text")}</span>
        </div>
        <div className="v3-rail-divider" />
        {n === 0 ? <span className="v3-rail-text">{t("fast.rail.empty")}</span> : null}
        <ul className="v3-rail-group">
          {items.map((r) => (
            <li key={r.path} className={`v3-rail-item is-ok${r.unsure ? " is-unsure" : ""}`}>
              <span className="v3-rail-dot" aria-hidden="true" />
              <span className="v3-rail-item-text">
                <span className="v3-rail-label">
                  {r.label}: {r.value}
                </span>
                <span className="v3-rail-why">{r.why}</span>
              </span>
              {r.unsure ? (
                <button type="button" className="v3-rail-confirm" aria-label={`${t("fast.confirm")}: ${r.label}`} onClick={() => confirm(r.path)}>
                  {t("fast.confirm")}
                </button>
              ) : null}
            </li>
          ))}
          {facts.map((f) => (
            <li key={f.key} className="v3-rail-item is-fact">
              <span className="v3-rail-dot" aria-hidden="true" />
              <span className="v3-rail-item-text">
                <span className="v3-rail-label">
                  {f.label}: {f.value}
                </span>
                <span className="v3-rail-why">{t("fast.forMail")}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
