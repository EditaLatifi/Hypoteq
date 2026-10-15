import { redirect } from "next/navigation";
import PortalShell from "@/components/portal/PortalShell";
import type { SearchEntry } from "@/components/portal/GlobalSearch";
import { initials } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { imageMeta } from "@/lib/portal/images";
import { loadMyCases } from "@/lib/portal/load";
import { unreadCount } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // First login, step 2 comes before anything else.
  if (!user.viewingAs && user.role !== "admin" && user.sfContactId && !user.profileConfirmedAt) redirect("/portal/angaben");

  const { t, locale } = await getDict();

  // Badges and the header search: Cases with «Aktion erforderlich», unread notifications, and
  // the partner's own Cases to search through (they already see every one of them).
  let casesAction = 0;
  let search: SearchEntry[] | null = null;
  if (user.contactId) {
    const { cases } = await loadMyCases(user, locale);
    casesAction = cases.filter((c) => c.actionRequired).length;
    search = cases.map((c) => ({ id: c.id, kunde: c.kunde, nr: c.nr, art: c.art, betrag: c.betrag, status: c.status, tone: c.tone }));
  }
  const unread = user.viewingAs || !user.contactId ? 0 : await unreadCount(user.id);

  // Photo and logo are the profile's (lib/portal/images.ts); without them the shell shows
  // initials and the HYPOTEQ logo, so a failure here must not take the portal down.
  let images: Awaited<ReturnType<typeof imageMeta>> = { photo: null, logo: null };
  try {
    images = await imageMeta(user);
  } catch (err) {
    console.error("[portal] image lookup failed", err);
  }

  return (
    <PortalShell
      userName={user.name || user.email}
      userSub={user.company || (user.role === "admin" ? t.profile.roleAdmin : user.email)}
      userEmail={user.email}
      userInitials={initials(user.name, user.email)}
      isAdmin={user.role === "admin"}
      hasCases={!!user.contactId}
      counts={{ cases: casesAction, notifications: unread }}
      viewingAs={user.viewingAs?.name ?? null}
      photoUrl={images.photo ? `/api/portal/image/photo?v=${images.photo.v}` : null}
      logo={images.logo ? { url: `/api/portal/image/logo?v=${images.logo.v}`, onLight: images.logo.onLight, alt: t.shell.partnerLogo(user.company) } : null}
      search={search}
    >
      {children}
    </PortalShell>
  );
}
