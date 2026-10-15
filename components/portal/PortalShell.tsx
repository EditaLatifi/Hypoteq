"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Bell, Eye, FolderOpen, GraduationCap, House, Layers, LayoutGrid, LifeBuoy, LogOut, ScrollText, User, Users } from "lucide-react";
import { endViewAsAction, logoutAction } from "@/app/portal/actions";
import GlobalSearch, { type SearchEntry } from "@/components/portal/GlobalSearch";
import { LanguageSwitch, useT } from "@/components/portal/I18n";
import NewFinancingDialog from "@/components/portal/NewFinancingDialog";
import { ToastProvider } from "@/components/portal/Toast";
import { PORTAL_TOOLS, SESSION_IDLE_MINUTES } from "@/lib/portal/config";

type NavItem = { href: string; label: string; short?: string; icon: ReactNode; badge?: number; mobile?: boolean };

/** Pages without a nav entry of their own, and the entry they belong to. */
const NAV_PARENT: [string, string][] = [["/portal/dokumente", "/portal/cases"]];

/**
 * The server ends a session after 30 minutes without a request (lib/portal/session.ts) and
 * the next request lands on «Sitzung abgelaufen». A tab left open shows that screen as soon
 * as the partner comes back to it, not only on their next click.
 */
function SessionWatch() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRequest = useRef(Date.now());
  useEffect(() => {
    lastRequest.current = Date.now();
  }, [pathname]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRequest.current < SESSION_IDLE_MINUTES * 60_000) return;
      lastRequest.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router]);
  return null;
}

