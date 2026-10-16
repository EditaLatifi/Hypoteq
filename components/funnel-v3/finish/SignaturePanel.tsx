"use client";

/**
 * The Auskunftsermächtigung card (Handover 6; prototype «sigCard»): state header, the copies on
 * P0, the three steps side by side — 1 «Vorlage herunterladen», 2 «Unterzeichnen», 3
 * «Unterzeichnet hochladen» with its own button —, the prefill, and «Kunde unterschreibt
 * später?». Presentational: the closing step (SignatureBlock) and the Nachreich page
 * (NachreichSignature) pass the model and the actions.
 *
 * Styled with the funnel's classes (v3-btn, v3-tag, v3-eyebrow) and inline layout like the
 * prototype, so it needs no stylesheet of its own: the steps sit side by side on a desktop and
 * stack on a phone (auto-fit grid).
 */

import { useRef, useState, type CSSProperties } from "react";
import type { SignatureModel } from "./signatureModel";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";

type T = (key: string, params?: Record<string, string | number>) => string;

export interface SignaturePanelProps {
  model: SignatureModel;
  t: T;
  onDownload: () => Promise<void>;
  onPick: (file: File) => void;
  onRemove?: (fileId: string) => void;
  onRetry?: (fileId: string) => void;
  onToggleLater?: () => void;
  /** Heading level text; defaults to «HYPOTEQ Auskunftsermächtigung · Pflicht». */
  eyebrow?: string;
}

const S: Record<string, CSSProperties> = {
  card: { borderRadius: "var(--radius-lg, 16px)", background: "#fff", padding: 22, display: "flex", flexDirection: "column", gap: 16 },
  head: { display: "flex", alignItems: "flex-start", gap: 14 },
  glyph: { width: 30, height: 30, flex: "0 0 auto", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 },
  headText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
  title: { fontSize: "var(--text-body, 17px)", fontWeight: 600, color: "var(--forest-800, #132219)" },
  line: { fontSize: "var(--text-caption, 13px)", color: "var(--on-light-70, rgba(19,34,25,.7))", textWrap: "pretty" as CSSProperties["textWrap"] },
  files: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  fileRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--paper-100, #f6f8f4)", borderRadius: "var(--radius-md, 12px)", padding: "8px 12px" },
  fileName: { flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere", fontSize: "var(--text-body-sm, 15px)", color: "var(--forest-800, #132219)" },
  // min(…, 100%): one column on a phone instead of a grid wider than the card.
  steps: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12 },
  step: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0, background: "var(--paper-100, #f6f8f4)", borderRadius: "var(--radius-md, 12px)", padding: "14px 16px" },
  stepText: { fontSize: "var(--text-body-sm, 15px)", color: "var(--forest-800, #132219)", textWrap: "pretty" as CSSProperties["textWrap"] },
  // The buttons wrap inside a narrow step (v3-btn is nowrap).
  stepBtn: { alignSelf: "flex-start", maxWidth: "100%", whiteSpace: "normal", textAlign: "center" },
  prefill: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))", background: "#fff", border: "1px solid var(--paper-300, #e1e7dc)", borderRadius: "var(--radius-md, 12px)", overflow: "hidden", margin: 0 },
  prefillCell: { background: "#fff", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2, margin: 0, minWidth: 0 },
  pendingTag: { alignSelf: "flex-start", marginTop: 4, whiteSpace: "normal", maxWidth: "100%" },
  prefillKey: { fontSize: "var(--text-caption, 13px)", color: "var(--on-light-70, rgba(19,34,25,.7))", margin: 0 },
  prefillValue: { fontSize: "var(--text-body-sm, 15px)", fontWeight: 600, color: "var(--forest-800, #132219)", margin: 0, overflowWrap: "anywhere" },
  later: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--paper-200, #edf1e9)", paddingTop: 14 },
  linkBtn: { background: "transparent", border: 0, padding: 0, fontFamily: "inherit", fontSize: "var(--text-caption, 13px)", fontWeight: 600, color: "var(--forest-800, #132219)", textDecoration: "underline", cursor: "pointer" },
  error: { margin: 0, fontSize: "var(--text-caption, 13px)", color: "var(--danger-500, #b42318)" },
};

