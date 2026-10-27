"use client";

import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { ampel, fieldLabel, valueText } from "@/lib/funnel-v3/hypo/engine";
import type { RecognisedItem } from "@/lib/funnel-v3/hypo/session";
import { fieldLabel as abgleichLabel } from "@/lib/funnel-v3/abgleich/state";
import { ampelOf } from "@/lib/funnel-v3/abgleich/rules";
import type { AbgleichField } from "@/lib/funnel-v3/abgleich/evaluate";
import { getRequirement } from "@/lib/funnel-v3/requirements";
import { handOver } from "./controller";

/** The Ampel dot (Spezifikation Datenabgleich 4.2: green ≥ 0.90, yellow ≥ 0.60, red below). */
export function Dot({ confidence }: { confidence: number }) {
  return <span className={`v3-hypo-dot v3-hypo-dot--${ampel(confidence)}`} aria-hidden="true" />;
}

/** Kap. 5.2 «Aus deiner Nachricht erkannt»: every value with its Ampel; yellow / red are asked back. */
export function RecognisedCard({ items, notes }: { items: RecognisedItem[]; notes?: string[] }) {
  const { t, lang } = useFunnelT();
  return (
    <div className="v3-hypo-card">
      <span className="v3-hypo-card-title">{t("hypo.card.recognised")}</span>
      {items.length ? (
        <ul className="v3-hypo-list">
          {items.map((i) => (
            <li key={i.key} className="v3-hypo-row">
              <Dot confidence={i.confidence} />
              <span className="v3-hypo-row-label">{fieldLabel(i.key, lang)}</span>
              <span className="v3-hypo-row-value">{valueText(i.key, i.value, lang)}</span>
              {ampel(i.confidence) !== "green" ? <span className="v3-hypo-row-check">{t("hypo.card.check")}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {notes?.length ? (
        <div className="v3-hypo-notes">
          <span className="v3-hypo-notes-title">{t("hypo.card.notes")}</span>
          <span>{notes.join(" · ")}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Kap. 7: «‹Dokument› ausgelesen», live from the file as the pipeline reads it. */
export function DocumentCard({ fileId }: { fileId: string }) {
  const { t } = useFunnelT();
  const file = useFunnelV3((s) => s.files.find((f) => f.id === fileId));
  if (!file) return null;
  const reading = file.uploadState === "uploading" || file.analysisState === "pending" || file.analysisState === "analysing";
  if (reading) {
    return (
      <div className="v3-hypo-card v3-hypo-card--doc">
        <span className="v3-hypo-card-title v3-hypo-reading">{t("hypo.card.reading", { name: file.name })}</span>
      </div>
    );
  }
  const a = file.analysis;
  if (file.uploadState === "failed" || file.analysisState === "failed" || !a || a.status === "failed") {
    return <div className="v3-hypo-card v3-hypo-card--doc">{t("hypo.card.failed", { name: file.name })}</div>;
  }
  if (!a.docTypeId) return <div className="v3-hypo-card v3-hypo-card--doc">{t("hypo.card.unknown", { name: file.name })}</div>;
  const req = getRequirement(a.docTypeId);
  const docName = req ? t(req.labelKey) : a.docTypeLabel ?? file.name;
  const fields = Object.entries(a.fields ?? {}).filter(([, f]) => f.value !== null && f.value !== "");
  return (
    <div className="v3-hypo-card v3-hypo-card--doc">
      <span className="v3-hypo-card-title">
        <Dot confidence={a.confidence} /> {t("hypo.card.read", { doc: docName })}
      </span>
      {fields.length ? (
        <ul className="v3-hypo-list">
          {fields.slice(0, 8).map(([k, f]) => (
            <li key={k} className="v3-hypo-row">
              <Dot confidence={f.confidence} />
              <span className="v3-hypo-row-label">{k}</span>
              <span className="v3-hypo-row-value">{String(f.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="v3-hypo-muted">{t("hypo.card.readNothing")}</span>
      )}
    </div>
  );
}

/**
 * Kap. 7 «Konflikt Chat-Angabe vs. Dokument»: both values, the customer picks — the same choice as
 * on the Abgleich page (store chooseAbgleich, Spezifikation Datenabgleich 3, 6.2 customerChoice).
 */
export function ConflictCard({ field }: { field: AbgleichField | undefined }) {
  const { t, lang } = useFunnelT();
  const choice = useFunnelV3((s) => (field ? s.choices[field.id] : undefined));
  const choose = useFunnelV3((s) => s.chooseAbgleich);
  if (!field || !field.against) return null;
  const label = abgleichLabel(field)[lang];
  const against = field.against;
  return (
    <div className="v3-hypo-card v3-hypo-card--conflict">
      <span className="v3-hypo-card-title">
        <span className={`v3-hypo-dot v3-hypo-dot--${ampelOf(against.confidence)}`} aria-hidden="true" /> {t("hypo.card.conflict")}
      </span>
      <span>{t("hypo.card.conflictText", { field: label, funnel: field.funnelDisplay, doc: against.display })}</span>
      {choice ? (
        <span className="v3-hypo-muted">{choice.chosenSource === "funnel" ? t("hypo.card.keptMine") : t("hypo.card.tookTheirs", { value: against.display })}</span>
      ) : (
        <div className="v3-hypo-actions">
          <button type="button" className="v3-hypo-chip" onClick={() => choose(field, "funnel")}>
            {t("hypo.card.mine")}
          </button>
          {field.choosable ? (
            <button type="button" className="v3-hypo-chip" onClick={() => choose(field, "document")}>
              {t("hypo.card.theirs")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Kap. 8.1: «bereit zum Senden», then on to the funnel's own summary page. */
export function SummaryCard() {
  const { t } = useFunnelT();
  const files = useFunnelV3((s) => s.files.filter((f) => f.uploadState !== "failed").length);
  const name = useFunnelV3((s) => (s.ans.kn === "Juristische Person" ? s.txt.firma : [s.txt.vor, s.txt.nach].filter(Boolean).join(" ")).trim());
  const place = useFunnelV3((s) => [s.txt.plz, s.txt.ort].filter(Boolean).join(" ").trim());
  return (
    <div className="v3-hypo-card v3-hypo-card--summary">
      <span className="v3-hypo-card-title">{t("hypo.card.summary")}</span>
      <span className="v3-hypo-summary-line">{[name, place].filter(Boolean).join(" · ")}</span>
      {files ? <span className="v3-hypo-muted">{t("hypo.card.summaryDocs", { n: files })}</span> : null}
      <button type="button" className="v3-btn v3-btn--dark v3-hypo-summary-cta" onClick={handOver}>
        {t("hypo.card.summaryCta")} →
      </button>
    </div>
  );
}

export function LinkCard({ textKey, url }: { textKey: string; url: string }) {
  const { t } = useFunnelT();
  return (
    <span>
      {t(textKey)}{" "}
      <a className="v3-hypo-link" href={url} target="_blank" rel="noopener noreferrer">
        {t("hypo.card.academy")} ↗
      </a>
    </span>
  );
}
