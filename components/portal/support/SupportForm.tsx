"use client";

import { useState, useTransition } from "react";
import { Bug, HelpCircle, Lightbulb, Send } from "lucide-react";
import { sendSupportAction } from "@/app/portal/supportActions";
import { useT } from "@/components/portal/I18n";
import { showToast } from "@/components/portal/special/toast";
import { Eyebrow, Field, FormError, btn } from "@/components/portal/ui";
import { BODY_MAX, SUBJECT_MAX, SUPPORT_TYPES, type SupportType } from "@/lib/portal/support";

const ICONS: Record<SupportType, typeof Bug> = { frage: HelpCircle, fehler: Bug, wunsch: Lightbulb };

const focusRing = "outline-none focus-visible:shadow-[0_0_0_3px_rgba(202,244,118,.55)]";
const controlCls =
  "w-full rounded-xl border border-white/[.14] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)] disabled:opacity-50";

/**
 * «Neue Meldung» (Support & Feedback). The technical details are read in the browser —
 * user agent, window size and the page the partner came from — and nothing about any
 * Case; the server masks ids in the path and adds the app version itself.
 */
export default function SupportForm({ cases, readOnly }: { cases: { id: string; label: string }[]; readOnly: boolean }) {
  const t = useT();
  const sp = t.support;
  const [type, setType] = useState<SupportType>("frage");
  const [caseId, setCaseId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendTech, setSendTech] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function techInfo() {
    let page = window.location.pathname;
    try {
      // The page before the support page, where the browser still knows it.
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === window.location.origin && ref.pathname !== window.location.pathname) page = ref.pathname;
    } catch {
      // keep the current path
    }
    return { browser: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}`, page };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendSupportAction({ type, caseId: caseId || null, subject, body, sendTech, tech: sendTech ? techInfo() : null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      showToast(res.message, t.common.close);
      setSubject("");
      setBody("");
      setCaseId("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Eyebrow accent>{sp.newTitle}</Eyebrow>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={sp.newTitle}>
        {SUPPORT_TYPES.map((k) => {
          const Icon = ICONS[k];
          const on = type === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setType(k)}
              className={`flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] px-2.5 text-[15px] font-medium transition-colors duration-[180ms] ${focusRing} ${
                on ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/30 text-white hover:bg-white/[.08]"
              }`}
            >
              <Icon size={16} /> {sp.types[k]}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-white">{sp.caseLabel}</span>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={readOnly} className={`h-[50px] bg-[#1A2E20] px-4 text-[17px] ${controlCls}`}>
          <option value="">{sp.caseNone}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <Field
        label={sp.subject}
        placeholder={sp.subjectPh[type]}
        value={subject}
        maxLength={SUBJECT_MAX}
        disabled={readOnly}
        onChange={(e) => setSubject(e.target.value)}
      />

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-white">{sp.body}</span>
        <textarea
          rows={5}
          value={body}
          maxLength={BODY_MAX}
          placeholder={sp.bodyPh[type]}
          disabled={readOnly}
          onChange={(e) => setBody(e.target.value)}
          className={`resize-y bg-white/[.08] px-3.5 py-3 text-[15px] leading-[1.4] ${controlCls}`}
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/85">
        <input
          type="checkbox"
          checked={sendTech}
          disabled={readOnly}
          onChange={(e) => setSendTech(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none cursor-pointer accent-[#CAF476]"
        />
        <span className="flex flex-col gap-0.5">
          <span>{sp.tech}</span>
          <span className="text-[13px] text-white/45">{sp.techHint}</span>
        </span>
      </label>

      <FormError>{error || (readOnly ? sp.readOnly : null)}</FormError>

      <div className="flex justify-end">
        <button type="submit" disabled={readOnly || pending || !subject.trim() || !body.trim()} className={`${btn.primary} h-11 text-[16px] ${focusRing}`}>
          {pending ? sp.sending : sp.send} <Send size={18} />
        </button>
      </div>
    </form>
  );
}
