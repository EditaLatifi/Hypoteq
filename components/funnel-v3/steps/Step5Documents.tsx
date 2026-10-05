"use client";

/**
 * Funnel v3 step 5 «Unterlagen» (Spezifikation 3 Schritt 5, 4, 5; prototype funnel-app.html).
 *
 * One drop zone for files and folders (DECISIONS D15). Every file is uploaded at once, read by
 * HYPOTEQ's analysis and placed on the requirement list automatically; only files nobody could
 * recognise are assigned by hand. The work itself runs in lib/funnel-v3/upload.ts and survives
 * this component unmounting; everything shown is derived from the store (documentsSummary).
 *
 * `?intern=1` shows the internal review view (percentages, audit trail). Customers and Berater
 * see «Erkannt / Prüfen» only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../documents/documents.css";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { effectiveBorrowers } from "@/lib/funnel-v3/requirements";
import {
  addPickedFiles,
  MAX_FILE_BYTES,
  resumePipeline,
  screenFiles,
  startPlacementSync,
  type PickedFile,
} from "@/lib/funnel-v3/upload";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import DropZone, { type DropZoneHandle } from "../documents/DropZone";
import RequirementRow from "../documents/RequirementRow";
import ExtraFiles from "../documents/ExtraFiles";
import FileDetail from "../documents/FileDetail";
import Toast, { useToast } from "../documents/Toast";
import { groupRows } from "../documents/view";

/** `?intern=1`, read after mount (useSearchParams would need a Suspense boundary). */
function useIntern(): boolean {
  const [intern, setIntern] = useState(false);
  useEffect(() => {
    try {
      setIntern(new URLSearchParams(window.location.search).get("intern") === "1");
    } catch {
      setIntern(false);
    }
  }, []);
  return intern;
}

const ACCEPT_LABEL: Record<string, string> = { loan: "act.setYes", "3a": "act.setYes", maint: "docs.sugCorrect", stwe: "docs.sugStwe" };

