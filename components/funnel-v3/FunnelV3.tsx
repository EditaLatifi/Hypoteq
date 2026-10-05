"use client";

import "./funnel-v3.css";
import { useEffect, useRef } from "react";
import { useFunnelV3, useFunnelV3Hydration } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { Footer, MobileHeader, RailBar, TopBar } from "./Chrome";
import DocsRail from "./DocsRail";
import { useFunnelNav } from "./hooks";
import { RAIL_STEPS, arrowAction, roleFromParams } from "./logic";
import { usePartnerRecognition } from "./partner";
import Sidebar from "./Sidebar";
import StartScreen from "./StartScreen";
import Step1General from "./steps/Step1General";
import Step2Object from "./steps/Step2Object";
import Step3Persons from "./steps/Step3Persons";
import Step4Financing from "./steps/Step4Financing";
import Step5Documents from "./steps/Step5Documents";
import Step6Finish from "./steps/Step6Finish";
import { useFunnelUI } from "./uiStore";

const STEP_COMPONENTS = [null, Step1General, Step2Object, Step3Persons, Step4Financing, Step5Documents, Step6Finish] as const;

/**
 * Funnel v3 root: restores the session, applies `?customer=`, runs the partner lookup and the
 * ← / → keys, and lays out start screen or shell (path · content · rail · footer).
 */
export default function FunnelV3() {
  const hydrated = useFunnelV3Hydration();
  const { lang } = useFunnelT();
  const step = useFunnelV3((s) => s.step);
  const role = useFunnelV3((s) => s.role);
  const bmail = useFunnelV3((s) => s.txt.bmail);
  const { goNext, goPrev } = useFunnelNav();
  const paramsApplied = useRef(false);

  usePartnerRecognition(bmail, hydrated && role === "berater");

  // `?customer=partner|direct` preselects the role and skips the start screen (once).
  useEffect(() => {
    if (!hydrated || paramsApplied.current) return;
    paramsApplied.current = true;
    const preset = roleFromParams(window.location.search);
    const s = useFunnelV3.getState();
    if (preset && s.step === 0) {
      s.setRole(preset);
      s.next();
    }
  }, [hydrated]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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
  }, [step, hydrated]);

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

  const StepComponent = STEP_COMPONENTS[step] ?? Step1General;
  const showRail = RAIL_STEPS.includes(step);

  return (
    <div className="hqv3" data-hq-theme="light" data-step={step}>
      <Sidebar />
      <div className="v3-col">
        <MobileHeader />
        <TopBar />
        {showRail ? <RailBar /> : null}
        <div className="v3-main">
          <div className="v3-split">
            <div className="v3-content" key={step}>
              <StepComponent />
            </div>
            {showRail ? <DocsRail /> : null}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
