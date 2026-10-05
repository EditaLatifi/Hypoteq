"use client";

import { useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { Placement } from "@/lib/funnel-v3/placeFile";
import type { RequirementInstance } from "@/lib/funnel-v3/requirements";
import { assignFile, keepFile, removeFile, retryFile } from "@/lib/funnel-v3/upload";
import { requestedYears, v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import { rowClass, STATE_LOOK, storedNameForExtra, type RowState } from "./view";
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
export default function ExtraFiles({ files, placements, instances, suggested, intern, canRename, onView, onAssigned }: Props) {
  const { t } = useFunnelT();
  const [showHidden, setShowHidden] = useState(false);
  const hidden = files.filter((f) => isHiddenExtra(f, placements.get(f.id)));
  const visible = files.filter((f) => !isHiddenExtra(f, placements.get(f.id)) || showHidden);
  const byId = new Map(files.map((f) => [f.id, f]));

  const label = (f: FileEntry, p: Placement | undefined) => {
    const type = v3DocType(f.analysis?.docTypeId);
    if (type?.kind === "notneeded") return t(`docs.nn.${type.id}`);
    if (p?.requirementId) return t(`doc.${p.requirementId}`);
    return f.name;
  };

  const sub = (f: FileEntry, p: Placement | undefined, state: RowState): string => {
    if (state === "uploading") return t("docs.uploading");
    if (state === "failed") return f.uploadError === "lost" ? t("docs.uploadLost") : t("docs.uploadFailed");
    if (state === "analysing") return t("s5.reading");
    if (f.keep && p?.extraKind === "notneeded") return t("docs.kept");
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

  return (
    <>
      {visible.map((f) => {
        const p = placements.get(f.id);
        const state = stateOf(f, p);
        const look = STATE_LOOK[state];
        const title = label(f, p);
        const stored = state === "surplus" || state === "duplicate" || (state === "notneeded" && f.keep) ? storedNameForExtra(f, p) : null;
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
              {state === "notneeded" ? (
                <button type="button" className="v3-btn v3-btn--ghost v3-btn--sm" onClick={() => keepFile(f.id, !f.keep)}>
                  {f.keep ? t("docs.unkeep") : t("docs.keep")}
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
      })}
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
