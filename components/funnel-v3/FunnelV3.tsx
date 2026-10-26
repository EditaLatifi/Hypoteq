"use client";

import "./funnel-v3.css";
import { useEffect, useRef, type ComponentType } from "react";
import { useFunnelV3, useFunnelV3Hydration } from "@/lib/funnel-v3/store";
import { RAIL_SCREENS, screenAt, stepCount, type Screen } from "@/lib/funnel-v3/steps";
import { resumePipeline, startPlacementSync } from "@/lib/funnel-v3/upload";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { Footer, MobileHeader, ModeSwitch, RailBar, TopBar } from "./Chrome";
import DocsRail from "./DocsRail";
import Toast from "./documents/Toast";
import { useFunnelNav } from "./hooks";
import { arrowAction, entryFromParams } from "./logic";
import { usePartnerRecognition } from "./partner";
import PrefillBanner from "./PrefillBanner";
import Sidebar from "./Sidebar";
import StartScreen from "./StartScreen";
import StepHead from "./StepHead";
import Confirmation from "./finish/Confirmation";
import { readDone } from "./finish/doneState";
import ScreenAnfrage from "./steps/ScreenAnfrage";
import { ScreenAbschluss, ScreenUpload } from "./steps/ScreenDocuments";
import ScreenKontakt from "./steps/ScreenKontakt";
import ScreenObjekt from "./steps/ScreenObjekt";
import ScreenPersonen from "./steps/ScreenPersonen";
import { useFunnelUI } from "./uiStore";
import { useDocumentToasts } from "./useDocumentToasts";

/** One component per screen (lib/funnel-v3/steps.ts): the two entries share them. */
const SCREEN_COMPONENTS: Record<Screen, ComponentType> = {
  kontakt: ScreenKontakt,
  upload: ScreenUpload,
  anfrage: ScreenAnfrage,
  objekt: ScreenObjekt,
  personen: ScreenPersonen,
  abschluss: ScreenAbschluss,
};

/** The prefill banner stands on the prefilled screens of the Schnellanmeldung (Handover 3). */
const PREFILLED: ReadonlySet<Screen> = new Set<Screen>(["anfrage", "objekt", "personen"]);

/** The funnel's single toast (uiStore say). */
function FunnelToast() {
  const lines = useFunnelUI((s) => s.toast);
  return <Toast lines={lines} />;
}

/**
 * Funnel root (Handover 1–4): restores the session, applies the entry link (`?customer=`,
 * `?from=portal`, `bmail`), runs the partner lookup, the documents pipeline (upload,
 * analysis, placement, prefill — upload.ts, also while no documents screen is open) and the
 * ← / → keys, and lays out the start screen or the shell (path · content · rail · footer)
 * for the mode's screens.
 */
