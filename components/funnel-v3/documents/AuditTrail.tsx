"use client";

import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FileEntry } from "@/lib/funnel-v3/files";
import { dateTime } from "@/lib/funnel-v3/format";

/** `TT.MM.JJJJ HH:MM` in every language (spec 7); an unreadable timestamp is shown as is. */
function ts(iso: string): string {
  return dateTime(iso) || iso;
}

/** Audit trail per file — internal role only (spec 5); never rendered for customers. */
export default function AuditTrail({ files }: { files: FileEntry[] }) {
  const { t } = useFunnelT();
  const rows = files
    .flatMap((f) => (f.audit ?? []).map((a) => ({ ...a, file: f.name })))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (!rows.length) return null;
  return (
    <div className="v3-audit">
      <span className="v3-eyebrow">{t("s5.audit")}</span>
      {rows.map((a, i) => (
        <div key={i} className="v3-audit-row">
          <span className="v3-audit-ts">{ts(a.ts)}</span>
          <span className="v3-audit-text">
            {files.length > 1 ? `${a.file} · ` : ""}
            {t(a.key, a.params?.kind ? { ...a.params, kind: t(`state.${a.params.kind}`) } : a.params)}
          </span>
        </div>
      ))}
    </div>
  );
}
