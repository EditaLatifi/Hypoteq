"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { RAIL_ID } from "./Chrome";
import { useFunnelState, useRequirements } from "./hooks";
import { railGroups } from "./logic";
import { useFunnelUI } from "./uiStore";

/**
 * «Deine Unterlagen» (steps 1–4): the requirement list as it grows with the answers, grouped,
 * each with its reason («weil: Baurecht = Ja»). Beside the content from 1240 px; above it,
 * behind a toggle, on narrower screens.
 */
export default function DocsRail() {
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
