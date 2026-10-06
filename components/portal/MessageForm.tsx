"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { sendMessageAction, type FormState } from "@/app/portal/actions";
import { useT } from "@/components/portal/I18n";
import { FormError, btn } from "@/components/portal/ui";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={disabled || pending} className={`${btn.primary} h-10 px-5 text-[15px]`}>
      {pending ? t.common.pleaseWait : t.caseDetail.send} <Send size={17} />
    </button>
  );
}

export default function MessageForm({ caseId, readOnly }: { caseId: string; readOnly: boolean }) {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(sendMessageAction, undefined);
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) setBody("");
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <textarea
        name="body"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={readOnly}
        maxLength={4000}
        placeholder={t.caseDetail.messagePlaceholder}
        aria-label={t.caseDetail.messageTitle}
        className="w-full resize-y rounded-xl border border-white/[.14] bg-white/[.08] px-3.5 py-3 text-[15px] leading-snug text-white placeholder:text-white/45 outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)] disabled:opacity-50"
      />
      <FormError>{state?.error}</FormError>
      {state?.ok ? <div className="rounded-xl bg-[#CAF476]/15 px-4 py-3 text-[15px] text-[#DAF6A2]">{state.ok}</div> : null}
      <div className="flex justify-end">
        <Submit disabled={readOnly || !body.trim()} />
      </div>
    </form>
  );
}
