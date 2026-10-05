"use client";

/**
 * Schritt 6 · Abschluss (Spezifikation 3; prototype funnel-app.html «6 ABSCHLUSS»).
 *
 * Kennzahlen, Hinweise an die Bank, Prüfliste, then the two actions: «Finanzierungsanfrage
 * abschliessen» (the only way to finish — the shell hides its own «Weiter» on this step) and
 * «Fall-Dossier als PDF». The submit waits for running uploads / analyses with a visible
 * progress state, never navigates, and shows a failure inline with «Erneut versuchen»; only a
 * successful submit shows the done state «Anfrage {Fallnummer} ist bei HYPOTEQ.» with
 * «Neuen Antrag stellen» (empty funnel, back to the start) and «Abschliessen» (hypoteq.ch).
 */

import StepHead from "../StepHead";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { finishSummary } from "@/lib/funnel-v3/finishSummary";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { submitFunnel, SubmitError, type SubmitPhase, type SubmitState } from "@/lib/funnel-v3/submit";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { clearDone, readDone, saveDone, storedDossierUrl, type DoneInfo } from "../finish/doneState";
import { downloadDraftDossier, previewBody } from "../finish/previewDossier";
import "../finish/finish.css";

const HYPOTEQ_URL = "https://hypoteq.ch";

export default function Step6Finish() {
  const { t, lang } = useFunnelT();
  const role = useFunnelV3((s) => s.role);
  const ans = useFunnelV3((s) => s.ans);
  const txt = useFunnelV3((s) => s.txt);
  const fin = useFunnelV3((s) => s.fin);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const files = useFunnelV3((s) => s.files);
  const skipped = useFunnelV3((s) => (s as { skipped?: Iterable<string> }).skipped);
  const submissionId = useFunnelV3((s) => s.submissionId);
  const reset = useFunnelV3((s) => s.reset);

  const docs = useMemo(() => documentsSummary({ ans, borrowers, txt, files, skipped }), [ans, borrowers, txt, files, skipped]);
  const summary = useMemo(
    () =>
      finishSummary({
        state: { role, ans, txt, fin, borrowers },
        status: docs.status,
        files: docs.files,
        hints: docs.hints,
        submittedDocuments: docs.submittedDocuments(),
        lang,
      }),
    [role, ans, txt, fin, borrowers, docs, lang]
  );

  const [phase, setPhase] = useState<SubmitPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [dossierBusy, setDossierBusy] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const running = useRef(false);
  const doneRef = useRef<HTMLElement | null>(null);

  // A reload after the closing shows the done state again (sessionStorage, per submission).
  useEffect(() => {
    setDone(readDone(submissionId));
  }, [submissionId]);

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

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const submit = useCallback(async () => {
    if (running.current) return;
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
      const info: DoneInfo = {
        submissionId: s.submissionId,
        inquiryId: res.inquiryId,
        caseNumber: res.caseNumber,
        name: [s.txt.vor.trim(), s.txt.nach.trim()].filter(Boolean).join(" "),
        email: s.txt.mail.trim(),
      };
      saveDone(info);
      setDone(info);
    } catch (err) {
      setError(err instanceof SubmitError ? err.message : t("s6.err.submit"));
    } finally {
      running.current = false;
      setPhase(null);
    }
  }, [lang, t]);

  const dossier = useCallback(async () => {
    if (dossierBusy) return;
    setDossierBusy(true);
    setDossierError(null);
    try {
      await downloadDraftDossier(previewBody(useFunnelV3.getState() as any, lang));
    } catch {
      setDossierError(t("s6.err.dossier"));
    } finally {
      setDossierBusy(false);
    }
  }, [dossierBusy, lang, t]);

  const startOver = useCallback(() => {
    clearDone(submissionId);
    reset();
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [reset, submissionId]);

  const busy = phase !== null;
  const progressTitle =
    phase === "uploading" ? t("s6.progress.uploading") : phase === "analysing" ? t("s6.progress.analysing") : t("s6.progress.sending");

  return (
    <>
      <StepHead step={6} title={summary.title} lead={summary.lead} large />

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

      {!done && (
        <section className="v3-submit" aria-busy={busy}>
          <h2 className="v3-submit-title">{t("s6.submitTitle")}</h2>
          <p className="v3-submit-text">{t("s6.submitText")}</p>

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

          <div className="v3-submit-actions">
            <button type="button" className="v3-btn v3-btn--dark" onClick={submit} disabled={busy}>
              {t("s6.submitTitle")}
            </button>
            <button type="button" className="v3-btn v3-btn--outline-dark" onClick={dossier} disabled={dossierBusy || busy}>
              {dossierBusy ? t("s6.dossierLoading") : t("s6.dossier")}
            </button>
          </div>
          {dossierError && (
            <p className="v3f-inline-error" role="alert">
              {dossierError}
            </p>
          )}
        </section>
      )}

      {done && (
        <section className="v3-done v3-rise" ref={doneRef} tabIndex={-1} aria-live="polite">
          <span className="v3-done-eyebrow">{t("s6.done")}</span>
          <h2 className="v3-done-title">{done.caseNumber ? t("s6.doneTitle", { id: done.caseNumber }) : t("s6.doneTitleNoId")}</h2>
          <p className="v3-done-text">{t("s6.doneSub", { name: done.name || t("s6.customer"), email: done.email })}</p>
          <div className="v3-submit-actions">
            <button type="button" className="v3-btn v3-btn--primary" onClick={startOver}>
              {t("s6.newRequest")}
            </button>
            {/* On the dark done panel: the white outline, not the dark one meant for light panels. */}
            <a className="v3-btn v3-btn--outline-dark" href={HYPOTEQ_URL}>
              {t("s6.finish")}
            </a>
            <a className="v3-btn v3-btn--text v3f-on-dark" href={storedDossierUrl(done)} download>
              {t("s6.dossier")}
            </a>
          </div>
        </section>
      )}
    </>
  );
}
