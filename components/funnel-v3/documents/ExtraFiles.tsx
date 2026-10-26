"use client";

import { useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { hasKey } from "@/lib/funnel-v3/i18n";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Placement } from "@/lib/funnel-v3/placeFile";
import { getRequirement, type RequirementInstance } from "@/lib/funnel-v3/requirements";
import { assignFile, removeFile, retryFile } from "@/lib/funnel-v3/upload";
import { requestedYears, v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import { extraReasonKey, groupExtras, rowClass, STATE_LOOK, storedNameForExtra, type RowState } from "./view";
import StoredName from "./StoredName";
import AuditTrail from "./AuditTrail";

interface Props {
  files: FileEntry[];
  placements: Map<string, Placement>;
  instances: RequirementInstance[];
  /** File ids with an open answer-correction suggestion. */
  suggested: Set<string>;
  intern: boolean;
  canRename: boolean;
  onView: (fileId: string) => void;
  onAssigned: (label: string) => void;
  /**
   * The funnel: every file shown, ordered by kind (Wird gelesen · nicht erkannt · überzählig ·
   * Duplikat · nicht benötigt), each with its tag and reason. No sub-heading per kind: «Nicht
   * benötigt» is no category of its own (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.3).
   * The Nachreich page keeps the plain list.
   */
  grouped?: boolean;
  /** Every file, so a duplicate can name the original it repeats (on the list or not). */
  allFiles?: FileEntry[];
}

function stateOf(f: FileEntry, p: Placement | undefined): RowState {
  if (f.uploadState === "uploading") return "uploading";
  if (f.uploadState === "failed") return "failed";
  if (!p || p.reason === "pending") return "analysing";
  return (p.extraKind ?? "unknown") as RowState;
}

/** Hidden by default (spec 4.3): not-needed files the customer did not choose to keep. */
export function isHiddenExtra(f: FileEntry, p: Placement | undefined): boolean {
  return f.uploadState === "uploaded" && p?.extraKind === "notneeded" && !f.keep;
}

/**
 * «Weitere Dateien»: files outside the list — surplus, duplicate, not needed, not recognised —
 * plus files still uploading or being read. Only «Nicht erkannt» is assigned by hand (D15).
 */
export default function ExtraFiles({ files, placements, instances, suggested, intern, canRename, onView, onAssigned, grouped, allFiles }: Props) {
  const { t, lang } = useFunnelT();
  const street = useFunnelV3((s) => s.info?.adresse);
  const place = useFunnelV3((s) => [s.txt.plz, s.txt.ort].filter(Boolean).join(" "));
  const nameCtx = { object: { street, place } };
  const [showHidden, setShowHidden] = useState(false);
  // Grouped (the funnel, Handover 4.3) shows the «nicht benötigt» files with their reason;
  // the plain list hides them behind «Anzeigen» (spec 4.3 v1).
  const hidden = grouped ? [] : files.filter((f) => isHiddenExtra(f, placements.get(f.id)));
  const visible = files.filter((f) => grouped || !isHiddenExtra(f, placements.get(f.id)) || showHidden);
  const byId = new Map((allFiles ?? files).map((f) => [f.id, f]));

  const label = (f: FileEntry, p: Placement | undefined) => {
    const type = v3DocType(f.analysis?.docTypeId);
    if (type?.kind === "notneeded") return t(`docs.nn.${type.id}`);
    // The requirement's own label key: v5 renamed some (P2 «Aktueller Lohnausweis»).
    if (p?.requirementId) return t(getRequirement(p.requirementId)?.labelKey ?? `doc.${p.requirementId}`);
    return f.name;
  };

  const sub = (f: FileEntry, p: Placement | undefined, state: RowState): string => {
    if (state === "uploading") return t("docs.uploading");
    if (state === "failed") return f.uploadError === "lost" ? t("docs.uploadLost") : t("docs.uploadFailed");
    if (state === "analysing") return t("s5.reading");
    if (f.keep && p?.extraKind === "notneeded") return t("docs.kept");
    // «nicht benötigt (mit Begründung)» and the older Lohnausweis (Handover 4.2, 4.3).
    const reasonKey = extraReasonKey(p, f.analysis?.docTypeId, (k) => hasKey(lang, k) || hasKey("de", k));
    if (reasonKey) return t(reasonKey);
    switch (p?.reason) {
      case "full":
        return t("docs.x.full");
      case "period": {
        const years = requestedYears(p.requirementId) ?? [];
        return t("docs.x.period", { years: [...years].sort().join(", ") });
      }
      case "duplicate":
        return t("docs.x.duplicate", { name: byId.get(p.duplicateOf ?? "")?.name ?? "–" });
      case "notneeded":
        return t("docs.x.notneeded");
      case "offList":
        return suggested.has(f.id) ? t("docs.x.offListSug") : t("docs.x.offList");
      case "dismissed":
        return t("docs.x.dismissed");
      case "failed":
        return t("docs.x.failed");
      case "person":
        return t("docs.x.person");
      default:
        return t("docs.x.unknown");
    }
  };

  const rows = (list: FileEntry[]) =>
    list.map((f) => {
        const p = placements.get(f.id);
        const state = stateOf(f, p);
        const look = STATE_LOOK[state];
        const title = label(f, p);
        // Every kept file outside the list is filed under a stored name; nothing is deleted (Handover 4.3).
        const stored = state === "surplus" || state === "duplicate" || state === "notneeded" ? storedNameForExtra(f, p, nameCtx) : null;
        return (
          <div key={f.id} className={`v3-docrow ${rowClass(state)}`}>
            <div className="v3-docrow-head v3-docrow-head--static">
              <span className="v3-glyph" aria-hidden="true">
                {look.glyph}
              </span>
              <span className="v3-docrow-main">
                <span className="v3-docrow-titleline">
                  <span className="v3-docrow-title">{title}</span>
                  {title !== f.name ? <span className="v3-docrow-why">{f.relativePath || f.name}</span> : null}
                </span>
                <span className="v3-docrow-sub">{sub(f, p, state)}</span>
              </span>
              <span className={`v3-tag v3-tone--${look.tone}`}>{t(look.labelKey)}</span>
            </div>
            {stored ? (
              <div className="v3-extra-actions">
                <StoredName file={f} name={stored} canRename={canRename} />
              </div>
            ) : null}
            {intern && f.audit?.length ? (
              <div className="v3-extra-actions">
                <AuditTrail files={[f]} />
              </div>
            ) : null}
            <div className="v3-extra-actions">
              {state === "unknown" ? (
                <select
                  className="v3-assign"
                  aria-label={t("docs.assignLabel")}
                  value=""
                  onChange={(e) => {
                    const inst = instances.find((i) => i.instanceId === e.target.value);
                    if (!inst) return;
                    const l = t(inst.labelKey) + (inst.person?.display ? ` · ${inst.person.display}` : "");
                    assignFile(f.id, inst.instanceId, inst.labelDe);
                    onAssigned(l);
                  }}
                >
                  <option value="">{t("docs.assignPh")}</option>
                  {instances.map((i) => (
                    <option key={i.instanceId} value={i.instanceId}>
                      {t(i.labelKey)}
                      {i.perBorrower && i.person?.display ? ` · ${i.person.display}` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              {state === "failed" && f.uploadError !== "lost" ? (
                <button type="button" className="v3-btn v3-btn--primary v3-btn--sm" onClick={() => void retryFile(f.id)}>
                  {t("docs.retry")}
                </button>
              ) : null}
              {f.uploadState === "uploaded" ? (
                <button type="button" className="v3-btn v3-btn--ghost v3-btn--sm" onClick={() => onView(f.id)}>
                  {t("act.view")}
                </button>
              ) : null}
              <button type="button" className="v3-btn v3-btn--text v3-btn--sm" onClick={() => removeFile(f.id)}>
                {t("docs.remove")}
              </button>
            </div>
          </div>
        );
      });

  return (
    <>
      {rows(grouped ? groupExtras(visible, placements).flatMap((g) => g.files) : visible)}
      {hidden.length ? (
        <div className="v3-hidden-toggle">
          <span>{t("docs.hiddenN", { n: hidden.length })}</span>
          <button type="button" className="v3-btn v3-btn--text v3-btn--sm" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? t("docs.hide") : t("docs.show")}
          </button>
        </div>
      ) : null}
    </>
  );
}
