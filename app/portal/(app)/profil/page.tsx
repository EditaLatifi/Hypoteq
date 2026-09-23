import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { logoutAction } from "@/app/portal/actions";
import NotifySwitches from "@/components/portal/NotifySwitches";
import { Card, Eyebrow, PageHeader, btn, formatDate, formatDateTime } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { notifyPrefs } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

export default async function ProfilePage() {
  const user = await requireUser();
  const { t } = await getDict();
  const facts: [string, string][] = [
    [t.auth.name, user.name || "–"],
    [t.auth.company, user.company || "–"],
    [t.profile.email, user.email],
    [t.auth.phone, user.phone || "–"],
    [t.profile.access, user.activatedAt ? t.profile.activeSince(formatDate(user.activatedAt)) : t.profile.active],
    [t.profile.role, user.role === "admin" ? t.profile.roleAdmin : t.profile.rolePartner],
  ];

  return (
    <>
      <PageHeader eyebrow={t.nav.profile} title={user.name || user.email} sub={t.profile.sub} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card>
          <Eyebrow accent>{t.profile.partnerData}</Eyebrow>
          <div className="flex flex-col">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-white/[.14] py-3">
                <span className="text-[15px] text-white/70">{k}</span>
                <span className="break-all text-right text-[15px] font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          {user.sfContactId ? (
            <Card>
              <Eyebrow accent>{t.profile.notifTitle}</Eyebrow>
              <NotifySwitches prefs={notifyPrefs(user.notifyPrefs)} readOnly={!!user.viewingAs} />
            </Card>
          ) : null}
          <Card>
            <Eyebrow accent>{t.profile.security}</Eyebrow>
            <div className="text-[15px] text-white/70">{user.lastLoginAt ? t.common.lastLogin(formatDateTime(user.lastLoginAt)) : t.profile.firstLogin}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/portal/passwort-vergessen" className={`${btn.secondary} h-10 text-[16px]`}>
                <KeyRound size={18} /> {t.profile.changePassword}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className={`${btn.ghost} h-10 px-2 text-[16px]`}>
                  <LogOut size={18} /> {t.nav.logout}
                </button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
