"use client";

import Link from "next/link";
import { useState } from "react";
import { FileCheck, FileText } from "lucide-react";
import UploadButton from "@/components/portal/UploadButton";
import { useT } from "@/components/portal/I18n";
import { Badge } from "@/components/portal/ui";

export type DocRow = {
  id: string;
  caseId: string;
  caseNr: string;
  kunde: string;
  name: string;
  state: "fehlt" | "offen" | "hochgeladen" | "vorhanden";
  docKey: string | null;
  meta: string | null;
};

type Filter = "all" | "fehlt" | "offen" | "hochgeladen" | "vorhanden";

export default function DocumentList({ rows, readOnly }: { rows: DocRow[]; readOnly: boolean }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => filter === "all" || r.state === filter);
  const filters: [Filter, string][] = [
    ["all", t.documentsPage.filterAll],
    ["fehlt", t.documentsPage.filterMissing],
    ["offen", t.documentsPage.filterOpen],
    ["hochgeladen", t.documentsPage.filterUploaded],
    ["vorhanden", t.documentsPage.filterPresent],
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {filters.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`h-8 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
              filter === k ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/20 text-white hover:bg-white/[.08]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {shown.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-1 items-center gap-x-5 gap-y-3 border-b border-white/[.14] py-3.5 last:border-b-0 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_auto_auto]"
          >
            <div className="flex min-w-0 items-center gap-3">
              {r.state === "fehlt" || r.state === "offen" ? <FileText size={20} className="flex-none text-[#CAF476]" /> : <FileCheck size={20} className="flex-none text-[#CAF476]" />}
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{r.name}</div>
                {r.meta ? <div className="truncate text-[13px] text-white/70">{r.meta}</div> : null}
              </div>
            </div>
            <Link href={`/portal/cases/${r.caseId}`} className="min-w-0 hover:text-[#DAF6A2]">
              <div className="truncate text-[15px]">{r.kunde}</div>
              <div className="text-[13px] text-white/70">{r.caseNr}</div>
            </Link>
            <div>
              {r.state === "fehlt" ? (
                <Badge tone="danger">{t.caseDetail.missing}</Badge>
              ) : r.state === "offen" ? (
                <Badge tone="warning">{t.caseDetail.open}</Badge>
              ) : r.state === "hochgeladen" ? (
                <Badge tone="accent">{t.caseDetail.uploaded}</Badge>
              ) : (
                <Badge tone="success">{t.caseDetail.present}</Badge>
              )}
            </div>
            <div className="flex justify-end">
              {(r.state === "fehlt" || r.state === "offen") && !readOnly ? <UploadButton caseId={r.caseId} docKey={r.docKey} label={r.name} /> : null}
            </div>
          </div>
        ))}
        {shown.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.documentsPage.none}</div> : null}
      </div>
    </>
  );
}
