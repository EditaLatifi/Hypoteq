"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import CaseRow from "@/components/portal/CaseRow";
import { useT } from "@/components/portal/I18n";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { matchRank } from "@/lib/portal/search";
import { CASE_FILTERS, matchesFilter, parseFilter, type CaseFilter } from "@/lib/portal/status";

type Sort = { by: "date" | "status"; dir: 1 | -1 };

const PILL = "h-11 rounded-full border px-3.5 text-[14px] font-semibold transition-colors duration-200 ease-out min-[900px]:h-8";

/**
 * Case Übersicht. The filter lives in the URL (?filter=…) so the dashboard tiles can link to
 * it and the back button returns to it; switching filters only rewrites the URL, it does not
 * reload the Cases from Salesforce. Sorting by date uses the last change; clicking the same
 * sort again reverses it.
 */
export default function CaseList({ cases, viewerContactId }: { cases: PortalCaseSummary[]; viewerContactId: string | null }) {
  const t = useT();
  const params = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });

  const shown = useMemo(() => {
    const q = query.trim();
    return cases
      .filter((c) => matchesFilter(filter, c.status, c.needDocs.length))
      .filter((c) => !q || matchRank(c, q) !== null)
      .sort((a, b) =>
        sort.by === "date"
          ? sort.dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
          : sort.dir * (a.rank - b.rank) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [cases, filter, query, sort]);

  function choose(f: CaseFilter) {
    const next = new URLSearchParams(params.toString());
    if (f === "Alle") next.delete("filter");
    else next.set("filter", f);
    const qs = next.toString();
    // Next.js keeps useSearchParams in step with history.replaceState (14.1+).
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const toggle = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: (s.dir * -1) as 1 | -1 } : { by, dir: by === "date" ? -1 : 1 }));
  const icon = (by: Sort["by"]) => (sort.by !== by ? <ArrowUpDown size={18} aria-hidden /> : sort.dir === -1 ? <ArrowDown size={18} aria-hidden /> : <ArrowUp size={18} aria-hidden />);

  return (
    <>
      <p className="-mt-6 mb-0 text-[17px] text-white/70" aria-live="polite">
        {t.cases.count(shown.length, cases.length, t.filters[filter])}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.cases.title}>
        {CASE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => choose(f)}
            aria-pressed={filter === f}
            className={`${PILL} ${filter === f ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/20 text-white hover:bg-white/[.08]"}`}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <span className="sr-only">{t.cases.search}</span>
          <Search size={20} aria-hidden className="pointer-events-none absolute left-4 text-white/60" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.cases.search}
            className="h-11 w-full rounded-xl border border-white/[.14] bg-white/[.08] pl-12 pr-4 text-[16px] text-white placeholder:text-white/45 outline-none transition-[border-color] duration-200 ease-out focus:border-[#CAF476]"
          />
        </label>
        <div className="flex gap-1">
          <button type="button" onClick={() => toggle("date")} aria-pressed={sort.by === "date"} className="inline-flex h-11 items-center gap-2 rounded-full px-2 text-[16px] font-semibold hover:text-[#DAF6A2] min-[900px]:h-9">
            {icon("date")} {t.cases.sortDate}
          </button>
          <button type="button" onClick={() => toggle("status")} aria-pressed={sort.by === "status"} className="inline-flex h-11 items-center gap-2 rounded-full px-2 text-[16px] font-semibold hover:text-[#DAF6A2] min-[900px]:h-9">
            {icon("status")} {t.cases.sortStatus}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {shown.map((c) => (
          <CaseRow key={c.id} c={c} meta="docs" viewerContactId={viewerContactId} />
        ))}
        {shown.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.cases.none}</div> : null}
      </div>
    </>
  );
}
