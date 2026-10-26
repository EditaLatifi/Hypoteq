"use client";

/**
 * The closing, under the documents of the last step of either entry (Handover 2 Schritt 4,
 * 3 Schritt 6; Spezifikation 3 Schritt 6; prototype «ABSCHLUSS»).
 *
 * Kennzahlen, Hinweise an die Bank, Prüfliste, the Auskunftsermächtigung (<SignatureBlock />,
 * Handover 6), then the lime block (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 2.4): on the
 * left the white «Fall-Dossier herunterladen» card with «Alle Angaben & {n} Unterlagen im
 * Überblick · PDF» (no size, HYPOTEQ 26.10.2026), on the right «Finanzierungsanfrage
 * abschliessen →», locked until the signed copy is uploaded or «Später nachreichen» is chosen
 * (logic.ts finishGate). The submit waits for running uploads / analyses with a visible progress
 * state and shows a failure inline with «Erneut versuchen»; a successful submit opens the
 * confirmation page (Confirmation.tsx, through uiStore `done`).
 */

import { finishGate } from "../logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { finishSummary } from "@/lib/funnel-v3/finishSummary";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { submitFunnel, SubmitError, type SubmitPhase, type SubmitState } from "@/lib/funnel-v3/submit";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { saveDone, type DoneInfo } from "./doneState";
import { downloadDraftDossier, previewBody } from "./previewDossier";
import SignatureBlock from "./SignatureBlock";
import { useFunnelUI } from "../uiStore";
import "./finish.css";

