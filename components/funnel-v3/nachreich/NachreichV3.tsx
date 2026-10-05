"use client";

/**
 * Nachreich page for a Funnel v3 inquiry (spec V2, 4, 5): only the requirements the dossier
 * still misses, grouped like step 5, and ONE drop zone. Every file goes through the funnel's
 * own pipeline (lib/funnel-v3/upload.ts: upload → finalize → analyse v3 → placement), bound to
 * a page-local store and placed only on the missing requirements. «Unterlagen senden» posts
 * the per-file detail; the server adopts, renames and re-evaluates (lib/funnel-v3/nachreich.ts).
 *
 * Shown in the funnel's visual language (`.hqv3`). The page copy (title, intro, buttons) comes
 * from the site messages the legacy page uses (`nachreichen.*`); everything about documents
 * from messages/funnel-v3.
 */

import "../funnel-v3.css";
import "../documents/documents.css";
import "./nachreich.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { createFunnelV3Store } from "@/lib/funnel-v3/store";
import { EMPTY_TEXTS } from "@/lib/funnel-v3/types";
import {
  addPickedFiles,
  bindUploadPipeline,
  MAX_FILE_BYTES,
  screenFiles,
  settleUploads,
  type PickedFile,
} from "@/lib/funnel-v3/upload";
import { nachreichDocuments, nachreichInstances } from "@/lib/funnel-v3/nachreichPage";
import type { NachreichV3View, RemainingRequirement } from "@/lib/funnel-v3/nachreichView";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import DropZone, { type DropZoneHandle } from "../documents/DropZone";
import RequirementRow from "../documents/RequirementRow";
import ExtraFiles from "../documents/ExtraFiles";
import FileDetail from "../documents/FileDetail";
import Toast, { useToast } from "../documents/Toast";

export interface NachreichCopy {
  title: string;
  intro: string;
  send: string;
  sending: string;
  error: string;
  doneComplete: string;
  donePartial: string;
  alreadyComplete: string;
}

const NO_SUGGESTIONS = new Set<string>();

