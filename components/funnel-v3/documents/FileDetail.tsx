"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { hasLocalFile, saveEdits, viewUrl } from "@/lib/funnel-v3/upload";
import { chip, extOf, fileFields } from "./view";
import AuditTrail from "./AuditTrail";

interface Props {
  file: FileEntry;
  title: string;
  intern: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

/**
 * Document detail (spec 4.2 «Erkannt → Details», 5): the document beside its recognised values,
 * editable. Corrections are kept as humanEdits next to the AI's reading, never over it.
 */
export default function FileDetail({ file, title, intern, onClose, onConfirmed }: Props) {
  const { t } = useFunnelT();
  const fields = useMemo(() => fileFields(file), [file]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const closeRef = useRef<HTMLButtonElement>(null);
  const url = viewUrl(file.id);
  const local = hasLocalFile(file.id);
  const ext = extOf(file.name).toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = [file.relativePath || file.name, file.analysis?.docDate].filter(Boolean).join(" · ");

  return (
    <div className="v3-modal-backdrop" onClick={onClose}>
      <div
        className="v3-modal v3-rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`v3-detail-${file.id}`}
        data-hq-theme="light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="v3-modal-head">
          <div className="v3-modal-titles">
            <span className="v3-eyebrow">{t("docs.detail")}</span>
            <span className="v3-modal-title" id={`v3-detail-${file.id}`}>
              {title}
            </span>
            <span className="v3-modal-meta">{meta}</span>
          </div>
          <button ref={closeRef} type="button" className="v3-modal-close" aria-label={t("s5.close")} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="v3-modal-body">
          <div className="v3-preview">
            {url && local && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="v3-preview-img" src={url} alt={title} />
            ) : url && local && ext === "pdf" ? (
              <iframe className="v3-preview-frame" src={url} title={title} />
            ) : (
              <div className="v3-preview-empty">
                <span>{t("docs.noPreview")}</span>
                {url ? (
                  <a className="v3-btn v3-btn--ghost v3-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
                    {t("docs.openOriginal")}
                  </a>
                ) : null}
              </div>
            )}
            {url && local ? (
              <a className="v3-btn v3-btn--text v3-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
                {t("docs.openOriginal")}
              </a>
            ) : null}
          </div>
          <div className="v3-modal-fields">
            <span className="v3-eyebrow">{t("docs.editable")}</span>
            {fields.length ? (
              fields.map((f) => {
                const edited = values[f.key] !== f.value || f.edited;
                const c = chip(f.confidence, intern, t, edited && values[f.key] !== "");
                return (
                  <label key={f.key} className="v3-modal-field">
                    <span className="v3-modal-field-head">
                      <span>{f.key}</span>
                      <span className={`v3-tag v3-tone--${c.tone}`}>{c.label}</span>
                    </span>
                    <input
                      className="v3-input"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </label>
                );
              })
            ) : (
              <span className="v3-note">{t("docs.noFields")}</span>
            )}
            {intern ? <AuditTrail files={[file]} /> : null}
            <div className="v3-actions">
              {fields.length ? (
                <button
                  type="button"
                  className="v3-btn v3-btn--primary"
                  onClick={() => {
                    saveEdits(file.id, values, true);
                    onConfirmed();
                    onClose();
                  }}
                >
                  {t("docs.confirm")}
                </button>
              ) : null}
              <button type="button" className="v3-btn v3-btn--outline" onClick={onClose}>
                {t("s5.close")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
