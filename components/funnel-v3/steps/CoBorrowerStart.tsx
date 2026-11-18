"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { MAX_BORROWERS } from "@/lib/funnel-v3/types";
import { useFunnelState } from "../hooks";
import { TextField } from "../ui/Fields";

/**
 * «Finanzierst du allein oder zu zweit?» in the Schnellanmeldung's first step (HYPOTEQ Komplett-Test
 * 18.11.2026, DECISIONS V121): the second Kreditnehmer is known before the upload, so their ID,
 * Lohnausweis and Steuererklärung go to their own rows from the start instead of «nicht benötigt»
 * or «überzählig». «Zu zweit» adds Kreditnehmer 2 — the same person as «+ Kreditnehmer hinzufügen»
 * in «Personen», where the name and income can still be completed or the person removed.
 */
export default function CoBorrowerStart() {
  const { t } = useFunnelT();
  const state = useFunnelState();
  const addBorrower = useFunnelV3((s) => s.addBorrower);
  const removeBorrower = useFunnelV3((s) => s.removeBorrower);
  const updateBorrower = useFunnelV3((s) => s.updateBorrower);
  const { ans, borrowers, role } = state;
  if (ans.kn === "Juristische Person") return null;

  const own = role === "kunde";
  const second = borrowers[1];
  const together = Boolean(second);
  const pick = (two: boolean) => {
    if (two && !second && borrowers.length < MAX_BORROWERS) {
      // Kreditnehmer 1 is the contact; the list always holds them first.
      if (!borrowers.length) addBorrower();
      addBorrower();
    } else if (!two && second) removeBorrower(second.id);
  };

  return (
    <div className="v3-section" data-q="coBorrower">
      <div className="v3-q">
        <span className="v3-q-head">
          <span id="v3-coborrower-label" className="v3-q-label">
            {t(own ? "s1.coBorrowerOwn" : "s1.coBorrowerClient")}
          </span>
        </span>
        <div role="radiogroup" aria-labelledby="v3-coborrower-label" className="v3-opts">
          {[false, true].map((two) => (
            <button
              key={String(two)}
              type="button"
              role="radio"
              aria-checked={together === two}
              className="v3-chip"
              onClick={() => pick(two)}
            >
              <span>{t(two ? "s1.coBorrowerTwo" : "s1.coBorrowerOne")}</span>
            </button>
          ))}
        </div>
        <span className="v3-note">{t("s1.coBorrowerNote")}</span>
      </div>
      {second ? (
        <div className="v3-two v3-rise">
          <TextField
            field="borrower.1.vor"
            autoComplete="off"
            label={t("s1.coBorrowerFirst")}
            placeholder={t("s3.firstNames")}
            value={second.vor}
            onChange={(v) => updateBorrower(second.id, { vor: v })}
          />
          <TextField
            field="borrower.1.nach"
            autoComplete="off"
            label={t("s1.coBorrowerLast")}
            placeholder={t("s1.lastName")}
            value={second.nach}
            onChange={(v) => updateBorrower(second.id, { nach: v })}
          />
        </div>
      ) : null}
    </div>
  );
}