const TONE = {
  ok: { border: "var(--paper-300, #e1e7dc)", bg: "var(--success-100, #e4f3e8)", fg: "var(--success-500, #2f8f52)", glyph: "✓" },
  warn: { border: "var(--warning-500, #c98a16)", bg: "var(--warning-100, #fbf1dc)", fg: "var(--warning-500, #c98a16)", glyph: "!" },
  busy: { border: "var(--paper-300, #e1e7dc)", bg: "var(--paper-200, #edf1e9)", fg: "var(--on-light-70, rgba(19,34,25,.7))", glyph: "…" },
} as const;

const ROW_TAG: Record<SignatureModel["files"][number]["state"], { key: string; tone: string }> = {
  ok: { key: "s6.badge.ok", tone: "success" },
  problem: { key: "s6.badge.open", tone: "warning" },
  busy: { key: "s5.reading", tone: "neutral" },
  failed: { key: "docs.failedBadge", tone: "danger" },
};

export default function SignaturePanel({ model, t, onDownload, onPick, onRemove, onRetry, onToggleLater, eyebrow }: SignaturePanelProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const tone = TONE[model.tone];

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onDownload();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="v3-sig" style={{ ...S.card, border: `1px solid ${model.canFinish ? TONE.ok.border : tone.border}` }} aria-label={t("sig.title")} data-status={model.status}>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      <div style={S.head}>
        <span style={{ ...S.glyph, background: tone.bg, color: tone.fg }} aria-hidden="true">
          {tone.glyph}
        </span>
        <span style={S.headText}>
          <span className="v3-eyebrow">{eyebrow ?? t("sig.title")}</span>
          <span style={S.title} role="status" aria-live="polite">
            {model.title}
          </span>
          {model.lines.map((l, i) => (
            <span key={i} style={S.line}>
              {l}
            </span>
          ))}
          {model.pendingTag ? (
            <span className="v3-tag v3-tone--warning" style={S.pendingTag}>
              {model.pendingTag}
            </span>
          ) : null}
        </span>
      </div>

      {model.files.length ? (
        <ul style={S.files}>
          {model.files.map((f) => (
            <li key={f.id} style={S.fileRow}>
              <span style={S.fileName}>{f.name}</span>
              <span className={`v3-tag v3-tone--${ROW_TAG[f.state].tone}`}>{t(ROW_TAG[f.state].key)}</span>
              {f.state === "failed" && onRetry ? (
                <button type="button" className="v3-btn v3-btn--sm" onClick={() => onRetry(f.id)}>
                  {t("docs.retry")}
                </button>
              ) : null}
              {onRemove && f.state !== "busy" ? (
                <button type="button" className="v3-btn v3-btn--text" onClick={() => onRemove(f.id)}>
                  {t("docs.remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {model.showSteps ? (
        <>
          <div style={S.steps}>
            <div style={S.step}>
              <span className="v3-eyebrow">{t("sig.step1")}</span>
              <span style={S.stepText}>{t("sig.step1Sub")}</span>
              <button type="button" className="v3-btn" style={S.stepBtn} onClick={download} disabled={busy} aria-busy={busy}>
                {busy ? t("sig.downloading") : t("sig.downloadBtn")}
              </button>
              {error ? (
                <p style={S.error} role="alert">
                  {t("sig.downloadError")}
                </p>
              ) : null}
            </div>
            <div style={S.step}>
              <span className="v3-eyebrow">{t("sig.step2")}</span>
              <span style={S.stepText}>{model.signerLine}</span>
            </div>
            <div style={S.step}>
              <span className="v3-eyebrow">{t("sig.step3")}</span>
              <span style={S.stepText}>{t("sig.step3Sub")}</span>
              <button type="button" className="v3-btn v3-btn--primary" style={S.stepBtn} onClick={() => input.current?.click()}>
                {model.files.length ? t("sig.replace") : t("sig.uploadSigned")}
              </button>
            </div>
          </div>
          {model.preview.length ? (
            <dl style={S.prefill} aria-label={t("sig.prefillTitle")}>
              {model.preview.map((p) => (
                <div key={p.label} style={S.prefillCell}>
                  <dt style={S.prefillKey}>{p.label}</dt>
                  <dd style={S.prefillValue}>{p.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}

      {model.later && onToggleLater ? (
        <div style={S.later}>
          <span style={S.line}>{model.later.question}</span>
          <button type="button" style={S.linkBtn} onClick={onToggleLater} aria-pressed={model.later.chosen}>
            {model.later.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}
