"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import CaseRow from "@/components/portal/CaseRow";
import { useT } from "@/components/portal/I18n";
import type { PortalCaseSummary } from "@/lib/portal/salesforce";
import { CASE_FILTERS, matchesFilter, type CaseFilter } from "@/lib/portal/status";

type Sort = { by: "date" | "status"; dir: 1 | -1 };

export default function CaseList({ cases, initialFilter }: { cases: PortalCaseSummary[]; initialFilter: CaseFilter }) {
  const t = useT();
  const [filter, setFilter] = useState<CaseFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ by: "date", dir: -1 });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases
      .filter((c) => matchesFilter(filter, c.status, c.missingDocs.length))
      .filter((c) => !q || c.kunde.toLowerCase().includes(q) || c.nr.toLowerCase().includes(q))
      .sort((a, b) =>
        sort.by === "date"
          ? sort.dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          : sort.dir * (a.rank - b.rank)
      );
  }, [cases, filter, query, sort]);

  const toggle = (by: Sort["by"]) => setSort((s) => (s.by === by ? { by, dir: (s.dir * -1) as 1 | -1 } : { by, dir: by === "date" ? -1 : 1 }));
  const icon = (by: Sort["by"]) => (sort.by !== by ? <ArrowUpDown size={18} /> : sort.dir === -1 ? <ArrowDown size={18} /> : <ArrowUp size={18} />);

  return (
    <>
      <p className="-mt-6 mb-0 text-[17px] text-white/70">{t.cases.count(shown.length, cases.length, t.filters[filter])}</p>
      <div className="flex flex-wrap gap-2">
        {CASE_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`h-8 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
              filter === f ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/20 text-white hover:bg-white/[.08]"
            }`}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search size={20} className="pointer-events-none absolute left-4 text-white/60" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.cases.search}
            aria-label={t.cases.search}
            className="h-[50px] w-full rounded-xl border border-white/[.14] bg-white/[.08] pl-12 pr-4 text-[17px] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476]"
          />
        </label>
        <div className="flex gap-4">
          <button type="button" onClick={() => toggle("date")} className="inline-flex h-9 items-center gap-2 text-[16px] font-semibold">
            {icon("date")} {t.cases.sortDate}
          </button>
          <button type="button" onClick={() => toggle("status")} className="inline-flex h-9 items-center gap-2 text-[16px] font-semibold">
            {icon("status")} {t.cases.sortStatus}
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {shown.map((c) => (
          <CaseRow key={c.id} c={c} meta="docs" />
        ))}
        {shown.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.cases.none}</div> : null}
      </div>
    </>
  );
}
