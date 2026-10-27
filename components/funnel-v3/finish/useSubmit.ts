"use client";

/**
 * «Finanzierungsanfrage abschliessen» / «Angaben bestätigen & absenden»: the submit shared by the
 * closing and the Abgleich page (Spezifikation Datenabgleich 3). It waits for running uploads /
 * analyses with a visible phase, warns before the page is left while the request is on its way,
 * and on success hands the outcome to the confirmation page (uiStore `done`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { submitFunnel, SubmitError, type SubmitPhase, type SubmitState } from "@/lib/funnel-v3/submit";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { useFunnelUI } from "../uiStore";
import { hypoPayload } from "../hypo/transcript";
import { saveDone, type DoneInfo } from "./doneState";

export function useSubmit(enabled: boolean) {
  const { t, lang } = useFunnelT();
  const [phase, setPhase] = useState<SubmitPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

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
    if (running.current || !enabled) return;
    running.current = true;
    setError(null);
    setPhase("sending");
    try {
      const res = await submitFunnel({
        // A request from HYPO also carries the valuation order and the transcript (DECISIONS V92).
        getState: () => ({ ...(useFunnelV3.getState() as unknown as SubmitState), hypo: hypoPayload(lang) }),
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
      useFunnelUI.setState({ done: doneInfo, reviewing: false });
    } catch (err) {
      setError(err instanceof SubmitError ? err.message : t("s6.err.submit"));
    } finally {
      running.current = false;
      setPhase(null);
    }
  }, [enabled, lang, t]);

  const progressTitle =
    phase === "uploading" ? t("s6.progress.uploading") : phase === "analysing" ? t("s6.progress.analysing") : t("s6.progress.sending");

  return { submit, phase, busy: phase !== null, error, progressTitle };
}
