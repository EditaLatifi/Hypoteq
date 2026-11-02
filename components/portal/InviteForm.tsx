"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Mail, Search, UserPlus } from "lucide-react";
import { invitePartnerAction, type AdminFormState } from "@/app/portal/(app)/admin/actions";
import { ACCESS_TONE } from "@/components/portal/access";
import { useT } from "@/components/portal/I18n";
import { Badge, FormError, btn } from "@/components/portal/ui";

/** A Salesforce partner the admin can tick; `status` is their portal access, null when they have none. */
export type InviteCandidate = { id: string; name: string; company: string | null; email: string; status: string | null };

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={pending} className={`${btn.primary} h-[50px] text-[16px]`}>
      <UserPlus size={18} /> {pending ? t.admin.sending : t.admin.inviteBtn}
    </button>
  );
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function InviteForm({ candidates = [] }: { candidates?: InviteCandidate[] }) {
  const t = useT();
  const [state, action] = useFormState<AdminFormState, FormData>(invitePartnerAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setPicked(new Set());
    }
  }, [state]);

  const q = fold(query.trim());
  const matches = (c: InviteCandidate) => !q || fold(`${c.name} ${c.company ?? ""} ${c.email}`).includes(q);
  const shown = candidates.filter(matches).length;
  const toggle = (email: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex min-w-[240px] flex-1 items-center">
          <Mail size={20} className="pointer-events-none absolute left-4 text-white/60" />
          <input
            name="email"
            type="email"
            placeholder={t.admin.invitePlaceholder}
            aria-label={t.admin.invitePlaceholder}
            className="h-[50px] w-full rounded-xl border border-white/[.14] bg-white/[.08] pl-12 pr-4 text-[17px] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476]"
          />
        </label>
        <Submit />
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[14px] text-white/70">
        <input type="checkbox" name="role" value="admin" className="h-4 w-4 accent-[#CAF476]" />
        {t.admin.inviteAsAdmin}
      </label>

      {candidates.length ? (
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-white/85">{t.admin.invitePick}</span>
            {picked.size ? <span className="text-[13px] text-[#DAF6A2]">{t.admin.inviteSelected(picked.size)}</span> : null}
          </div>
          <label className="relative flex items-center">
            <Search size={18} className="pointer-events-none absolute left-3.5 text-white/60" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.admin.inviteSearch}
              aria-label={t.admin.inviteSearch}
              className="h-[42px] w-full rounded-xl border border-white/[.14] bg-white/[.08] pl-10 pr-3 text-[15px] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476]"
            />
          </label>
          <div className="max-h-[280px] overflow-y-auto rounded-xl border border-white/[.14]">
            {candidates.map((c) => {
              // An active or deactivated access is not invited again from here (the list below has it).
              const locked = c.status === "active" || c.status === "disabled";
              return (
                // Hidden, not removed, while filtering: a ticked partner stays in the form.
                <label
                  key={c.id}
                  className={`${matches(c) ? "flex" : "hidden"} items-center gap-3 border-b border-white/[.08] px-3.5 py-2.5 last:border-b-0 ${
                    locked ? "cursor-default opacity-60" : "cursor-pointer hover:bg-white/[.04]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="emails"
                    value={c.email}
                    checked={picked.has(c.email)}
                    disabled={locked}
                    onChange={() => toggle(c.email)}
                    className="h-4 w-4 shrink-0 accent-[#CAF476]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {c.name}
                      {c.company ? <span className="text-white/60"> · {c.company}</span> : null}
                    </span>
                    <span className="block truncate text-[13px] text-white/60">{c.email}</span>
                  </span>
                  {c.status ? <Badge tone={ACCESS_TONE[c.status] || "neutral"}>{t.admin.access[c.status] || c.status}</Badge> : null}
                </label>
              );
            })}
            {shown === 0 ? <div className="px-3.5 py-3 text-[14px] text-white/60">{t.admin.inviteNoMatch}</div> : null}
          </div>
        </div>
      ) : null}

      <FormError>{state?.error}</FormError>
      {state?.ok ? <div className="rounded-xl bg-[#CAF476]/15 px-4 py-3 text-[15px] text-[#DAF6A2]">{state.ok}</div> : null}
    </form>
  );
}
