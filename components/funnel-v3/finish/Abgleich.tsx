"use client";

/**
 * The Abgleich page before the submit (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 3; texts
 * 10.3 and 10.5 with the German in «du», answers of 26.10.2026). It opens from «Finanzierungs-
 * anfrage abschliessen» only when the documents disagree with the answers — without a
 * difference the request is submitted at once.
 *
 *   one card per difference: «Deine Eingabe im Formular» and «Laut {Dokument}» as two pills, the
 *   funnel's value chosen until the customer picks the other, «Dokument ansehen →», and the
 *   explanation of the Prüfmatrix. Picking the document's value changes the answer; the original
 *   is kept with the choice (store chooseAbgleich, 6.2 customerChoice).
 *   the identity card: «{Name} als 2. Kreditnehmer/in erfassen» or «Richtiges Dokument
 *   hochladen» — the only hard stop; «Angaben bestätigen & absenden» waits for it.
 *   «Bestätigte Angaben»: what matched, field → value with a check.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { AbgleichField } from "@/lib/funnel-v3/abgleich/evaluate";
import { useDocumentsSummary } from "@/lib/funnel-v3/documentsSummary";
import { chf } from "@/lib/funnel-v3/format";
import { getRequirement } from "@/lib/funnel-v3/requirements";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { filesFromInput, replaceFile, screenFiles } from "@/lib/funnel-v3/upload";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { v3DocType } from "@/components/documentIntelligence/v3/catalogue";
import { ACCEPT } from "../documents/DropZone";
import FileDetail from "../documents/FileDetail";
import { editFrom } from "../hooks";
import { useFunnelUI } from "../uiStore";
import { useAbgleich } from "./useAbgleich";
import { useSubmit } from "./useSubmit";
import "./finish.css";

const shown = (v: number | string | null | undefined) => (typeof v === "number" ? chf(v) : String(v ?? ""));

/** «Anna Beispiel» → { vor: "Anna", nach: "Beispiel" }; the ID's own fields when it has them. */
function splitName(printed: string, fields: Record<string, { value: string | number | null }> | undefined) {
  const vor = String(fields?.Vornamen?.value ?? "").trim();
  const nach = String(fields?.Name?.value ?? "").trim();
  if (vor || nach) return { vor, nach };
  const parts = printed.trim().split(/\s+/);
  return { vor: parts.slice(0, -1).join(" "), nach: parts.at(-1) ?? "" };
}

