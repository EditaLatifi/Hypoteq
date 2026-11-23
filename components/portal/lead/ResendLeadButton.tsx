"use client";

import { useTransition } from "react";
import { RotateCw } from "lucide-react";
import { resendLeadAction } from "@/app/portal/leadActions";
import { useT } from "@/components/portal/I18n";
import { showToast } from "@/components/portal/special/toast";

/** «Erneut senden» of one invitation; the answer (sent, or why not) comes as the toast. */
export default function ResendLeadButton({ leadId }: { leadId: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await resendLeadAction(leadId);
          showToast(res.ok ? res.message : res.error, t.common.close);
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 px-3 text-[14px] font-medium text-white transition-colors hover:bg-white/[.08] disabled:opacity-50 outline-none focus-visible:shadow-[0_0_0_3px_rgba(202,244,118,.55)]"
    >
      <RotateCw size={14} aria-hidden /> {pending ? t.lead.resending : t.lead.resend}
    </button>
  );
}