export default function FunnelV3() {
  const hydrated = useFunnelV3Hydration();
  const { lang } = useFunnelT();
  const step = useFunnelV3((s) => s.step);
  const mode = useFunnelV3((s) => s.mode);
  const role = useFunnelV3((s) => s.role);
  const bmail = useFunnelV3((s) => s.txt.bmail);
  const submissionId = useFunnelV3((s) => s.submissionId);
  const done = useFunnelUI((s) => s.done);
  const returnTo = useFunnelUI((s) => s.returnTo);
  const reviewing = useFunnelUI((s) => s.reviewing);
  const { goNext, goPrev } = useFunnelNav();
  const paramsApplied = useRef(false);

  usePartnerRecognition(bmail, hydrated && role === "berater");
  useDocumentToasts(hydrated);

  // The entry link presets the role on the start screen (once; DECISIONS V49): `?customer=
  // partner|direct`, and from the Partnerportal `bmail=<e-mail>&from=portal` — the Berater
  // address is filled in, so the partner is recognised at once, the start screen recommends
  // the Schnellanmeldung, and the closing offers the way back (entryFromParams).
  useEffect(() => {
    if (!hydrated || paramsApplied.current) return;
    paramsApplied.current = true;
    const entry = entryFromParams(window.location.search);
    const s = useFunnelV3.getState();
    if (entry.fromPortal) s.setEntry("portal");
    if (entry.role && s.step === 0) s.setRole(entry.role);
    if (entry.role === "berater" && entry.bmail && useFunnelV3.getState().role === "berater" && !useFunnelV3.getState().txt.bmail.trim()) {
      s.setTxt("bmail", entry.bmail);
    }
  }, [hydrated]);

  // Uploads and analyses a reload left, and placement + prefill in step with the answers.
  useEffect(() => {
    if (!hydrated) return;
    startPlacementSync();
    resumePipeline();
  }, [hydrated]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // «Bearbeiten» from the last step: the way back ends once that step is open again, however
  // it was reached (the footer, the path, the arrows).
  const current = step > 0 ? screenAt(mode, Math.min(step, stepCount(mode))) : null;
  useEffect(() => {
    if (returnTo && (current === returnTo || current === null)) useFunnelUI.getState().setReturnTo(null);
  }, [current, returnTo]);
  // The Abgleich page belongs to the last step: leaving it ends the review.
  useEffect(() => {
    if (reviewing && current !== "abschluss") useFunnelUI.setState({ reviewing: false });
  }, [current, reviewing]);

  // A reload after the closing opens the confirmation page again (sessionStorage, per submission).
  useEffect(() => {
    if (hydrated) useFunnelUI.getState().setDone(readDone(submissionId));
  }, [hydrated, submissionId]);

  // A new topic starts at the top, with the rail collapsed (prototype goto).
  const firstStep = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    useFunnelUI.getState().setRailOpen(false);
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [step, mode, hydrated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const action = arrowAction({
        key: e.key,
        step: useFunnelV3.getState().step,
        tag: (target?.tagName || "").toLowerCase(),
        editable: Boolean(target?.isContentEditable),
        inRadioGroup: Boolean(target?.closest?.('[role="radiogroup"]')),
        modifier: e.altKey || e.ctrlKey || e.metaKey || e.shiftKey,
        defaultPrevented: e.defaultPrevented,
        dialogOpen: Boolean(document.querySelector('.hqv3 [role="dialog"][aria-modal="true"]')),
      });
      if (!action) return;
      e.preventDefault();
      if (action === "next") goNext();
      else goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  if (!hydrated) return <div className="hqv3 is-start" aria-busy="true" />;

  if (step === 0) {
    return (
      <div className="hqv3 is-start">
        <StartScreen />
      </div>
    );
  }

  const screen = screenAt(mode, Math.min(step, stepCount(mode))) ?? "anfrage";

  // After the closing: the confirmation page, on its own (Spezifikation Datenabgleich 2.5).
  if (screen === "abschluss" && done && done.submissionId === submissionId) {
    return (
      <div className="hqv3 is-start">
        <Confirmation done={done} />
      </div>
    );
  }

  const ScreenComponent = SCREEN_COMPONENTS[screen];
  // «Deine Unterlagen» while the answers still change the list; «Deine Anfrage füllt sich»
  // beside the Schnellanmeldung's upload.
  const showRail = RAIL_SCREENS.has(screen) || screen === "upload";
  // The Abgleich page has its own heading and its own «Zurück» (back to the step, not before it).
  const review = reviewing && screen === "abschluss";

  return (
    <div className="hqv3" data-hq-theme="light" data-step={step} data-mode={mode} data-screen={screen}>
      <Sidebar />
      <div className="v3-col">
        <MobileHeader showRail={showRail} />
        <TopBar />
        {showRail ? <RailBar /> : null}
        <main className="v3-main">
          <div className="v3-split">
            <div className="v3-content" key={`${mode}:${step}`}>
              {review ? null : <StepHead />}
              {mode === "schnell" && PREFILLED.has(screen) ? <PrefillBanner /> : null}
              <ScreenComponent />
              <ModeSwitch className="v3-mswitch" />
            </div>
            {showRail ? <DocsRail /> : null}
          </div>
        </main>
        {review ? null : <Footer />}
      </div>
      <FunnelToast />
    </div>
  );
}