export default function Abgleich() {
  const { t } = useFunnelT();
  const abg = useAbgleich();
  const summary = useDocumentsSummary();
  const choose = useFunnelV3((s) => s.chooseAbgleich);
  const borrowers = useFunnelV3((s) => s.borrowers);
  const kn = useFunnelV3((s) => s.ans.kn);
  const say = useFunnelUI((s) => s.say);
  const [detail, setDetail] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const blocked = abg.blocking.length > 0;
  const { submit, busy, error, progressTitle } = useSubmit(!blocked);

  const identities = abg.conflicts.filter((f) => f.result === "identity_conflict");
  const values = abg.conflicts.filter((f) => f.result !== "identity_conflict");
  const confirmed = abg.fields.filter((f) => f.result === "ok" && !f.customerChoice && f.funnelValue !== null && f.funnelDisplay && f.kind !== "presence");
  const n = identities.length + values.length;
  const byId = useMemo(() => new Map(summary.files.map((f) => [f.id, f])), [summary.files]);

  const label = (f: AbgleichField) => t(f.part ? `abg.label.${f.key}.${f.part}` : `abg.label.${f.key}`) + (f.person && borrowers.length > 1 ? ` · ${f.person}` : "");
  const docLabel = (f: AbgleichField) => {
    const inst = summary.instances.find((i) => i.instanceId === f.against?.instanceId);
    if (inst) return t(inst.labelKey);
    const type = v3DocType(f.against?.typeId);
    return type ? t(getRequirement(type.id)?.labelKey ?? `doc.${type.id}`) : "";
  };
  const firstDoc = (f: AbgleichField) => f.against?.docId.split(",")[0] ?? null;

  const back = () => {
    useFunnelUI.setState({ reviewing: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  // «Angaben bestätigen & absenden»: the funnel's value is the choice where none was made.
  const confirmAndSubmit = useCallback(() => {
    if (blocked) return;
    for (const f of values) if (!f.customerChoice) choose(f, "funnel");
    void submit();
  }, [blocked, choose, submit, values]);

  const addSecond = (f: AbgleichField) => {
    const id = firstDoc(f);
    const { vor, nach } = splitName(f.nameOnDocument ?? "", id ? byId.get(id)?.analysis?.fields : undefined);
    const s = useFunnelV3.getState();
    if (s.borrowers.length < 2) s.addBorrower();
    const second = useFunnelV3.getState().borrowers[1];
    if (second) useFunnelV3.getState().updateBorrower(second.id, { vor, nach });
    useFunnelUI.setState({ reviewing: false });
    editFrom("abschluss", "personen");
  };

  const startReplace = (f: AbgleichField) => {
    replacing.current = firstDoc(f);
    replaceInput.current?.click();
  };
  const onReplacePicked = (list: FileList | null) => {
    const oldId = replacing.current;
    replacing.current = null;
    const [first] = filesFromInput(list);
    if (!oldId || !first) return;
    const { accepted } = screenFiles([first]);
    if (accepted.length && replaceFile(oldId, accepted[0])) say([{ text: "✓ " + t("docs.toast.replaced", { label: t("doc.id") }), big: true }]);
  };

  const detailFile = detail ? byId.get(detail) : undefined;

  return (
    <div className="v3-abg">
      <div className="v3-closing-head">
        <span className="v3-rule" aria-hidden="true" />
        <span className="v3-eyebrow">{t("step.6")}</span>
        <h2 className="v3-h2">{t("abg.title")}</h2>
        {n ? <p className="v3-lead">{n === 1 ? t("abg.lead1") : t("abg.lead", { n })}</p> : null}
      </div>

      {identities.map((f) => (
        <section key={f.id} className="v3-abg-card is-identity" aria-label={label(f)}>
          <div className="v3-abg-card-head">
            <span className="v3-abg-card-title">{t("abg.identityTitle")}</span>
            <span className="v3-tag v3-tone--danger">{t("abg.badgeConflict")}</span>
          </div>
          <p className="v3-abg-text">{t("abg.identity", { nameDok: f.nameOnDocument ?? "", nameAntrag: f.funnelDisplay })}</p>
          <p className="v3-abg-why">{t("abg.hint.identity")}</p>
          <div className="v3-actions">
            {kn !== "Juristische Person" && borrowers.length < 2 ? (
              <button type="button" className="v3-btn v3-btn--dark" onClick={() => addSecond(f)}>
                {t("abg.identityAdd", { nameDok: f.nameOnDocument ?? "" })}
              </button>
            ) : null}
            <button type="button" className="v3-btn v3-btn--outline" onClick={() => startReplace(f)}>
              {t("abg.identityUpload")}
            </button>
            {firstDoc(f) ? (
              <button type="button" className="v3-btn v3-btn--text" onClick={() => setDetail(firstDoc(f))}>
                {t("abg.viewDoc")}
              </button>
            ) : null}
          </div>
        </section>
      ))}

      {values.map((f) => {
        const chosen = f.customerChoice?.chosenSource ?? "funnel";
        const original = f.customerChoice?.original ?? f.funnelValue;
        return (
          <section key={f.id} className="v3-abg-card" aria-label={label(f)}>
            <div className="v3-abg-card-head">
              <span className="v3-abg-card-title">{label(f)}</span>
              <span className="v3-tag v3-tone--warning">{t("abg.badgeConflict")}</span>
            </div>
            <div className="v3-abg-pills" role="radiogroup" aria-label={label(f)}>
              <button type="button" role="radio" aria-checked={chosen === "funnel"} className={`v3-abg-pill${chosen === "funnel" ? " is-selected" : ""}`} onClick={() => choose(f, "funnel")}>
                <span className="v3-abg-pill-label">{t("abg.pillFunnel")}</span>
                <span className="v3-abg-pill-value">{shown(original)}</span>
                <span className="v3-abg-pill-check" aria-hidden="true">
                  ✓
                </span>
              </button>
              <div className="v3-abg-pill-col">
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosen === "document"}
                  className={`v3-abg-pill${chosen === "document" ? " is-selected" : ""}`}
                  onClick={() => choose(f, "document")}
                  disabled={!f.choosable}
                >
                  <span className="v3-abg-pill-label">{t("abg.pillDoc", { dokument: docLabel(f) })}</span>
                  <span className="v3-abg-pill-value">{f.against?.display}</span>
                  <span className="v3-abg-pill-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
                {firstDoc(f) && byId.has(firstDoc(f)!) ? (
                  <button type="button" className="v3-btn v3-btn--text v3-btn--sm v3-abg-view" onClick={() => setDetail(firstDoc(f))}>
                    {t("abg.viewDoc")}
                  </button>
                ) : null}
              </div>
            </div>
            {f.explanationKey ? <p className="v3-abg-why">{t(f.explanationKey)}</p> : null}
          </section>
        );
      })}

      {confirmed.length ? (
        <section className="v3-abg-confirmed" aria-labelledby="v3-abg-confirmed">
          <div className="v3-abg-card-head">
            <span id="v3-abg-confirmed" className="v3-abg-card-title">
              {t("abg.confirmed")}
            </span>
            <span className="v3-tag v3-tone--success">{t("abg.badgeOk")}</span>
          </div>
          {confirmed.map((f) => (
            <div key={f.id} className="v3-abg-row">
              <span className="v3-abg-row-k">{label(f)}</span>
              <span className="v3-abg-row-v">{f.funnelDisplay}</span>
              <span className="v3-abg-row-ok" aria-hidden="true">
                ✓
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {busy ? (
        <div className="v3-busy" role="status" aria-live="polite">
          <div className="v3-busy-head">
            <span className="v3-busy-title">{progressTitle}</span>
            <span className="v3-busy-sub">{t("s6.progress.note")}</span>
          </div>
          <div className="v3-busy-track">
            <span className="v3-busy-bar" />
          </div>
        </div>
      ) : null}
      {error && !busy ? (
        <div className="v3-note v3f-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="v3-abg-actions">
        <button type="button" className="v3-btn v3-btn--outline v3-btn--back" onClick={back} disabled={busy}>
          {t("common.back")}
        </button>
        <button type="button" className="v3-btn v3-btn--dark v3-btn--lg" onClick={confirmAndSubmit} disabled={busy || blocked} aria-describedby={blocked ? "v3-abg-blocked" : undefined}>
          {t("abg.submit")}
        </button>
      </div>
      {blocked ? (
        <p id="v3-abg-blocked" className="v3f-blocked">
          {t("abg.blocked")}
        </p>
      ) : null}

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
      {detailFile ? <FileDetail key={detailFile.id} file={detailFile} title={detailFile.name} intern={false} onClose={() => setDetail(null)} onConfirmed={() => {}} /> : null}
    </div>
  );
}
