"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { inviteCustomerAction } from "@/app/portal/leadActions";
import { useLocale, useT } from "@/components/portal/I18n";
import { showToast } from "@/components/portal/special/toast";
import { Eyebrow, Field, FormError, btn } from "@/components/portal/ui";
import { LEAD_ANREDEN, LEAD_LOCALES, NAME_MAX, PHONE_MAX, isLeadLocale, type LeadLocale } from "@/lib/portal/lead";

const focusRing = "outline-none focus-visible:shadow-[0_0_0_3px_rgba(202,244,118,.55)]";
const selectCls =
  "h-[50px] w-full rounded-xl border border-white/[.14] bg-[#1A2E20] px-4 text-[17px] text-white outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)] disabled:opacity-50";

/**
 * «Neue Einladung» (Partner Fast Lead, DECISIONS P39): Anrede, Vor- und Nachname, E-Mail,
 * Telefon (optional), the language of the invitation (the portal's, unless changed) and the
 * customer's consent. The server checks everything again.
 */
export default function LeadForm() {
  const t = useT();
  const l = t.lead;
  const portalLocale = useLocale();
  const [anrede, setAnrede] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [locale, setLocale] = useState<LeadLocale>(isLeadLocale(portalLocale) ? portalLocale : "de");
  // HYPOTEQ 23.11.2026: ticked by default; the partner unticks it when the customer has not agreed.
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await inviteCustomerAction({ anrede: anrede || null, firstName, lastName, email, phone, locale, consent });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      showToast(res.message, t.common.close);
      setAnrede("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setConsent(true);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Eyebrow accent>{l.formTitle}</Eyebrow>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-white">{l.anrede}</span>
        <select value={anrede} onChange={(e) => setAnrede(e.target.value)} className={selectCls}>
          <option value="">{l.anredeNone}</option>
          {LEAD_ANREDEN.map((a) => (
            <option key={a} value={a}>
              {l.anreden[a]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={l.firstName} value={firstName} maxLength={NAME_MAX} autoComplete="off" required onChange={(e) => setFirstName(e.target.value)} />
        <Field label={l.lastName} value={lastName} maxLength={NAME_MAX} autoComplete="off" required onChange={(e) => setLastName(e.target.value)} />
      </div>
      <Field label={l.email} type="email" inputMode="email" value={email} maxLength={254} autoComplete="off" required onChange={(e) => setEmail(e.target.value)} />
      <Field label={l.phone} type="tel" inputMode="tel" placeholder={l.phonePh} value={phone} maxLength={PHONE_MAX} autoComplete="off" onChange={(e) => setPhone(e.target.value)} />

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-white">{l.language}</span>
        <select value={locale} onChange={(e) => isLeadLocale(e.target.value) && setLocale(e.target.value)} className={selectCls}>
          {LEAD_LOCALES.map((code) => (
            <option key={code} value={code}>
              {l.languages[code]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/85">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none cursor-pointer accent-[#CAF476]"
        />
        <span>{l.consent}</span>
      </label>

      <FormError>{error}</FormError>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !firstName.trim() || !lastName.trim() || !email.trim() || !consent}
          className={`${btn.primary} h-11 text-[16px] ${focusRing}`}
        >
          {pending ? l.sending : l.send} <Send size={18} />
        </button>
      </div>
    </form>
  );
}
