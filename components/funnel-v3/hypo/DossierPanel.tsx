"use client";

import { useMemo, useState } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { fieldLabel, valueText } from "@/lib/funnel-v3/hypo/engine";
import { HYPO_FIELDS, isStoreKey, type HypoKey, type HypoValue } from "@/lib/funnel-v3/hypo/fields";
import { isFilled, progress } from "@/lib/funnel-v3/hypo/flow";
import type { FieldPath } from "@/lib/funnel-v3/types";
import { useFunnelState, useRequirements } from "../hooks";
import { Dot } from "./HypoCards";
import { useHypo } from "./hypoStore";

/** Partner fields stay out of the customer's dossier list. */
const HIDDEN: ReadonlySet<string> = new Set(["txt.bmail", "txt.pvor", "txt.pnach", "txt.pfirma", "txt.ptel", "chat.emTotal", "chat.kn2"]);

function storeValue(s: ReturnType<typeof useFunnelState>, key: FieldPath): HypoValue | null {
  const [g, k, sub] = key.split(".");
  const v =
    g === "borrower"
      ? (s.borrowers[Number(k)] as unknown as Record<string, unknown> | undefined)?.[sub]
      : ((s as unknown as Record<string, Record<string, unknown>>)[g] ?? {})[k];
  return typeof v === "string" || typeof v === "number" ? v : null;
}

/**
 * Kap. 5.5 «Dossier-Panel»: progress, the fields recorded so far with their Ampel (from the chat:
 * confirmed = green; from a document: its own mark), and the document checklist. Fills live; on a
 * phone it is a collapsible bar above the chat.
 */
export default function DossierPanel() {
  const { t, lang } = useFunnelT();
  const state = useFunnelState();
  const session = useHypo((s) => s.session);
  const req = useRequirements();
  const [open, setOpen] = useState(false);
  const pct = Math.round(progress(state, session) * 100);

  const rows = useMemo(() => {
    const out: { key: HypoKey; value: HypoValue; confidence: number; from: string }[] = [];
    for (const f of HYPO_FIELDS) {
      if (HIDDEN.has(f.key) || !isFilled(f.key, state, session)) continue;
      let value: HypoValue | null = null;
      if (isStoreKey(f.key)) value = storeValue(state, f.key);
      else if (f.key === "chat.bank") value = session.bank;
      else if (f.key === "chat.ablauf") value = session.ablauf;
      else if (f.key === "chat.adresse") value = session.adresse;
      // A «Nein» says little in a short list; the form shows them all.
      if (value === null || value === "" || value === "Nein" || value === 0) continue;
      const mark = isStoreKey(f.key) ? state.src[f.key] : undefined;
      out.push({
        key: f.key,
        value,
        confidence: mark ? (mark.unsure ? 0.7 : 1) : 1,
        from: mark ? t("hypo.dossier.fromDoc", { doc: mark.doc }) : t("hypo.dossier.fromChat"),
      });
    }
    return out;
  }, [state, session, t]);

  const title = t(session.role === "kunde" ? "hypo.dossier.title" : "hypo.dossier.title.p");

  return (
    <aside className={`v3-hypo-dossier${open ? " is-open" : ""}`} aria-label={title}>
      <button type="button" className="v3-hypo-dossier-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{t("hypo.dossier.toggle")}</span>
        <span className="v3-hypo-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span>{t("hypo.dossier.progress", { pct })}</span>
      </button>
      <div className="v3-hypo-dossier-body">
        <span className="v3-eyebrow">{title}</span>
        <div className="v3-hypo-progress">
          <span className="v3-hypo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="v3-hypo-muted">{t("hypo.dossier.progress", { pct })}</span>
        </div>

        <span className="v3-hypo-dossier-head">{t("hypo.dossier.fields")}</span>
        {rows.length ? (
          <ul className="v3-hypo-list">
            {rows.map((r) => (
              <li key={r.key} className="v3-hypo-row" title={r.from}>
                <Dot confidence={r.confidence} />
                <span className="v3-hypo-row-label">{fieldLabel(r.key, lang)}</span>
                <span className="v3-hypo-row-value">{valueText(r.key, r.value, lang)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="v3-hypo-muted">{t("hypo.dossier.empty")}</span>
        )}

        <span className="v3-hypo-dossier-head">
          {t("hypo.dossier.docs")} <span className="v3-hypo-muted">· {t("hypo.dossier.docsCount", { ok: req.okIds.size, total: req.total })}</span>
        </span>
        <ul className="v3-hypo-docs">
          {req.list.map((r) => (
            <li key={r.instanceId} className={req.okIds.has(r.instanceId) ? "is-ok" : undefined}>
              <span className="v3-hypo-check" aria-hidden="true">
                {req.okIds.has(r.instanceId) ? "✓" : ""}
              </span>
              <span>
                {t(r.labelKey)}
                {r.person?.display ? <span className="v3-hypo-muted"> · {r.person.display}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