function Avatar({ photoUrl, initials, size }: { photoUrl: string | null; initials: string; size: 36 | 44 }) {
  const box = size === 44 ? "h-11 w-11" : "h-9 w-9";
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${box} flex-none rounded-full object-cover`} />
  ) : (
    <span aria-hidden className={`${box} grid flex-none place-items-center rounded-full bg-white/[.14] text-[13px] font-semibold text-white`}>
      {initials}
    </span>
  );
}

function Brand({ logo, className = "" }: { logo: { url: string; onLight: boolean; alt: string } | null; className?: string }) {
  if (!logo) return <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className={`block h-auto w-[120px] ${className}`} />;
  return (
    <span className={`${logo.onLight ? "rounded-lg bg-white px-3 py-2" : ""} inline-flex ${className}`}>
      <img src={logo.url} alt={logo.alt} className="block h-11 w-auto max-w-[160px] object-contain object-left" />
    </span>
  );
}

export default function PortalShell({
  children,
  userName,
  userSub,
  userEmail,
  userInitials,
  isAdmin,
  hasCases,
  counts,
  viewingAs,
  photoUrl,
  logo,
  search,
}: {
  children: ReactNode;
  userName: string;
  userSub: string;
  /** The login address — the funnel recognises the partner by it. */
  userEmail: string;
  userInitials: string;
  isAdmin: boolean;
  hasCases: boolean;
  /** Badges: Cases with «Aktion erforderlich», unread notifications. */
  counts: { cases: number; notifications: number };
  viewingAs: string | null;
  /** /api/portal/image/photo?v=… when the user has a profile photo. */
  photoUrl: string | null;
  /** The partner's company logo; it replaces the HYPOTEQ logo (handoff «Profil»). */
  logo: { url: string; onLight: boolean; alt: string } | null;
  /** The Cases the header search looks through; null hides the search. */
  search: SearchEntry[] | null;
}) {
  const t = useT();
  const pathname = usePathname() || "";
  const unread = counts.notifications;
  // Partner tools and write flows; an admin viewing as a partner only reads.
  const partner = !isAdmin && !viewingAs;

  // Handoff order: Dashboard, Cases, Spezialfinanzierung, Meldungen, Support, Profil.
  // Support is left out of the phone bar; it is reachable from the dashboard and the profile.
  const nav: NavItem[] = [
    { href: "/portal/dashboard", label: t.nav.dashboard, icon: <LayoutGrid size={20} /> },
    ...(hasCases ? [{ href: "/portal/cases", label: t.nav.cases, icon: <FolderOpen size={20} />, badge: counts.cases }] : []),
    ...(hasCases && partner ? [{ href: "/portal/spezialfinanzierung", label: t.nav.special, short: t.nav.specialShort, icon: <Layers size={20} /> }] : []),
    ...(hasCases && !viewingAs ? [{ href: "/portal/meldungen", label: t.nav.notifications, icon: <Bell size={20} />, badge: unread }] : []),
    ...(partner ? [{ href: "/portal/support", label: t.nav.support, icon: <LifeBuoy size={20} />, mobile: false }] : []),
    { href: "/portal/profil", label: t.nav.profile, icon: <User size={20} /> },
    ...(isAdmin
      ? [
          { href: "/portal/admin/partner", label: t.nav.partners, icon: <Users size={20} /> },
          { href: "/portal/admin/support", label: t.nav.adminSupport, icon: <LifeBuoy size={20} />, mobile: false },
          { href: "/portal/admin/aenderungen", label: t.nav.adminChanges, icon: <User size={20} />, mobile: false },
          { href: "/portal/admin/audit", label: t.nav.audit, icon: <ScrollText size={20} />, mobile: false },
        ]
      : []),
  ];
  const path = NAV_PARENT.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? pathname;
  const active = nav.find((n) => path === n.href || path.startsWith(n.href + "/"));
  const mobileNav = nav.filter((n) => n.mobile !== false).slice(0, 5);
  const crumb = `${isAdmin && !viewingAs ? t.nav.administration : t.common.portal} · ${active?.label ?? ""}`;

  return (
    <ToastProvider>
      <SessionWatch />
      <a href="#portal-main" className="hq-skip rounded-full bg-[#CAF476] px-4 py-2.5 text-[15px] font-semibold text-[#132219]">
        {t.shell.skipToContent}
      </a>
      <div className="flex min-h-screen items-stretch">
        <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col overflow-y-auto border-r border-white/[.08] bg-[#0A130D] min-[900px]:flex">
          <div className="px-6 pb-4 pt-6">
            <Brand logo={logo} />
            <div className="mt-2.5 text-[11px] uppercase tracking-[.14em] text-white/45">{logo ? t.shell.poweredBy : t.common.portal}</div>
          </div>
          <nav aria-label={t.shell.mainNav} className="flex flex-col gap-1 px-2 py-2">
            {nav.map((n) => {
              const on = n === active;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-[46px] items-center gap-3 rounded-xl border-2 px-3.5 text-[16px] transition-colors duration-200 ease-out ${
                    on ? "border-[#CAF476]/55 bg-white/[.08] font-semibold text-white" : "border-transparent text-white/80 hover:bg-white/[.05] hover:text-white"
                  }`}
                >
                  <span aria-hidden className={on ? "text-white" : "text-white/60"}>
                    {n.icon}
                  </span>
                  <span className="flex-1">{n.label}</span>
                  {n.badge ? (
                    <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-[#CAF476] px-1.5 text-[11px] font-semibold tabular-nums text-[#132219]">{n.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {!isAdmin ? (
            <div className="flex flex-col gap-2 px-4 pt-2">
              <div className="px-1 pb-0.5 pt-2 text-[11px] uppercase tracking-[.14em] text-white/45">{t.shell.tools.title}</div>
              {[
                { href: PORTAL_TOOLS.valuation, icon: <House size={18} />, label: t.shell.tools.valuation, sub: t.shell.tools.valuationShort },
                { href: PORTAL_TOOLS.academy, icon: <GraduationCap size={18} />, label: t.shell.tools.academy, sub: t.shell.tools.academyShort },
              ].map((tool) => (
                <a
                  key={tool.href}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-xl border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-white transition-colors duration-200 ease-out hover:border-[#CAF476]/45 hover:bg-white/[.08]"
                >
                  <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-[#CAF476]/[.12] text-[#CAF476]">
                    {tool.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[14px] font-medium leading-tight">{tool.label}</span>
                    <span className="text-[12px] leading-tight text-white/60">{tool.sub}</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden className="flex-none text-white/45" />
                  <span className="sr-only">{t.shell.tools.newTab}</span>
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex flex-col gap-3 border-t border-white/[.08] px-6 pb-6 pt-4">
            <div className="flex items-center gap-3">
              <Avatar photoUrl={photoUrl} initials={userInitials} size={36} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium">{userName}</div>
                <div className="truncate text-[13px] text-white/70">{userSub}</div>
              </div>
            </div>
            <LanguageSwitch className="-ml-2" />
            <form action={logoutAction}>
              <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-full text-[15px] font-semibold text-white hover:text-[#DAF6A2]">
                <LogOut size={18} aria-hidden /> {t.nav.logout}
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {viewingAs ? (
            <div className="hq-on-lime flex flex-wrap items-center justify-between gap-3 bg-[#CAF476] px-4 py-2.5 text-[14px] font-medium text-[#132219] md:px-10">
              <span className="inline-flex items-center gap-2">
                <Eye size={18} aria-hidden /> {t.nav.viewingAs(viewingAs)}
              </span>
              <form action={endViewAsAction}>
                <button type="submit" className="h-11 rounded-full border-[1.5px] border-[#132219] px-3.5 font-semibold hover:bg-[#132219]/[.08] min-[900px]:h-8">
                  {t.nav.endViewing}
                </button>
              </form>
            </div>
          ) : null}

          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] bg-[#132219] px-4 py-3 md:px-10 min-[900px]:py-4">
            <Link href="/portal/dashboard" className="min-[900px]:hidden">
              <Brand logo={logo} className={logo ? "" : "!w-[100px]"} />
            </Link>
            {search ? (
              <GlobalSearch items={search} className="order-last basis-full min-[900px]:order-none min-[900px]:max-w-[520px] min-[900px]:flex-1 min-[900px]:basis-auto" />
            ) : (
              <div className="hidden min-w-0 truncate text-[13px] text-white/70 min-[900px]:block">{crumb}</div>
            )}
            <div className="flex items-center gap-1.5 md:gap-2">
              {partner ? <NewFinancingDialog email={userEmail} /> : null}
              {hasCases && !viewingAs ? (
                <Link
                  href="/portal/meldungen"
                  aria-label={unread ? `${t.nav.notifications}, ${t.shell.unread(unread)}` : t.nav.notifications}
                  className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-white/[.08]"
                >
                  <Bell size={22} aria-hidden />
                  {unread ? (
                    <span aria-hidden className="absolute right-[7px] top-[7px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#CAF476] px-1 text-[11px] font-semibold text-[#132219]">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <Link href="/portal/profil" aria-label={t.shell.toProfile} className="rounded-full">
                <Avatar photoUrl={photoUrl} initials={userInitials} size={44} />
              </Link>
            </div>
          </header>

          <main id="portal-main" tabIndex={-1} className="flex w-full max-w-[1180px] flex-1 flex-col gap-4 px-4 pb-32 pt-5 outline-none md:px-10 md:pt-10 min-[900px]:pb-16">
            <LanguageSwitch className="self-end min-[900px]:hidden" />
            {/* Keyed by path: every page fades in (handoff «Motion»), not only the first. */}
            <div key={pathname} className="hq-in flex flex-col gap-8">
              {children}
            </div>
          </main>
        </div>

        <nav
          aria-label={t.shell.mainNav}
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-white/[.08] bg-[#0A130D] px-2 pt-1.5 min-[900px]:hidden"
          style={{ gridTemplateColumns: `repeat(${mobileNav.length},minmax(0,1fr))`, paddingBottom: "calc(6px + env(safe-area-inset-bottom))" }}
        >
          {mobileNav.map((n) => {
            const on = n === active;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] tracking-[.02em] ${on ? "text-white" : "text-white/70"}`}
              >
                <span aria-hidden className={on ? "text-[#CAF476]" : "text-white/45"}>
                  {n.icon}
                </span>
                <span className="max-w-full truncate px-1">{n.short || n.label}</span>
                {n.badge ? <span aria-hidden className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-[#CAF476]" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </ToastProvider>
  );
}
