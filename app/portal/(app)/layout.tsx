import { redirect } from "next/navigation";
import PortalShell from "@/components/portal/PortalShell";
import { initials } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { unreadCount } from "@/lib/portal/notifications";
import { requireUser } from "@/lib/portal/session";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // First login, step 2 comes before anything else.
  if (!user.viewingAs && user.role !== "admin" && user.sfContactId && !user.profileConfirmedAt) redirect("/portal/angaben");

  const { t } = await getDict();
  const unread = user.viewingAs || !user.contactId ? 0 : await unreadCount(user.id);
  return (
    <PortalShell
      userName={user.name || user.email}
      userSub={user.company || (user.role === "admin" ? t.profile.roleAdmin : user.email)}
      userInitials={initials(user.name, user.email)}
      isAdmin={user.role === "admin"}
      hasCases={!!user.contactId}
      unread={unread}
      viewingAs={user.viewingAs?.name ?? null}
    >
      {children}
    </PortalShell>
  );
}
