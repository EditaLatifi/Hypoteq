"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FileEntry } from "@/lib/funnel-v3/files";

function ts(iso: string, lang: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const loc = `${lang}-CH`;
  return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
}

/** Audit trail per file — internal role only (spec 5); never rendered for customers. */
export default function AuditTrail({ files }: { files: FileEntry[] }) {
  const { t, lang } = useFunnelT();
  const rows = files
    .flatMap((f) => (f.audit ?? []).map((a) => ({ ...a, file: f.name })))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (!rows.length) return null;
  return (
    <div className="v3-audit">
      <span className="v3-eyebrow">{t("s5.audit")}</span>
      {rows.map((a, i) => (
        <div key={i} className="v3-audit-row">
          <span className="v3-audit-ts">{ts(a.ts, lang)}</span>
          <span className="v3-audit-text">
            {files.length > 1 ? `${a.file} · ` : ""}
            {t(a.key, a.params?.kind ? { ...a.params, kind: t(`state.${a.params.kind}`) } : a.params)}
          </span>
        </div>
      ))}
    </div>
  );
}