export default function Step5Documents() {
  const { t, lang } = useFunnelT();
  const intern = useIntern();
  const role = useFunnelV3((s) => s.role);
  const ans = useFunnelV3((s) => s.ans);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const txt = useFunnelV3((s) => s.txt);
  const setAns = useFunnelV3((s) => s.setAns);
  const dismissSuggestion = useFunnelV3((s) => s.dismissSuggestion);
  const summary = useDocumentsSummary();
  const { lines, say } = useToast();
  const drop = useRef<DropZoneHandle>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);

  // Pick up uploads and analyses the previous mount (or a reload) left; keep placement in step
  // with the answers from now on, also while other steps are shown.
  useEffect(() => {
    startPlacementSync();
    resumePipeline();
  }, []);

  const state = useMemo(() => ({ ans, borrowers, txt }), [ans, borrowers, txt]);
  const borrowerCount = ans.kn === "Juristische Person" ? 0 : effectiveBorrowers(state).length;
  const canRename = intern || role === "berater";
  const { status, files, placements, suggestions, instances } = summary;
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const extras = files.filter((f) => !f.instanceId);
  const groups = useMemo(() => groupRows(status.requirements, state, lang), [status.requirements, state, lang]);
  const suggested = useMemo(() => new Set(suggestions.flatMap((s) => s.fileIds)), [suggestions]);

  // ---- counts (prototype «Vollständigkeit»)
  const c = status.counts;
  const ok = c.fulfilled;
  const warn = c.partial + c.outdated;
  const miss = c.missing + c.analysing;
  const total = c.total || 1;
  const doneFiles = files.filter((f) => f.analysisState === "done").length;
  const busy = summary.busy;

  // ---- toast when a batch is through (prototype resolveFile «last»)
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy > 0) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    const extraN = extras.filter((f) => ["surplus", "notneeded", "duplicate"].includes(placements.get(f.id)?.extraKind ?? "")).length;
    const failed = files.filter((f) => f.uploadState === "failed").length;
    say([
      { text: "✓ " + t("toast.done", { files: doneFiles, req: c.ok }), big: true },
      summary.fieldsRead ? { text: "✓ " + t("toast.fields", { n: summary.fieldsRead }) } : null,
      warn ? { text: "⚠ " + t("docs.toast.check", { n: warn }) } : null,
      extraN ? { text: t("docs.toast.extra", { n: extraN }) } : null,
      failed ? { text: "⚠ " + t("docs.toast.uploadFailed", { n: failed }) } : null,
    ]);
    // Only the transition matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const onFiles = useCallback(
    (picked: PickedFile[]) => {
      const { accepted, rejected } = screenFiles(picked);
      if (accepted.length) {
        addPickedFiles(accepted);
        setOpen({});
      }
      if (rejected.length) {
        say([
          { text: t("docs.toast.rejected", { n: rejected.length }), big: true },
          ...rejected.slice(0, 4).map((r) => ({
            text:
              r.reason === "size"
                ? t("docs.toast.size", { name: r.name, mb: Math.round(MAX_FILE_BYTES / (1024 * 1024)) })
                : r.reason === "empty"
                  ? t("docs.toast.empty", { name: r.name })
                  : t("docs.toast.type", { name: r.name }),
          })),
        ]);
      }
    },
    [say, t]
  );

  const pick = useCallback(() => drop.current?.pick(), []);
  const detailFile = detail ? byId.get(detail) : undefined;
  const detailTitle = (() => {
    if (!detailFile) return "";
    const inst = instances.find((i) => i.instanceId === detailFile.instanceId);
    if (inst) return t(inst.labelKey) + (inst.perBorrower && inst.person?.display ? ` · ${inst.person.display}` : "");
    const type = v3DocType(detailFile.analysis?.docTypeId);
    if (type?.kind === "notneeded") return t(`docs.nn.${type.id}`);
    if (type) return t(`doc.${type.id}`);
    return detailFile.name;
  })();

  // ---- intern metrics
  const recognised = files.filter((f) => f.analysisState === "done" && f.analysis?.docTypeId);
  const avgConf = recognised.length ? Math.round((recognised.reduce((n, f) => n + (f.analysis?.confidence ?? 0), 0) / recognised.length) * 100) : null;
  const review = warn + extras.filter((f) => placements.get(f.id)?.extraKind === "unknown").length;
  const dups = extras.filter((f) => placements.get(f.id)?.extraKind === "duplicate").length;

  return (
    <>
      {/* StepHead equivalent (components/funnel-v3/StepHead on the UI branch). */}
      <div className="v3-head v3-head--loose">
        <span className="v3-rule" aria-hidden="true" />
        <span className="v3-head-eyebrow">
          <strong>{t("common.stepOf", { n: 5, total: 6 })}</strong> · {t("step.5")}
        </span>
        <h1 className="v3-h1" tabIndex={-1}>
          {t("s5.title")}
        </h1>
        <p className="v3-lead v3-lead--lg">{t("s5.lead")}</p>
      </div>

      {intern ? (
        <div className="v3-intern">
          <div className="v3-intern-head">
            <span className="v3-tag v3-tone--info">{t("docs.internBadge")}</span>
            <span>{t("docs.internMeta")}</span>
          </div>
          <div className="v3-intern-metrics">
            {[
              { v: String(doneFiles), l: t("docs.mFiles") },
              { v: avgConf === null ? "–" : `${avgConf} %`, l: t("docs.mConf") },
              { v: String(review), l: t("docs.mReview") },
              { v: String(dups), l: t("docs.mDup") },
            ].map((m) => (
              <div key={m.l}>
                <span className="v3-intern-value">{m.v}</span>
                <span className="v3-intern-label">{m.l}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <DropZone ref={drop} onFiles={onFiles} total={files.length} open={busy} />

      {busy > 0 ? (
        <div className="v3-busy v3-rise" aria-live="polite">
          <div className="v3-busy-head">
            <span className="v3-busy-title">{t("docs.busyTitle")}</span>
            <span className="v3-busy-sub">{t("docs.busySub", { done: doneFiles, open: busy })}</span>
          </div>
          <div className="v3-busy-track">
            <div className="v3-busy-bar" />
          </div>
        </div>
      ) : null}

      {suggestions.map((sg) => (
        <div key={sg.key} className="v3-suggest v3-rise" role="region" aria-label={t(sg.titleKey)}>
          <span className="v3-suggest-title">{t(sg.titleKey)}</span>
          <span className="v3-suggest-text">
            {t(sg.textKey)}{" "}
            {sg.fileIds.length ? t("docs.sugFiles", { names: sg.fileIds.map((id) => byId.get(id)?.name ?? "").join(", ") }) : ""}
          </span>
          <div className="v3-actions">
            <button
              type="button"
              className="v3-btn v3-btn--primary"
              onClick={() => {
                for (const [k, v] of Object.entries(sg.patch)) setAns(k as keyof typeof sg.patch, v as never);
                say([{ text: "✓ " + t("toast.corrected"), big: true }]);
              }}
            >
              {t(ACCEPT_LABEL[sg.key] ?? "act.setYes")}
            </button>
            <button type="button" className="v3-btn v3-btn--ghost" onClick={() => dismissSuggestion(sg.fileIds)}>
              {t("act.dismissDoc")}
            </button>
          </div>
        </div>
      ))}

      <div className="v3-status">
        <div className="v3-status-head">
          <div className="v3-status-copy">
            <span className="v3-eyebrow">{t("s5.completeness")}</span>
            <span className="v3-status-line">{t("s5.fulfilled", { ok, total: c.total })}</span>
            <span className="v3-status-sub">
              {busy
                ? t("docs.progressBusy")
                : warn || miss
                  ? [warn ? t("docs.checkN", { n: warn }) : "", miss ? t("s5.missingN", { n: miss }) : ""].filter(Boolean).join(" ")
                  : t("docs.allDone")}
            </span>
          </div>
          <div className="v3-tallies">
            <span className="v3-tag v3-tone--success">{t("docs.tallyOk", { n: ok })}</span>
            <span className="v3-tag v3-tone--warning">{t("docs.tallyCheck", { n: warn })}</span>
            <span className="v3-tag v3-tone--neutral">{t("docs.tallyMissing", { n: miss })}</span>
          </div>
        </div>
        <div className="v3-statusbar" aria-hidden="true">
          <div className="v3-statusbar-ok" style={{ width: `${(ok / total) * 100}%` }} />
          <div className="v3-statusbar-warn" style={{ width: `${(warn / total) * 100}%` }} />
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="v3-docgroup" aria-label={g.title}>
          <div className="v3-docgroup-head">
            <span className="v3-docgroup-name">{g.title}</span>
            <span className="v3-docgroup-rule" />
            <span className="v3-docgroup-count">
              {g.rows.filter((r) => r.state === "ok" || r.state === "skipped").length} / {g.rows.length}
            </span>
          </div>
          {g.rows.map((r) => (
            <RequirementRow
              key={r.instance.instanceId}
              status={r}
              files={r.fileIds.map((id) => byId.get(id)).filter((f): f is NonNullable<typeof f> => Boolean(f))}
              open={Boolean(open[r.instance.instanceId])}
              onToggle={() => setOpen((o) => ({ ...o, [r.instance.instanceId]: !o[r.instance.instanceId] }))}
              onPick={pick}
              onView={setDetail}
              intern={intern}
              canRename={canRename}
              borrowerCount={borrowerCount}
            />
          ))}
        </section>
      ))}

      {extras.length ? (
        <section className="v3-docgroup" aria-label={t("s5.otherFiles")}>
          <div className="v3-docgroup-head">
            <span className="v3-docgroup-name">{t("s5.otherFiles")}</span>
            <span className="v3-docgroup-rule" />
            <span className="v3-docgroup-count">{extras.length}</span>
          </div>
          <ExtraFiles
            files={extras}
            placements={placements}
            instances={instances}
            suggested={suggested}
            intern={intern}
            canRename={canRename}
            onView={setDetail}
            onAssigned={(label) => say([{ text: "✓ " + t("docs.toast.assigned", { label }), big: true }])}
          />
        </section>
      ) : null}

      {detailFile ? (
        <FileDetail
          key={detailFile.id}
          file={detailFile}
          title={detailTitle}
          intern={intern}
          onClose={() => setDetail(null)}
          onConfirmed={() => say([{ text: "✓ " + t("docs.toast.confirmed"), big: true }])}
        />
      ) : null}

      <Toast lines={lines} />
    </>
  );
}
