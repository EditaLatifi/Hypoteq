"use client";

/**
 * The confirmation page after «Finanzierungsanfrage abschliessen» (HYPOTEQ 23.10.2026,
 * Spezifikation Datenabgleich 2.5): no way off to the homepage, a page of its own in the look of
 * the start screen — «Anfrage eingereicht – vielen Dank!» with the case number, the three next
 * steps (the third with the number of documents still missing), «Fall-Dossier herunterladen
 * (PDF)» and «Zur HYPOTEQ-Startseite». A Berater goes back to the Partnerportal instead of the
 * homepage, as before; «Neuen Antrag stellen» stays.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { documentTally } from "@/lib/funnel-v3/requirementStatus";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import LanguageSwitch from "../LanguageSwitch";
import { portalAction } from "../logic";
import { useFunnelUI } from "../uiStore";
import { clearDone, storedDossierUrl, type DoneInfo } from "./doneState";

const HYPOTEQ_URL = "https://hypoteq.ch";

export default function Confirmation({ done }: { done: DoneInfo }) {
  const { t } = useFunnelT();
  const role = useFunnelV3((s) => s.role);
  const entry = useFunnelV3((s) => s.entry);
  const ans = useFunnelV3((s) => s.ans);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const txt = useFunnelV3((s) => s.txt);
  const em = useFunnelV3((s) => s.em);
  const info = useFunnelV3((s) => s.info);
  const mode = useFunnelV3((s) => s.mode);
  const sig = useFunnelV3((s) => s.sig);
  const files = useFunnelV3((s) => s.files);
  const skipped = useFunnelV3((s) => (s as { skipped?: Iterable<string> }).skipped);
  const reset = useFunnelV3((s) => s.reset);
  // Berater: is this browser logged into the Partnerportal? Decides the way-back button.
  const [portalSession, setPortalSession] = useState<"in" | "out" | "unknown">("unknown");
  const heading = useRef<HTMLHeadingElement | null>(null);

  // What the answers and the files submitted still leave open (the Auskunftsermächtigung included).
  const missing = useMemo(
    () => documentTally(documentsSummary({ ans, borrowers, txt, em, info, mode, sig, files, skipped }).status.counts).missing,
    [ans, borrowers, txt, em, info, mode, sig, files, skipped]
  );
  const berater = role === "berater" || entry === "portal";

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
    heading.current?.focus();
  }, []);

  // Asked only for a Berater (the customer never sees the portal).
  useEffect(() => {
    if (role !== "berater" || typeof fetch !== "function") return;
    let cancelled = false;
    fetch("/api/portal/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j.loggedIn === "boolean") setPortalSession(j.loggedIn ? "in" : "out");
      })
      .catch(() => {
        /* unknown stays: the portal root redirects by session */
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const startOver = useCallback(() => {
    clearDone(done.submissionId);
    reset();
    // A new request starts without the validation messages and the outcome of the last one.
    useFunnelUI.setState({ attempted: [], done: null, returnTo: null, reviewing: false });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [done.submissionId, reset]);

  const steps = [t("conf.step1"), t("conf.step2"), t("conf.step3")];

  return (
    <div className="v3-start v3-confirm">
      <div className="v3-start-wedge" aria-hidden="true" />
      <div className="v3-start-pad">
        <div className="v3-start-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="v3-start-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
          <LanguageSwitch dark />
        </div>

        <div className="v3-start-hero" aria-live="polite">
          <span className="v3-start-rule" aria-hidden="true" />
          <span className="v3-confirm-eyebrow">
            <span aria-hidden="true">✓</span> {t("s6.done")}
          </span>
          <h1 className="v3-start-title" ref={heading} tabIndex={-1}>
            {t("conf.title")}
          </h1>
          <p className="v3-start-lead">{done.caseNumber ? t("conf.lead", { fall: done.caseNumber }) : t("conf.leadNoCase")}</p>
        </div>

        <section className="v3-confirm-next" aria-labelledby="v3-confirm-next">
          <h2 id="v3-confirm-next" className="v3-confirm-next-title">
            {t("conf.next")}
          </h2>
          <ol className="v3-confirm-steps">
            {steps.map((text, i) => (
              <li key={i} className="v3-confirm-step">
                <span className="v3-confirm-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="v3-confirm-text">
                  {text}
                  {i === 2 && missing > 0 ? <span className="v3-tag v3-tone--lime v3-confirm-count">{t("docs.tallyMissing", { n: missing })}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="v3-confirm-actions">
          <a className="v3-btn v3-btn--primary v3-btn--lg" href={storedDossierUrl(done)} download>
            {t("conf.dossier")}
          </a>
          {berater ? (
            // A Berater goes back to the portal: the dashboard when logged in (the new Case
            // appears there), the login otherwise, the portal root while that is unknown.
            <a className="v3-btn v3-btn--outline-dark" href={portalAction(portalSession).href}>
              {t(portalAction(portalSession).labelKey)}
            </a>
          ) : (
            <a className="v3-btn v3-btn--outline-dark" href={HYPOTEQ_URL}>
              {t("conf.home")}
            </a>
          )}
          <button type="button" className="v3-btn v3-btn--text v3f-on-dark" onClick={startOver}>
            {t("s6.newRequest")}
          </button>
        </div>
      </div>
    </div>
  );
}
