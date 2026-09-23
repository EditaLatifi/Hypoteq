import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/portal/status";

/*
 * Partnerportal building blocks, following the HYPOTEQ design system of the prototype:
 * forest-800 #132219 page, forest-700 #1A2E20 cards, forest-900 #0A130D sidebar,
 * lime #CAF476 accent, white text at 100 / 70 / 45 %.
 */

const TONES: Record<Tone, string> = {
  neutral: "bg-white/[.14] text-white/80",
  warning: "bg-[#FBF1DC] text-[#C98A16]",
  info: "bg-[#E4EEF4] text-[#2F6B8F]",
  accent: "bg-[#CAF476] text-[#132219]",
  success: "bg-[#E4F3E8] text-[#2F8F52]",
  danger: "bg-[#F8E7E5] text-[#B23B34]",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-[3px] text-[11px] font-semibold uppercase tracking-[.08em] leading-none ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Eyebrow({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <div className={`text-[13px] font-medium uppercase tracking-[.08em] ${accent ? "text-[#CAF476]" : "text-white/45"}`}>{children}</div>
  );
}

export function PageHeader({ eyebrow, title, sub, children }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2 min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em] text-white">{title}</h1>
        {sub ? <p className="m-0 text-[17px] text-white/70">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[.08] bg-[#1A2E20] p-5 md:p-7 flex flex-col gap-4 ${className}`}>{children}</div>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#CAF476] px-6 text-[#132219] font-semibold hover:bg-[#B7E455] active:bg-[#9CC93B] transition-colors disabled:bg-white/[.08] disabled:text-white/45 disabled:cursor-not-allowed",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-white px-4 text-white font-medium hover:bg-white/[.08] transition-colors",
  ghost: "inline-flex items-center gap-2 text-white font-semibold hover:text-[#DAF6A2] transition-colors",
};

export function Field({
  label,
  icon,
  hint,
  trailing,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; icon?: ReactNode; hint?: string; trailing?: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      {label ? <span className="text-[15px] font-semibold text-white">{label}</span> : null}
      <span className="relative flex items-center">
        {icon ? <span className="pointer-events-none absolute left-4 text-white/60">{icon}</span> : null}
        <input
          {...input}
          className={`h-[50px] w-full rounded-xl border border-white/[.14] bg-white/[.08] ${icon ? "pl-12" : "pl-4"} ${trailing ? "pr-12" : "pr-4"} text-[17px] text-white placeholder:text-white/45 outline-none focus:border-[#CAF476] focus:shadow-[0_0_0_3px_rgba(202,244,118,.35)] disabled:text-white/60`}
        />
        {trailing ? <span className="absolute right-1.5">{trailing}</span> : null}
      </span>
      {hint ? <span className="text-[13px] text-white/60">{hint}</span> : null}
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-[#E6A29C]/40 bg-[#B23B34]/15 px-4 py-3 text-[15px] text-[#F3C4BF]">
      {children}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[15px] text-[#CAF476] border-b border-current w-fit hover:text-[#DAF6A2]">
      {children}
    </Link>
  );
}

// Dates are shown the Swiss way (dd.mm.yyyy) in every language, as on the website.
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Zurich" });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "–";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "–";
  return `${formatDate(d)}, ${d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })}`;
}

export function formatLongDate(d: Date, locale: string): string {
  return d.toLocaleDateString(`${locale}-CH`, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });
}

export function formatChf(n: number | null | undefined): string {
  if (n == null) return "–";
  return `CHF ${Math.round(n).toLocaleString("de-CH").replace(/’/g, "'")}`;
}

export function initials(name: string | null | undefined, email: string): string {
  const src = (name || email.split("@")[0]).trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
