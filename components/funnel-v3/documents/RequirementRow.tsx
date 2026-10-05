"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import type { FileEntry } from "@/lib/funnel-v3/files";
import type { RequirementStatus } from "@/lib/funnel-v3/requirementStatus";
import { acceptOutdated, removeFile } from "@/lib/funnel-v3/upload";
import { freshnessProblem } from "@/components/documentIntelligence/v3/catalogue";
import { chf, chip, crossChecks, mergedFields, outdatedText, reasonText, rowClass, STATE_LOOK, storedNameFor } from "./view";
import StoredName from "./StoredName";
import AuditTrail from "./AuditTrail";

interface Props {
  status: RequirementStatus;
  files: FileEntry[];
  open: boolean;
  onToggle: () => void;
  onPick: () => void;
  onView: (fileId: string) => void;
  intern: boolean;
  canRename: boolean;
  borrowerCount: number;
  /**
   * Nachreich page: the inquiry's case number is known (names are final, no «assigned at
   * completion» hint), and `priorFiles` files of this requirement are already in the case
   * folder, so the new ones are numbered after them.
   */
  caseNumber?: string | null;
  priorFiles?: number;
}

/** One requirement (spec 4.2): state, reason, files, recognised values, actions. */
export default function RequirementRow({ status: r, files, open, onToggle, onPick, onView, intern, canRename, borrowerCount, caseNumber, priorFiles = 0 }: Props) {
  const { t, lang } = useFunnelT();
  const fin = useFunnelV3((s) => s.fin);
  const setSkipped = useFunnelV3((s) => s.setSkipped);
  const inst = r.instance;
  const look = STATE_LOOK[r.state];
  const done = files.filter((f) => f.analysisState === "done");
  const names = done.map((f) => f.name).join(" · ");
  const hasContent = ["ok", "outdated", "partial"].includes(r.state);

  let sub: string;
  if (r.state === "missing") sub = t("s5.notUploaded");
  else if (r.state === "analysing") sub = t("s5.reading");
  else if (r.state === "skipped") sub = t("s5.markedNone");
  else if (r.state === "partial") sub = `${t("s5.filesOf", { n: r.doneFiles, total: r.expect })} · ${names}`;
  else sub = names;

  const badge = r.state === "partial" ? `${t(look.labelKey)} · ${r.doneFiles}/${r.expect}` : t(look.labelKey);
  const fields = hasContent ? mergedFields(done) : [];
  const checks = hasContent ? crossChecks(inst, done, fin, borrowerCount) : [];
  const notes = Array.from(new Set(done.map((f) => f.analysis?.note).filter((n): n is string => !!n)));
  const outdatedFiles = done.filter((f) => f.analysis?.outdated);
  const warn =
    r.state === "outdated"
      ? outdatedFiles
          .map((f) => outdatedText(freshnessProblem(f.analysis?.docTypeId, f.analysis?.docDate, f.analysis?.fields), lang))
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(" ")
      : null;

  return (
    <div className={`v3-docrow ${rowClass(r.state)}`}>
      <button type="button" className="v3-docrow-head" onClick={onToggle} aria-expanded={open}>
        <span className="v3-glyph" aria-hidden="true">
          {look.glyph}
        </span>
        <span className="v3-docrow-main">
          <span className="v3-docrow-titleline">
            <span className="v3-docrow-title">{t(inst.labelKey)}</span>
            <span className="v3-docrow-why">{reasonText(inst.reason, lang)}</span>
          </span>
          {sub ? <span className="v3-docrow-sub">{sub}</span> : null}
        </span>
        <span className={`v3-tag v3-tone--${look.tone}`}>{badge}</span>
        <span className={`v3-more${open ? " is-open" : ""}`}>
          <span>{open ? t("s5.close") : hasContent ? t("s5.details") : t("s5.more")}</span>
          <span className="v3-caret" aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      {open ? (
        <div className="v3-docrow-body v3-rise">
          {done.length ? (
            <div className="v3-docrow-section">
              <span className="v3-eyebrow">{t("s5.storedAs")}</span>
              {done.map((f, i) => (
                <div key={f.id} className="v3-stored-row">
                  <StoredName file={f} name={storedNameFor(f, inst, priorFiles + i + 1, priorFiles + done.length, caseNumber)} canRename={canRename} />
                  <button type="button" className="v3-btn v3-btn--ghost v3-btn--sm" onClick={() => onView(f.id)}>
                    {t("act.view")}
                  </button>
                  <button type="button" className="v3-btn v3-btn--text v3-btn--sm" onClick={() => removeFile(f.id)}>
                    {t("docs.remove")}
                  </button>
                </div>
              ))}
              {caseNumber ? null : <span className="v3-stored-hint">{t("docs.caseLater")}</span>}
            </div>
          ) : null}

          {fields.length ? (
            <div className="v3-docrow-section">
              <span className="v3-eyebrow">{t("s5.recognisedFields")}</span>
              {fields.map((f) => {
                const c = chip(f.confidence, intern, t, f.edited);
                return (
                  <div key={f.key} className="v3-fieldrow">
                    <span className="v3-fieldrow-k">{f.key}</span>
                    <span className="v3-fieldrow-v">
                      <span>{f.value}</span>
                      <span className={`v3-tag v3-tone--${c.tone}`}>{c.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {checks.length ? (
            <div className="v3-docrow-section">
              <span className="v3-eyebrow">{t("s5.crossCheck")}</span>
              {checks.map((c) => (
                <div key={c.field} className={`v3-check${c.ok ? "" : " is-diff"}`}>
                  <span className="v3-check-mark" aria-hidden="true">
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span>
                    <strong>{c.field}</strong> · {t("s5.funnel")} {chf(c.funnel)} · {t("s5.document")} {chf(c.doc)} ·{" "}
                    {c.ok ? t("docs.checkOk") : t("docs.checkDiff")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {notes.map((n) => (
            <div key={n} className="v3-docnote">
              {n}
            </div>
          ))}
          {warn ? <div className="v3-warn">{warn}</div> : null}
          {r.overridden ? <div className="v3-docnote">{t("docs.overridden")}</div> : null}

          {intern ? <AuditTrail files={files} /> : null}

          <div className="v3-actions">
            {r.state === "missing" || r.state === "partial" ? (
              <button type="button" className="v3-btn v3-btn--primary" onClick={onPick}>
                {t("act.upload")}
              </button>
            ) : null}
            {r.state === "missing" && inst.optional ? (
              <button type="button" className="v3-btn v3-btn--ghost" onClick={() => setSkipped(inst.instanceId, true)}>
                {t("act.dontHave")}
              </button>
            ) : null}
            {r.state === "outdated" ? (
              <>
                <button type="button" className="v3-btn v3-btn--primary" onClick={onPick}>
                  {t("docs.uploadCurrent")}
                </button>
                <button type="button" className="v3-btn v3-btn--ghost" onClick={() => outdatedFiles.forEach((f) => acceptOutdated(f.id))}>
                  {t("act.useAnyway")}
                </button>
              </>
            ) : null}
            {r.state === "skipped" ? (
              <button
                type="button"
                className="v3-btn v3-btn--ghost"
                onClick={() => {
                  setSkipped(inst.instanceId, false);
                  onPick();
                }}
              >
                {t("act.uploadAnyway")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