export default function NachreichV3({ token, view, copy }: { token: string; view: NachreichV3View; copy: NachreichCopy }) {
  const { t, lang } = useFunnelT();
  const { lines, say } = useToast();
  const drop = useRef<DropZoneHandle>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [phase, setPhase] = useState<"ready" | "sending" | "done">("ready");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ complete: boolean; remaining: RemainingRequirement[] } | null>(null);

  // A store of its own: the funnel's sessionStorage copy is never touched. Uploads are filed
  // under the inquiry id, into the inquiry's folder, under the address the inquiry has.
  const useStore = useMemo(
    () =>
      createFunnelV3Store({
        submissionId: view.submissionId,
        sharepointFolderId: view.folderId,
        txt: { ...EMPTY_TEXTS, mail: view.email ?? "" },
      }),
    [view.submissionId, view.folderId, view.email]
  );
  const instances = useMemo(() => nachreichInstances(view.missing), [view.missing]);
  useEffect(() => bindUploadPipeline(useStore, { instances: () => instances }), [useStore, instances]);

  const rawFiles = useStore((s) => s.files);
  const docs = useMemo(() => nachreichDocuments(rawFiles, instances), [rawFiles, instances]);
  const { files, placements, status, busy } = docs;
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const statusById = useMemo(() => new Map(status.requirements.map((r) => [r.instance.instanceId, r])), [status]);
  const extras = files.filter((f) => !f.instanceId);

  // Groups in the order the server sent them («Zum Objekt», «Zur Person · Name» …).
  const groups = useMemo(() => {
    const out: { key: string; title: string; ids: string[] }[] = [];
    for (const m of view.missing) {
      let g = out.find((x) => x.key === m.groupKey);
      if (!g) out.push((g = { key: m.groupKey, title: m.groupLabel, ids: [] }));
      g.ids.push(m.instanceId);
    }
    return out;
  }, [view.missing]);
  const missingById = useMemo(() => new Map(view.missing.map((m) => [m.instanceId, m])), [view.missing]);

  const onFiles = useCallback(
    (picked: PickedFile[]) => {
      const { accepted, rejected } = screenFiles(picked);
      if (accepted.length) {
        addPickedFiles(accepted);
        setOpen({});
        setError("");
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

  const submit = async () => {
    setPhase("sending");
    setError("");
    try {
      // Running uploads are part of what is sent; analyses get a short while to land.
      const failed = await settleUploads();
      if (failed.length) throw new Error(failed.join(", "));
      const documents = nachreichDocuments(useStore.getState().files, instances).submittedDocuments();
      if (!documents.length) throw new Error(t("s5.notUploaded"));
      const res = await fetch(`/api/nachreichen/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, locale: lang }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || json?.reason || `HTTP ${res.status}`);
      setResult({ complete: json.complete === true, remaining: Array.isArray(json.remaining) ? json.remaining : [] });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("ready");
    }
  };

  const detailFile = detail ? byId.get(detail) : undefined;
  const detailTitle = (() => {
    if (!detailFile) return "";
    const m = detailFile.instanceId ? missingById.get(detailFile.instanceId) : undefined;
    if (m) return m.label;
    const type = v3DocType(detailFile.analysis?.docTypeId);
    if (type?.kind === "notneeded") return t(`docs.nn.${type.id}`);
    if (type) return t(`doc.${type.id}`);
    return detailFile.name;
  })();

  const shell = (children: React.ReactNode) => (
    <div className="hqv3 v3-nachreich" data-hq-theme="light">
      <div className="v3-col">
        <div className="v3-main">
          <div className="v3-content">{children}</div>
        </div>
      </div>
    </div>
  );

  const head = (title: string, lead?: string) => (
    <div className="v3-head v3-head--loose">
      <span className="v3-rule" aria-hidden="true" />
      {view.caseNumber ? <span className="v3-head-eyebrow">{view.caseNumber}</span> : null}
      <h1 className="v3-h1">{title}</h1>
      {lead ? <p className="v3-lead v3-lead--lg">{lead}</p> : null}
    </div>
  );

  if (phase === "done" && result) {
    return shell(
      <>
        {head(result.complete ? copy.doneComplete : copy.donePartial)}
        {!result.complete && result.remaining.length ? (
          <ul className="v3-nachreich-remaining">
            {result.remaining.map((r) => (
              <li key={r.instanceId}>{r.label}</li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  if (!view.missing.length) return shell(head(copy.title, copy.alreadyComplete));

  const sending = phase === "sending";
  const ready = files.some((f) => f.uploadState !== "failed");

  return shell(
    <>
      {head(copy.title, copy.intro)}

      <DropZone ref={drop} onFiles={onFiles} total={files.length} open={busy} />

      {busy > 0 ? (
        <div className="v3-busy v3-rise" aria-live="polite">
          <div className="v3-busy-head">
            <span className="v3-busy-title">{t("docs.busyTitle")}</span>
            <span className="v3-busy-sub">{t("docs.busySub", { done: files.filter((f) => f.analysisState === "done").length, open: busy })}</span>
          </div>
          <div className="v3-busy-track">
            <div className="v3-busy-bar" />
          </div>
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.key} className="v3-docgroup" aria-label={g.title}>
          <div className="v3-docgroup-head">
            <span className="v3-docgroup-name">{g.title}</span>
            <span className="v3-docgroup-rule" />
            <span className="v3-docgroup-count">
              {g.ids.filter((id) => statusById.get(id)?.state === "ok").length} / {g.ids.length}
            </span>
          </div>
          {g.ids.map((id) => {
            const r = statusById.get(id);
            const m = missingById.get(id)!;
            if (!r) return null;
            return (
              <RequirementRow
                key={id}
                status={r}
                files={r.fileIds.map((fid) => byId.get(fid)).filter((f): f is NonNullable<typeof f> => Boolean(f))}
                open={Boolean(open[id])}
                onToggle={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}
                onPick={() => drop.current?.pick()}
                onView={setDetail}
                intern={false}
                canRename={false}
                borrowerCount={0}
                caseNumber={view.caseNumber}
                priorFiles={m.state === "partial" ? m.have : 0}
              />
            );
          })}
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
            suggested={NO_SUGGESTIONS}
            intern={false}
            canRename={false}
            onView={setDetail}
            onAssigned={(label) => say([{ text: "✓ " + t("docs.toast.assigned", { label }), big: true }])}
          />
        </section>
      ) : null}

      {error ? (
        <p className="v3-error" role="alert">
          {copy.error} {error}
        </p>
      ) : null}

      <div className="v3-actions v3-nachreich-submit">
        <button type="button" className="v3-btn v3-btn--primary" onClick={submit} disabled={sending || !ready}>
          {sending ? copy.sending : copy.send}
        </button>
      </div>

      {detailFile ? (
        <FileDetail
          key={detailFile.id}
          file={detailFile}
          title={detailTitle}
          intern={false}
          onClose={() => setDetail(null)}
          onConfirmed={() => say([{ text: "✓ " + t("docs.toast.confirmed"), big: true }])}
        />
      ) : null}

      <Toast lines={lines} />
    </>
  );
}