export default function Closing() {
  const { t, lang } = useFunnelT();
  const role = useFunnelV3((s) => s.role);
  const ans = useFunnelV3((s) => s.ans);
  const txt = useFunnelV3((s) => s.txt);
  const fin = useFunnelV3((s) => s.fin);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const em = useFunnelV3((s) => s.em);
  const info = useFunnelV3((s) => s.info);
  const mode = useFunnelV3((s) => s.mode);
  const sig = useFunnelV3((s) => s.sig);
  const files = useFunnelV3((s) => s.files);
  const skipped = useFunnelV3((s) => (s as { skipped?: Iterable<string> }).skipped);

  const docs = useMemo(
    () => documentsSummary({ ans, borrowers, txt, em, info, mode, sig, files, skipped }),
    [ans, borrowers, txt, em, info, mode, sig, files, skipped]
  );
  const summary = useMemo(
    () =>
      finishSummary({
        state: { role, ans, txt, fin, em, borrowers },
        status: docs.status,
        files: docs.files,
        hints: docs.hints,
        submittedDocuments: docs.submittedDocuments(),
        lang,
      }),
    [role, ans, txt, fin, em, borrowers, docs, lang]
  );
  const gate = finishGate(docs.signature);

  const [phase, setPhase] = useState<SubmitPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dossierBusy, setDossierBusy] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const running = useRef(false);

  // «Alle Angaben & 28 Unterlagen im Überblick · PDF» — no size: the PDF does not carry the
  // documents themselves (HYPOTEQ 26.10.2026).
  const docCount = docs.files.filter((f) => f.uploadState === "uploaded").length;
  const dossierMeta = docCount === 1 ? t("close.overview1") : t("close.overviewN", { n: docCount });

  // Leaving the page while the request is on its way would leave the customer guessing.
  useEffect(() => {
    if (!phase) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const submit = useCallback(async () => {
    if (running.current || !gate.enabled) return;
    running.current = true;
    setError(null);
    setPhase("sending");
    try {
      const res = await submitFunnel({
        getState: () => useFunnelV3.getState() as unknown as SubmitState,
        lang,
        onPhase: setPhase,
      });
      const s = useFunnelV3.getState();
      const doneInfo: DoneInfo = {
        submissionId: s.submissionId,
        inquiryId: res.inquiryId,
        caseNumber: res.caseNumber,
        name: s.ans.kn === "Juristische Person" ? s.txt.firma.trim() : [s.txt.vor.trim(), s.txt.nach.trim()].filter(Boolean).join(" "),
        email: s.txt.mail.trim(),
      };
      saveDone(doneInfo);
      useFunnelUI.getState().setDone(doneInfo);
    } catch (err) {
      setError(err instanceof SubmitError ? err.message : t("s6.err.submit"));
    } finally {
      running.current = false;
      setPhase(null);
    }
  }, [gate.enabled, lang, t]);

  const dossier = useCallback(async () => {
    if (dossierBusy) return;
    setDossierBusy(true);
    setDossierError(null);
    try {
      await downloadDraftDossier(previewBody(useFunnelV3.getState() as never, lang));
    } catch {
      setDossierError(t("s6.err.dossier"));
    } finally {
      setDossierBusy(false);
    }
  }, [dossierBusy, lang, t]);

  const busy = phase !== null;
  const progressTitle =
    phase === "uploading" ? t("s6.progress.uploading") : phase === "analysing" ? t("s6.progress.analysing") : t("s6.progress.sending");

  return (
    <>
      <div className="v3-closing-head">
        <span className="v3-rule" aria-hidden="true" />
        <span className="v3-eyebrow">{t("step.6")}</span>
        <h2 className="v3-h2">{summary.title}</h2>
        <p className="v3-lead">{summary.lead}</p>
      </div>

      <div className="v3-kpis">
        {summary.kpis.map((k) => (
          <div className="v3-kpi" key={k.key}>
            <span className="v3-kpi-label">{k.label}</span>
            <span className="v3-kpi-value">{k.value}</span>
          </div>
        ))}
      </div>

      {summary.hints.length > 0 && (
        <section className="v3-hints" aria-label={summary.hintsLabel}>
          <span className="v3-eyebrow v3-eyebrow--tight">{summary.hintsLabel}</span>
          {summary.hints.map((h) => (
            <div className="v3-hintrow" key={`${h.kind}:${h.instanceId}`}>
              <span className="v3-hintbadge">{t("s6.hint")}</span>
              <span className="v3-hintrow-text">
                <span className="v3-hintrow-title">{h.title}</span>
                {h.text && <span className="v3-hintrow-sub">{h.text}</span>}
              </span>
            </div>
          ))}
        </section>
      )}

      <section aria-label={t("s6.checks")} className="v3f-checks">
        <span className="v3-eyebrow v3-eyebrow--tight">{t("s6.checks")}</span>
        <div className="v3-checklist">
          {summary.checks.map((c) => (
            <div className="v3-checkrow" key={c.key}>
              <span className={`v3f-glyph v3-tone--${c.ok ? "success" : "warning"}`} aria-hidden="true">
                {c.ok ? "✓" : "!"}
              </span>
              <span className="v3-checkrow-text">
                <span className="v3-checkrow-title">{c.label}</span>
                <span className="v3-checkrow-sub">{c.sub}</span>
              </span>
              <span className={`v3-tag v3-tone--${c.ok ? "success" : "warning"}`}>{c.badge}</span>
            </div>
          ))}
        </div>
      </section>

      <SignatureBlock />

      <section className="v3-submit v3-submit--split" aria-busy={busy}>
        <div className="v3-dossier">
          <span className="v3-dossier-icon" aria-hidden="true">
            <svg viewBox="0 0 32 40" width="32" height="40" focusable="false">
              <path d="M3 1h18l8 8v28a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
              <path d="M21 1v8h8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <rect x="1" y="22" width="22" height="11" rx="2" fill="currentColor" />
              <text x="12" y="30.4" textAnchor="middle" fontSize="7.4" fontWeight="700" fill="#caf476" fontFamily="Arial, sans-serif">
                PDF
              </text>
            </svg>
          </span>
          <span className="v3-dossier-copy">
            <span className="v3-dossier-title">{t("close.dossierTitle")}</span>
            <span className="v3-dossier-meta">{dossierMeta}</span>
          </span>
          <button type="button" className="v3-btn v3-btn--dark" onClick={dossier} disabled={dossierBusy || busy}>
            {dossierBusy ? t("s6.dossierLoading") : t("close.download")}
          </button>
          {dossierError && (
            <p className="v3f-inline-error v3-dossier-error" role="alert">
              {dossierError}
            </p>
          )}
        </div>

        <div className="v3-submit-side">
          {busy && (
            <div className="v3-busy" role="status" aria-live="polite">
              <div className="v3-busy-head">
                <span className="v3-busy-title">{progressTitle}</span>
                <span className="v3-busy-sub">{t("s6.progress.note")}</span>
              </div>
              <div className="v3-busy-track">
                <span className="v3-busy-bar" />
              </div>
            </div>
          )}

          {error && !busy && (
            <div className="v3-note v3f-error" role="alert">
              <span>{error}</span>
              <button type="button" className="v3-btn v3-btn--sm v3-btn--outline-dark" onClick={submit}>
                {t("s6.retry")}
              </button>
            </div>
          )}

          <button
            type="button"
            className="v3-btn v3-btn--dark v3-btn--lg v3-submit-go"
            onClick={submit}
            disabled={busy || !gate.enabled}
            aria-describedby={gate.enabled ? undefined : "v3-finish-blocked"}
          >
            {t(gate.labelKey) + (gate.enabled ? " →" : "")}
          </button>
          {gate.enabled ? (
            <p id="v3-finish-after" className="v3-submit-after">
              {t("close.after")}
            </p>
          ) : (
            <p id="v3-finish-blocked" className="v3f-blocked">
              {t("s6.finishBlockedHint")}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
