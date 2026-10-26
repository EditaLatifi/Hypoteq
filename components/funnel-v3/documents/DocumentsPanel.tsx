"use client";

/**
 * The documents of the funnel (Handover 4; Spezifikation 4, 5), in three places:
 *  - «upload»   Schnellanmeldung step 2: everything there is, the list once files exist
 *  - «guided»   Begleitete Anmeldung step 4 «Unterlagen & Abschluss»: the whole list, the
 *               answer-correction suggestions («Wir haben einen Kreditvertrag erkannt –
 *               ergänzen?», requirementStatus.ts answerCorrections)
 *  - «missing»  Schnellanmeldung step 6: the whole list again — what is there with its file,
 *               what is still open (added by the answers of steps 3–5 or not in the folder) —
 *               with «Fehlende Unterlagen hier ablegen» and «Alle Unterlagen sind vollständig.»
 *               (Handover 3; HYPOTEQ 21.10.2026: the full picture instead of only the gaps)
 *
 * A stored file can be replaced on its row («Ersetzen», HYPOTEQ 21.10.2026): the new file takes
 * its place on that requirement, so a wrong file from step 2 needs no step back.
 *
 * On the last step (guided, missing; HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.1–2.3)
 * «Deine Angaben aus dem Fragepfad» follows the completeness card, and the sections start
 * closed: the head shows title, the open documents, «5 / 10» and «1 zu prüfen» / «2 fehlend».
 * A section with something to check (or a file nobody recognised) starts open. The state is
 * not kept — the Nachreich page and a reload start closed again.
 *
 * One drop zone for files and folders (Handover 4.3, DECISIONS D15). Every file is uploaded at
 * once, read by HYPOTEQ's analysis and placed on the list automatically; only files nobody
 * could recognise are assigned by hand. The work runs in lib/funnel-v3/upload.ts (started at
 * the funnel root) and survives this component; everything shown is derived from the store
 * (documentsSummary). The Auskunftsermächtigung is not in this list: it has its own block in
 * the closing (Handover 6, requirements.ts documentInstances).
 *
 * `?intern=<key>` shows the internal review view (percentages, audit trail).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./documents.css";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelV3, type Step } from "@/lib/funnel-v3/store";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { chf } from "@/lib/funnel-v3/format";
import { effectiveBorrowers, getRequirement, isSignatureRequirement } from "@/lib/funnel-v3/requirements";
import { documentTally } from "@/lib/funnel-v3/requirementStatus";
import { stepOf } from "@/lib/funnel-v3/steps";
import { addPickedFiles, filesFromInput, MAX_FILE_BYTES, replaceFile, screenFiles, type PickedFile, type Rejected } from "@/lib/funnel-v3/upload";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import DropZone, { ACCEPT, type DropZoneHandle } from "./DropZone";
import RequirementRow from "./RequirementRow";
import AnswersSummary from "./AnswersSummary";
import ExtraFiles from "./ExtraFiles";
import FileDetail from "./FileDetail";
import { EXTRA_GROUP_LABEL, groupExtras, groupRows, groupSummary, householdIncomeCheck, shortList } from "./view";
import { focusFieldSoon } from "../hooks";
import { useFunnelUI } from "../uiStore";

/**
 * The value `?intern=` must carry: NEXT_PUBLIC_V3_INTERN_KEY when HYPOTEQ has set one, `1`
 * until then (DECISIONS D23). A view toggle only — renames are authorised server-side.
 */
const INTERN_KEY = process.env.NEXT_PUBLIC_V3_INTERN_KEY || "1";

/** `?intern=<key>`, read after mount (useSearchParams would need a Suspense boundary). */
function useIntern(): boolean {
  const [intern, setIntern] = useState(false);
  useEffect(() => {
    try {
      setIntern(new URLSearchParams(window.location.search).get("intern") === INTERN_KEY);
    } catch {
      setIntern(false);
    }
  }, []);
  return intern;
}

/** «Ja, ergänzen» / «Ja, eintragen» / «Ja, auf «Stockwerkeigentum» setzen» (prototype suggests). */
const ACCEPT_LABEL: Record<string, string> = { loan: "docs.sugAdd", maint: "docs.sugAdd", "3a": "docs.sugEnter", stwe: "docs.sugStwe" };

