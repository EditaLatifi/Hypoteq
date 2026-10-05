"use client";

import { useState } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { StepErrors } from "@/lib/funnel-v3/validate";
import { useFunnelState } from "./hooks";
import { isLookupEmail } from "./logic";
import { usePartnerLookup } from "./partner";
import { TextField } from "./ui/Fields";

/**
 * Berater entry, step 1 (spec 2.2): only the e-mail. A recognised partner gets the «Erkannt»
 * card; an address we do not know gets «Noch kein Partner?» with the short form. The lookup
 * itself runs at the funnel root (partner.ts) and never blocks «Weiter».
 */
export default function PartnerBlock({ errors }: { errors: StepErrors }) {
  const { t } = useFunnelT();
  const { txt } = useFunnelState();
  const setTxt = useFunnelV3((s) => s.setTxt);
  const lookup = usePartnerLookup();
  const [formOpen, setFormOpen] = useState(() => Boolean(txt.pvor || txt.pnach || txt.ptel || txt.pfirma));

  const current = lookup.email === txt.bmail.trim().toLowerCase();
  const checking = current && lookup.loading && isLookupEmail(txt.bmail);
  const result = current && !lookup.loading ? lookup.result : null;
  const known = result && result.status !== "unknown" && result.name ? result : null;
  // Once the form is open it stays while the address in it is being edited (and is briefly
  // invalid or being looked up again) — only a recognised partner replaces it.
  const unknown = Boolean((result && !known && isLookupEmail(txt.bmail)) || (formOpen && !known));
  // Salesforce could not be asked (outage, rate limit): the address may well be a partner's,
  // so the box must not claim «kennen wir noch nicht». The sync looks the address up again
  // at submit (components/syncFunnelStepsToSalesforce applyPartnerToCase).
  const degraded = Boolean(result?.degraded) && !formOpen;

  return (
    <div className="v3-section">
      <span className="v3-eyebrow">{t("s1.advisor")}</span>
      <div className="v3-two">
        <TextField
          field="bmail"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={t("s1.advisorEmail")}
          placeholder={t("s1.advisorEmailPh")}
          hint={t("s1.advisorEmailHint")}
          value={txt.bmail}
          onChange={(v) => setTxt("bmail", v)}
          error={errors.bmail}
        />
      </div>

      <div aria-live="polite">
        {checking ? <span className="v3-note v3-note--tight">{t("s1.checking")}</span> : null}
        {known ? (
          <div className="v3-partner">
            <span className="v3-initials" aria-hidden="true">
              {known.initials}
            </span>
            <span className="v3-partner-text">
              <span className="v3-partner-name">{known.name}</span>
              <span className="v3-partner-firm">{[known.company, txt.bmail.trim()].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="v3-badge">{t("s1.recognised")}</span>
          </div>
        ) : null}

        {unknown ? (
          <div className="v3-newpartner">
            <div className="v3-newpartner-top">
              <span className="v3-newpartner-copy">
                <span className="v3-newpartner-title">{t(degraded ? "s1.lookupFailed.title" : "s1.noPartner.title")}</span>
                <span className="v3-newpartner-text">{t(degraded ? "s1.lookupFailed.text" : "s1.noPartner.text")}</span>
              </span>
              {!formOpen ? (
                <button type="button" className="v3-btn v3-btn--dark" onClick={() => setFormOpen(true)}>
                  {t("s1.noPartner.cta")}
                </button>
              ) : null}
            </div>
            {formOpen ? (
              <div className="v3-newpartner-form">
                <div className="v3-two">
                  <TextField
                    field="pvor"
                    autoComplete="given-name"
                    label={t("s1.firstName")}
                    placeholder={t("s1.firstName")}
                    value={txt.pvor}
                    onChange={(v) => setTxt("pvor", v)}
                  />
                  <TextField
                    field="pnach"
                    autoComplete="family-name"
                    label={t("s1.lastName")}
                    placeholder={t("s1.lastName")}
                    value={txt.pnach}
                    onChange={(v) => setTxt("pnach", v)}
                  />
                  <TextField
                    field="bmail-form"
                    type="email"
                    autoComplete="email"
                    label={t("s1.email")}
                    value={txt.bmail}
                    onChange={(v) => setTxt("bmail", v)}
                  />
                  <TextField
                    field="ptel"
                    type="tel"
                    autoComplete="tel"
                    label={t("s1.phoneCallback")}
                    placeholder={t("s1.phonePh")}
                    value={txt.ptel}
                    onChange={(v) => setTxt("ptel", v)}
                  />
                  <TextField
                    field="pfirma"
                    autoComplete="organization"
                    label={t("s1.company")}
                    placeholder={t("s1.companyPh")}
                    value={txt.pfirma}
                    onChange={(v) => setTxt("pfirma", v)}
                  />
                </div>
                <span className="v3-note">{t("s1.noPartner.note")}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
