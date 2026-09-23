import { redirect } from "next/navigation";
import PortalShell from "@/components/portal/PortalShell";
import { initials } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { unreadCount } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";
import { CLOSED_STATUSES, matchesFilter } from "@/lib/portal/status";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // First login, step 2 comes before anything else.
  if (!user.viewingAs && user.role !== "admin" && user.sfContactId && !user.profileConfirmedAt) redirect("/portal/angaben");

  const { t, locale } = await getDict();

  // Sidebar counts: Cases that need the partner, documents still missing, unread notifications.
  let casesAction = 0;
  let docsMissing = 0;
  if (user.contactId) {
    const { cases } = await loadMyCases(user, locale);
    const open = cases.filter((c) => !CLOSED_STATUSES.includes(c.status));
    casesAction = open.filter((c) => matchesFilter("Dokumente fehlen", c.status, c.missingDocs.length)).length;
    docsMissing = open.reduce((n, c) => n + c.missingDocs.length, 0);
  }
  const unread = user.viewingAs || !user.contactId ? 0 : await unreadCount(user.id);

  return (
    <PortalShell
      userName={user.name || user.email}
      userSub={user.company || (user.role === "admin" ? t.profile.roleAdmin : user.email)}
      userInitials={initials(user.name, user.email)}
      isAdmin={user.role === "admin"}
      hasCases={!!user.contactId}
      counts={{ cases: casesAction, documents: docsMissing, notifications: unread }}
      viewingAs={user.viewingAs?.name ?? null}
    >
      {children}
    </PortalShell>
  );
}