export type DocumentsVariant = "upload" | "guided" | "missing";

export default function DocumentsPanel({ variant }: { variant: DocumentsVariant }) {
  const { t, lang } = useFunnelT();
  const intern = useIntern();
  const role = useFunnelV3((s) => s.role);
  const mode = useFunnelV3((s) => s.mode);
  const ans = useFunnelV3((s) => s.ans);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const txt = useFunnelV3((s) => s.txt);
  const fin = useFunnelV3((s) => s.fin);
  const applyCorrection = useFunnelV3((s) => s.applyCorrection);
  const dismissSuggestion = useFunnelV3((s) => s.dismissSuggestion);
  const say = useFunnelUI((s) => s.say);
  const summary = useDocumentsSummary();
  const drop = useRef<DropZoneHandle>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Sections toggled by hand; the others follow their default (closed unless something to check).
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);

  const state = useMemo(() => ({ ans, borrowers, txt }), [ans, borrowers, txt]);
  const natural = useMemo(() => (ans.kn === "Juristische Person" ? [] : effectiveBorrowers(state)), [ans.kn, state]);
  const borrowerCount = natural.length;
  const canRename = intern || role === "berater";
  const { status, files, placements, suggestions, instances } = summary;
  const missingOnly = variant === "missing";

  // Spec 5 «Bruttoeinkommen» with several borrowers: shown on the first borrower's Lohnausweis.
  const household = useMemo(() => householdIncomeCheck(instances, files, fin, borrowerCount), [instances, files, fin, borrowerCount]);
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  // The Auskunftsermächtigung has its own block (Handover 6).
  const docRows = useMemo(() => status.requirements.filter((r) => !isSignatureRequirement(r.instance)), [status.requirements]);
  const openRows = useMemo(() => docRows.filter((r) => r.state !== "ok" && r.state !== "skipped"), [docRows]);
  const groups = useMemo(() => groupRows(docRows, state, lang), [docRows, state, lang]);
  const extras = files.filter((f) => !f.instanceId);
  const suggested = useMemo(() => new Set(suggestions.flatMap((s) => s.fileIds)), [suggestions]);
  // «Weitere Dateien»: the kinds it holds as its short line; a file nobody recognised needs a hand.
  const extraGroups = groupExtras(extras, placements);
  const unknownExtras = extraGroups.find((g) => g.key === "unknown")?.files.length ?? 0;

  // ---- counts (prototype «Vollständigkeit»): the same tally as the closing, the
  // Auskunftsermächtigung included although its row sits in its own block (DECISIONS V51).
  const tally = documentTally(status.counts);
  const ok = tally.fulfilled;
  const warn = tally.review;
  const miss = tally.missing;
  const total = tally.total || 1;
  const busy = summary.busy;
  const doneFiles = files.filter((f) => f.analysisState === "done").length;
  const showList = variant !== "upload" || files.length > 0;
  const allComplete = missingOnly && !openRows.length && !busy;
  // The last step (Spezifikation Datenabgleich 2.1, 2.2); the upload of step 2 stays as it was.
  const lastStep = variant !== "upload";
  const isGroupOpen = (key: string, attention: boolean) => !lastStep || (groupOpen[key] ?? attention);
  const toggleGroup = (key: string, now: boolean) => setGroupOpen((o) => ({ ...o, [key]: !now }));
  const extrasOpen = isGroupOpen("extras", unknownExtras > 0);
  const extrasInfo = extraGroups.map((g) => t(EXTRA_GROUP_LABEL[g.key])).join(" · ");

  /** A section head: a plain heading on step 2, a toggle with its state on the last step. */
  const groupHead = (key: string, title: string, info: string, progress: string, badges: { text: string; tone: string }[], isOpen: boolean) => {
    if (!lastStep) {
      return (
        <div className="v3-docgroup-head">
          <span className="v3-docgroup-name">{title}</span>
          <span className="v3-docgroup-rule" />
          <span className="v3-docgroup-count">{progress}</span>
        </div>
      );
    }
    return (
      <button type="button" className="v3-docgroup-toggle" aria-expanded={isOpen} aria-controls={`v3-docgroup-${key.replace(/[^\w-]/g, "-")}`} onClick={() => toggleGroup(key, isOpen)}>
        <span className="v3-docgroup-titles">
          <span className="v3-docgroup-title">{title}</span>
          {info ? <span className="v3-docgroup-info">{info}</span> : null}
        </span>
        <span className="v3-docgroup-meta">
          {badges.map((b) => (
            <span key={b.text} className={`v3-tag v3-tone--${b.tone}`}>
              {b.text}
            </span>
          ))}
          <span className="v3-docgroup-progress">{progress}</span>
          <span className={`v3-docgroup-chev${isOpen ? " is-open" : ""}`} aria-hidden="true">
            ▾
          </span>
        </span>
      </button>
    );
  };

  const sayRejected = useCallback(
    (rejected: Rejected[]) =>
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
      ]),
    [say, t]
  );

  const onFiles = useCallback(
    (picked: PickedFile[]) => {
      const { accepted, rejected } = screenFiles(picked);
      if (accepted.length) {
        addPickedFiles(accepted);
        setOpen({});
      }
      if (rejected.length) sayRejected(rejected);
    },
    [sayRejected]
  );

  const pick = useCallback(() => drop.current?.pick(), []);

  // «Ersetzen»: one file from the picker takes the place of the file the row named.
  const startReplace = useCallback((fileId: string) => {
    replacing.current = fileId;
    replaceInput.current?.click();
  }, []);
  const onReplacePicked = useCallback(
    (list: FileList | null) => {
      const oldId = replacing.current;
      replacing.current = null;
      const [first] = filesFromInput(list);
      if (!oldId || !first) return;
      const { accepted, rejected } = screenFiles([first]);
      if (rejected.length) return sayRejected(rejected);
      const inst = instances.find((i) => i.instanceId === byId.get(oldId)?.instanceId);
      if (replaceFile(oldId, accepted[0])) {
        const label = inst ? t(inst.labelKey) + (inst.perBorrower && inst.person?.display ? ` · ${inst.person.display}` : "") : accepted[0].file.name;
        say([{ text: "✓ " + t("docs.toast.replaced", { label }), big: true }]);
      } else {
        say([{ text: t("docs.toast.already", { name: accepted[0].file.name }), big: true }]);
      }
    },
    [byId, instances, say, sayRejected, t]
  );
  const detailFile = detail ? byId.get(detail) : undefined;
  const detailTitle = (() => {
    if (!detailFile) return "";
    const inst = instances.find((i) => i.instanceId === detailFile.instanceId);
    if (inst) return t(inst.labelKey) + (inst.perBorrower && inst.person?.display ? ` · ${inst.person.display}` : "");
    const type = v3DocType(detailFile.analysis?.docTypeId);
    if (type?.kind === "notneeded") return t(`docs.nn.${type.id}`);
    if (type) return t(getRequirement(type.id)?.labelKey ?? `doc.${type.id}`);
    return detailFile.name;
  })();

  // ---- intern metrics
  const recognised = files.filter((f) => f.analysisState === "done" && f.analysis?.docTypeId);
  const avgConf = recognised.length ? Math.round((recognised.reduce((n, f) => n + (f.analysis?.confidence ?? 0), 0) / recognised.length) * 100) : null;
  const review = warn + files.filter((f) => !f.instanceId && placements.get(f.id)?.extraKind === "unknown").length;
  const dups = files.filter((f) => !f.instanceId && placements.get(f.id)?.extraKind === "duplicate").length;

  return (
    <>
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

      <DropZone ref={drop} onFiles={onFiles} total={files.length} open={busy} title={missingOnly ? t("fast.missingDrop") : undefined} />
      <input
        ref={replaceInput}
        type="file"
        className="v3-docs-hidden-input"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onReplacePicked(e.target.files);
          e.target.value = "";
        }}
      />

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
            {t(sg.textKey, sg.params?.amount !== undefined ? { amount: chf(Number(sg.params.amount)) } : undefined)}{" "}
            {sg.fileIds.length ? t("docs.sugFiles", { names: sg.fileIds.map((id) => byId.get(id)?.name ?? "").join(", ") }) : ""}
          </span>
          <div className="v3-actions">
            {sg.focus ? (
              // No readable amount: the Vorsorge row is filled in by hand, on «Objekt & Finanzierung».
              <button
                type="button"
                className="v3-btn v3-btn--primary"
                onClick={() => {
                  useFunnelV3.getState().goto(stepOf(mode, "objekt") as Step);
                  focusFieldSoon(sg.focus!);
                }}
              >
                {t("docs.sugGoEnter")}
              </button>
            ) : (
              <button
                type="button"
                className="v3-btn v3-btn--primary"
                onClick={() => {
                  applyCorrection(sg.patch);
                  say([{ text: "✓ " + t("toast.corrected"), big: true }]);
                }}
              >
                {t(ACCEPT_LABEL[sg.key] ?? "act.setYes")}
              </button>
            )}
            <button type="button" className="v3-btn v3-btn--ghost" onClick={() => dismissSuggestion(sg.fileIds)}>
              {t("act.dismissDoc")}
            </button>
          </div>
        </div>
      ))}

      {showList ? (
        <div className="v3-status">
          <div className="v3-status-head">
            <div className="v3-status-copy">
              <span className="v3-eyebrow">{t("s5.completeness")}</span>
              <span className="v3-status-line">{t("s5.fulfilled", { ok, total: tally.total })}</span>
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
      ) : null}

      {allComplete ? (
        <div className="v3-allok v3-rise" role="status">
          <span className="v3-allok-mark" aria-hidden="true">
            ✓
          </span>
          <span>{t("fast.allComplete")}</span>
        </div>
      ) : null}

      {lastStep ? <AnswersSummary /> : null}

      {showList
        ? groups.map((g) => {
            const sum = groupSummary(g.rows);
            const isOpen = isGroupOpen(g.key, sum.review > 0);
            const badges = [
              ...(sum.review ? [{ text: t("docs.tallyCheck", { n: sum.review }), tone: "warning" }] : []),
              ...(sum.missing ? [{ text: t("docs.tallyMissing", { n: sum.missing }), tone: "neutral" }] : []),
            ];
            const info = sum.open.length ? shortList(sum.open.map((r) => t(r.instance.labelKey))) : t("docs.allDone");
            return (
            <section key={g.key} id={`v3-docgroup-${g.key.replace(/[^\w-]/g, "-")}`} className={`v3-docgroup${lastStep ? " is-collapsible" : ""}${isOpen ? " is-open" : ""}`} aria-label={g.title}>
              {groupHead(g.key, g.title, info, `${sum.done} / ${sum.total}`, badges, isOpen)}
              {isOpen && g.rows.map((r) => (
                <RequirementRow
                  key={r.instance.instanceId}
                  status={r}
                  files={r.fileIds.map((id) => byId.get(id)).filter((f): f is NonNullable<typeof f> => Boolean(f))}
                  open={Boolean(open[r.instance.instanceId])}
                  onToggle={() => setOpen((o) => ({ ...o, [r.instance.instanceId]: !o[r.instance.instanceId] }))}
                  onPick={pick}
                  onView={setDetail}
                  onReplace={startReplace}
                  intern={intern}
                  canRename={canRename}
                  borrowerCount={borrowerCount}
                  allFiles={files}
                  extraChecks={household && r.instance.id === "lohnausweise" && r.instance.borrowerId === natural[0]?.id ? [household] : undefined}
                />
              ))}
            </section>
            );
          })
        : null}

      {extras.length ? (
        <section id="v3-docgroup-extras" className={`v3-docgroup${lastStep ? " is-collapsible" : ""}${extrasOpen ? " is-open" : ""}`} aria-label={t("s5.otherFiles")}>
          {groupHead("extras", t("s5.otherFiles"), extrasInfo, String(extras.length), unknownExtras ? [{ text: t("docs.unknownN", { n: unknownExtras }), tone: "danger" }] : [], extrasOpen)}
          {extrasOpen ? (
          <ExtraFiles
            files={extras}
            placements={placements}
            instances={instances}
            suggested={suggested}
            intern={intern}
            canRename={canRename}
            onView={setDetail}
            onAssigned={(label) => say([{ text: "✓ " + t("docs.toast.assigned", { label }), big: true }])}
            grouped
            allFiles={files}
          />
          ) : null}
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
    </>
  );
}
