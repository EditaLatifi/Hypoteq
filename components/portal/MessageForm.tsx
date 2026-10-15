"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { sendMessageAction, type FormState } from "@/app/portal/actions";
import { useT } from "@/components/portal/I18n";
import { useToast } from "@/components/portal/Toast";
import { FormError, btn } from "@/components/portal/ui";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={disabled || pending} className={`${btn.primary} h-11 px-5 text-[15px] min-[900px]:h-10`}>
      {pending ? t.common.pleaseWait : t.caseDetail.send} <Send size={17} aria-hidden />
    </button>
  );
}

/**
 * «Nachricht senden»: the message goes as e-mail to `address` (the configured HYPOTEQ
 * address, DECISIONS P4) with Case-Nr and customer in the subject, and as a CaseComment to
 * Salesforce (app/portal/actions.ts sendMessageAction). The page lists it under «Letzte
 * Updates» after the action revalidates it.
 */
export default function MessageForm({ caseId, readOnly, address }: { caseId: string; readOnly: boolean; address: string }) {
  const t = useT();
  const toast = useToast();
  const [state, action] = useFormState<FormState, FormData>(sendMessageAction, undefined);
  const [body, setBody] = useState("");
  useEffect(() => {
    if (!state?.ok) return;
    setBody("");
    toast(state.ok);
  }, [state, toast]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <textarea
        name="body"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={readOnly}
        maxLength={4000}
        placeholder={t.caseDetail.messagePlaceholder(address)}
        aria-label={t.caseDetail.messageTitle}
        className="w-full resize-y rounded-xl border border-white/[.14] bg-white/[.08] px-3.5 py-3 text-[15px] leading-snug text-white placeholder:text-white/45 outline-none transition-[border-color] duration-200 ease-out focus:border-[#CAF476] disabled:opacity-50"
      />
      <FormError>{state?.error}</FormError>
      <div className="flex justify-end">
        <Submit disabled={readOnly || !body.trim()} />
      </div>
    </form>
  );
}
