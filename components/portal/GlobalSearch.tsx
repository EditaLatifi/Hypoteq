"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useT } from "@/components/portal/I18n";
import { Badge, formatChf } from "@/components/portal/ui";
import { HEADER_SEARCH_MAX, searchCases } from "@/lib/portal/search";
import type { Tone } from "@/lib/portal/status";

export type SearchEntry = { id: string; kunde: string; nr: string; art: string; betrag: number | null; status: string; tone: Tone };

/**
 * «Antragsteller suchen» in the header: the partner's own Cases, filtered in the browser
 * (lib/portal/search.ts), at most six hits with their status. A combobox in the ARIA sense:
 * arrow keys move through the hits, Enter opens the chosen one (the first by default), Esc
 * closes the list and then clears the field.
 */
export default function GlobalSearch({ items, className = "" }: { items: SearchEntry[]; className?: string }) {
  const t = useT();
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo(() => searchCases(items, query, HEADER_SEARCH_MAX), [items, query]);
  const showList = open && query.trim().length > 0;

  function go(hit: SearchEntry | undefined) {
    if (!hit) return;
    setQuery("");
    setOpen(false);
    input.current?.blur();
    router.push(`/portal/cases/${hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!hits.length) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % hits.length : (a - 1 + hits.length) % hits.length));
    } else if (e.key === "Enter") {
      if (!showList) return;
      e.preventDefault();
      go(hits[active] || hits[0]);
    } else if (e.key === "Escape") {
      if (showList) setOpen(false);
      else setQuery("");
    }
  }

  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  return (
    <div className={`relative min-w-0 ${className}`}>
      <label className="relative flex items-center">
        <span className="sr-only">{t.shell.search.label}</span>
        <Search size={20} aria-hidden className="pointer-events-none absolute left-4 text-white/60" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits.length ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={t.shell.search.placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-xl border border-white/[.14] bg-white/[.08] pl-12 pr-4 text-[16px] text-white placeholder:text-white/45 outline-none transition-[border-color,box-shadow] duration-200 ease-out focus:border-[#CAF476]"
        />
      </label>
      <div
        className={`absolute inset-x-0 top-[calc(100%+8px)] z-30 flex-col rounded-xl border border-white/[.14] bg-[#1A2E20] p-1.5 shadow-[0_20px_50px_rgba(5,12,8,.5)] ${showList ? "flex" : "hidden"}`}
      >
        <ul id={listId} role="listbox" aria-label={t.shell.search.label} className="m-0 flex list-none flex-col p-0">
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the click would come after the field's blur closed the list.
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${i === active ? "bg-white/[.08]" : ""}`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium">{h.kunde}</span>
                <span className="truncate text-[13px] text-white/70">
                  {h.nr} · {h.art} · {formatChf(h.betrag)}
                </span>
              </div>
              <Badge tone={h.tone}>{t.status[h.status] || h.status}</Badge>
            </li>
          ))}
        </ul>
        {showList && !hits.length ? <div className="px-3 py-3 text-[15px] text-white/70">{t.shell.search.none}</div> : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {showList ? (hits.length ? t.shell.search.results(hits.length) : t.shell.search.none) : ""}
      </span>
    </div>
  );
}
