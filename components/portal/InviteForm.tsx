"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Mail, UserPlus } from "lucide-react";
import { invitePartnerAction, type AdminFormState } from "@/app/portal/(app)/admin/actions";
import { useT } from "@/components/portal/I18n";
import { FormError, btn } from "@/components/portal/ui";

function Submit() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={pending} className={`${btn.primary} h-[50px] text-[16px]`}>
      <UserPlus size={18} /> {pending ? t.admin.sending : t.admin.inviteBtn}
    </button>
  );
}

export default function InviteForm() {
  const t = useT();
  const [state, action] = useFormState<AdminFormState, FormData>(invitePartnerAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex min-w-[240px] flex-1 items-center">
          <Mail size={20} className="pointer-events-none absolute left-4 text-white/60" />
          <input
            name="email"
            type="email"
            required
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
      <FormError>{state?.error}</FormError>
      {state?.ok ? <div className="rounded-xl bg-[#CAF476]/15 px-4 py-3 text-[15px] text-[#DAF6A2]">{state.ok}</div> : null}
    </form>
  );
}
