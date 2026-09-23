"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Eye, FileText, FolderOpen, LayoutGrid, LogOut, Plus, ScrollText, User, Users } from "lucide-react";
import { endViewAsAction, logoutAction } from "@/app/portal/actions";
import { LanguageSwitch, useLocale, useT } from "@/components/portal/I18n";

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number };

export default function PortalShell({
  children,
  userName,
  userSub,
  userInitials,
  isAdmin,
  hasCases,
  counts,
  viewingAs,
}: {
  children: ReactNode;
  userName: string;
  userSub: string;
  userInitials: string;
  isAdmin: boolean;
  hasCases: boolean;
  /** Sidebar badges: Cases needing action, missing documents, unread notifications. */
  counts: { cases: number; documents: number; notifications: number };
  viewingAs: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname() || "";
  const unread = counts.notifications;

  const partnerNav: NavItem[] = hasCases
    ? [
        { href: "/portal/dashboard", label: t.nav.dashboard, icon: <LayoutGrid size={20} /> },
        { href: "/portal/cases", label: t.nav.cases, icon: <FolderOpen size={20} />, badge: counts.cases },
        { href: "/portal/dokumente", label: t.nav.documents, icon: <FileText size={20} />, badge: counts.documents },
        ...(viewingAs ? [] : [{ href: "/portal/meldungen", label: t.nav.notifications, icon: <Bell size={20} />, badge: unread }]),
      ]
    : [{ href: "/portal/dashboard", label: t.nav.dashboard, icon: <LayoutGrid size={20} /> }];
  const nav: NavItem[] = [
    ...partnerNav,
    { href: "/portal/profil", label: t.nav.profile, icon: <User size={20} /> },
    ...(isAdmin
      ? [
          { href: "/portal/admin/partner", label: t.nav.partners, icon: <Users size={20} /> },
          { href: "/portal/admin/audit", label: t.nav.audit, icon: <ScrollText size={20} /> },
        ]
      : []),
  ];
  const active = nav.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const crumb = `${t.common.portal} · ${active?.label ?? ""}`;
  // The phone bar has room for five items; the rest stay reachable from the header.
  const mobileNav = nav.filter((n) => n.href !== "/portal/admin/audit").slice(0, 5);

  return (
    <div className="flex min-h-screen items-stretch">
      <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col border-r border-white/[.08] bg-[#0A130D] lg:flex">
        <div className="px-6 pb-4 pt-6">
          <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className="block h-auto w-[120px]" />
          <div className="mt-2.5 text-[11px] uppercase tracking-[.14em] text-white/45">{t.common.portal}</div>
        </div>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {nav.map((n) => {
            const on = n === active;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-[46px] items-center gap-3 rounded-xl border-2 px-3.5 text-[16px] transition-colors ${
                  on
                    ? "border-[#CAF476]/55 bg-white/[.08] font-semibold text-white"
                    : "border-transparent text-white/80 hover:bg-white/[.05] hover:text-white"
                }`}
              >
                <span className={on ? "text-white" : "text-white/60"}>{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {n.badge ? (
                  <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-[#CAF476] px-1.5 text-[11px] font-semibold tabular-nums text-[#132219]">
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-white/[.08] px-6 pb-6 pt-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white/[.14] text-[13px] font-semibold">{userInitials}</span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium">{userName}</div>
              <div className="truncate text-[13px] text-white/70">{userSub}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex h-9 items-center gap-2 text-[15px] font-semibold text-white hover:text-[#DAF6A2]">
              <LogOut size={18} /> {t.nav.logout}
            </button>
          </form>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {viewingAs ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#CAF476] px-4 py-2.5 text-[14px] font-medium text-[#132219] md:px-10">
            <span className="inline-flex items-center gap-2">
              <Eye size={18} /> {t.nav.viewingAs(viewingAs)}
            </span>
            <form action={endViewAsAction}>
              <button type="submit" className="h-8 rounded-full border-[1.5px] border-[#132219] px-3.5 font-semibold hover:bg-[#132219]/[.08]">
                {t.nav.endViewing}
              </button>
            </form>
          </div>
        ) : null}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/[.08] bg-[#132219] px-4 py-3 md:px-10 md:py-4">
          <img src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" className="block h-auto w-[100px] lg:hidden" />
          <div className="hidden min-w-0 truncate text-[13px] text-white/70 lg:block">{crumb}</div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <LanguageSwitch className="hidden sm:flex" />
            {hasCases && !viewingAs && !isAdmin ? (
              <a
                href={`/${locale}/funnel`}
                className="hidden h-9 items-center gap-2 whitespace-nowrap rounded-full border border-white px-4 text-[15px] font-semibold text-white hover:bg-white/[.08] md:inline-flex"
              >
                <Plus size={18} /> {t.nav.newFinancing}
              </a>
            ) : null}
            {hasCases && !viewingAs ? (
              <Link href="/portal/meldungen" aria-label={t.nav.notifications} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-white/[.08]">
                <Bell size={22} />
                {unread ? (
                  <span className="absolute right-[7px] top-[7px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#CAF476] px-1 text-[11px] font-semibold text-[#132219]">
                    {unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <Link href="/portal/profil" aria-label={t.nav.profile} className="grid h-11 w-11 place-items-center rounded-full bg-white/[.14] text-[13px] font-semibold text-white">
              {userInitials}
            </Link>
          </div>
        </header>

        <div className="flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-32 pt-5 md:px-10 md:pt-10 lg:pb-16">
          <LanguageSwitch className="-mb-4 self-end sm:hidden" />
          {children}
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-white/[.08] bg-[#0A130D] px-2 pt-1.5 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileNav.length},1fr)`, paddingBottom: "calc(6px + env(safe-area-inset-bottom))" }}
      >
        {mobileNav.map((n) => {
          const on = n === active;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] ${on ? "text-white" : "text-white/60"}`}
            >
              <span className={on ? "text-[#CAF476]" : ""}>{n.icon}</span>
              <span className="max-w-full truncate px-1">{n.label}</span>
              {n.badge ? <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-[#CAF476]" /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
