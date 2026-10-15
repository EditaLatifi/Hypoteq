"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, House, Layers, Plus } from "lucide-react";
import Modal from "@/components/portal/Modal";
import { useLocale, useT } from "@/components/portal/I18n";
import { newFinancingHref } from "@/lib/portal/funnelLink";

const OPTION =
  "flex w-full items-start gap-3.5 rounded-xl border border-white/[.14] bg-white/[.04] p-[18px] text-left text-white transition-colors duration-200 ease-out hover:border-[#CAF476] hover:bg-white/[.08]";

/**
 * «Neue Finanzierung starten» (handoff «Spezialfinanzierung», Einstieg): a choice between
 * the Standardfinanzierung — the existing funnel as Berater, recognised by the partner's
 * e-mail — and the Spezialfinanzierung captured in the portal.
 */
export default function NewFinancingDialog({ email }: { email: string }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const nf = t.shell.newFinancing;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={nf.title}
        className="grid h-11 w-11 flex-none place-items-center rounded-full border border-white text-white transition-colors hover:bg-white/[.08] min-[900px]:inline-flex min-[900px]:h-9 min-[900px]:w-auto min-[900px]:items-center min-[900px]:gap-2 min-[900px]:whitespace-nowrap min-[900px]:px-4 min-[900px]:text-[15px] min-[900px]:font-semibold"
      >
        <Plus size={18} aria-hidden />
        <span className="hidden min-[900px]:inline">{nf.title}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={nf.title} width={560}>
        <div className="flex flex-col gap-3">
          <a href={newFinancingHref(locale, email)} className={OPTION} onClick={() => setOpen(false)}>
            <House size={24} aria-hidden className="mt-0.5 flex-none text-[#CAF476]" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-[17px] font-medium">{nf.standard}</span>
              <span className="text-[15px] text-white/70">{nf.standardText}</span>
              <span className="pt-1 text-[11px] uppercase tracking-[.14em] text-[#CAF476]">{nf.standardTag}</span>
            </span>
            <ArrowRight size={18} aria-hidden className="mt-1 flex-none text-[#CAF476]" />
          </a>
          <Link href="/portal/spezialfinanzierung" className={OPTION} onClick={() => setOpen(false)}>
            <Layers size={24} aria-hidden className="mt-0.5 flex-none text-[#CAF476]" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-[17px] font-medium">{nf.special}</span>
              <span className="text-[15px] text-white/70">{nf.specialText}</span>
              <span className="pt-1 text-[11px] uppercase tracking-[.14em] text-[#CAF476]">{nf.specialTag}</span>
            </span>
            <ArrowRight size={18} aria-hidden className="mt-1 flex-none text-[#CAF476]" />
          </Link>
        </div>
      </Modal>
    </>
  );
}
