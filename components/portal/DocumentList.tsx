"use client";

import Link from "next/link";
import { useState } from "react";
import { FileCheck, FileClock, FileText } from "lucide-react";
import UploadButton from "@/components/portal/UploadButton";
import { useT } from "@/components/portal/I18n";
import { Badge } from "@/components/portal/ui";
import { DOC_TONES, needsDocument, type DocStatus } from "@/lib/portal/status";

export type DocRow = {
  id: string;
  caseId: string;
  caseNr: string;
  kunde: string;
  name: string;
  status: DocStatus;
  docKey: string | null;
  /** «Kunde · Case-Nr · Kategorie» for the upload dialog. */
  context: string;
  meta: string | null;
};

type Filter = "all" | "missing" | "neu" | "review" | "vorhanden";

// The prototype's document filters: Fehlt takes Ungültig along, In Prüfung takes Hochgeladen.
const FILTERS: Record<Filter, DocStatus[] | null> = {
  all: null,
  missing: ["fehlt", "ungueltig"],
  neu: ["neu"],
  review: ["pruefung", "hochgeladen"],
  vorhanden: ["vorhanden"],
};

export default function DocumentList({ rows, readOnly }: { rows: DocRow[]; readOnly: boolean }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => !FILTERS[filter] || FILTERS[filter]!.includes(r.status));
  const labels: [Filter, string][] = [
    ["all", t.documentsPage.filterAll],
    ["missing", t.docStatus.fehlt],
    ["neu", t.docStatus.neu],
    ["review", t.docStatus.pruefung],
    ["vorhanden", t.docStatus.vorhanden],
  ];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {labels.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={`h-11 rounded-full border px-3.5 text-[14px] font-semibold transition-colors duration-200 ease-out min-[900px]:h-8 ${
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
              {r.status === "vorhanden" ? (
                <FileCheck size={20} aria-hidden className="flex-none text-[#CAF476]" />
              ) : r.status === "pruefung" || r.status === "hochgeladen" ? (
                <FileClock size={20} aria-hidden className="flex-none text-[#CAF476]" />
              ) : (
                <FileText size={20} aria-hidden className="flex-none text-[#CAF476]" />
              )}
              <div className="min-w-0">
                <div className="text-[15px] font-medium">{r.name}</div>
                {r.meta ? <div className="truncate text-[13px] text-white/70">{r.meta}</div> : null}
              </div>
            </div>
            <Link href={`/portal/cases/${r.caseId}`} className="min-w-0 rounded hover:text-[#DAF6A2]">
              <div className="truncate text-[15px]">{r.kunde}</div>
              <div className="text-[13px] text-white/70">{r.caseNr}</div>
            </Link>
            <div>
              <Badge tone={DOC_TONES[r.status]}>{t.docStatus[r.status]}</Badge>
            </div>
            <div className="flex justify-end">
              {needsDocument(r.status) && !readOnly ? <UploadButton caseId={r.caseId} docKey={r.docKey} label={r.name} context={r.context} /> : null}
            </div>
          </div>
        ))}
        {shown.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.documentsPage.none}</div> : null}
      </div>
    </>
  );
}
