import LogoCard from "@/components/portal/profile/LogoCard";
import PartnerDataCard, { type PartnerDataRow } from "@/components/portal/profile/PartnerDataCard";
import ProfileAvatar from "@/components/portal/profile/ProfileAvatar";
import SecurityCard from "@/components/portal/profile/SecurityCard";
import { Badge, Card, Eyebrow, formatDate, formatDateTime, initials } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { CHANGE_STATUS_TONE, changeRequestNr, isChangeStatus, loadPartnerData, mergePartnerData, type PartnerData } from "@/lib/portal/changeRequests";
import { getDict } from "@/lib/portal/i18n/server";
import { imageMeta, sessionAccountFor } from "@/lib/portal/images";
import { requireUser } from "@/lib/portal/session";

/**
 * Profil (handoff 4): photo, partner data from Salesforce with change requests, the
 * company logo and security. HYPOTEQ 19.10.2026 took out «Eigene Dokumente» (E.1) and the
 * e-mail switches (E.2: HYPOTEQ decides who is notified, Account.Send_Notification__c).
 *
 * While an admin views the portal as a partner, the page shows that partner's profile —
 * their data, logo and requests — and nothing can be changed.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const { t, locale } = await getDict();
  const tx = t.profileExtra;
  const viewing = !!user.viewingAs;

  // Whose profile: the user's own, or the viewed partner's portal account (if they have one).
  const viewed = user.viewingAs ? await prisma.portalUser.findFirst({ where: { sfContactId: user.viewingAs.contactId } }) : null;
  const person = user.viewingAs
    ? {
        id: viewed?.id ?? null,
        email: viewed?.email ?? "",
        name: viewed?.name ?? user.viewingAs.name,
        company: viewed?.company ?? null,
        phone: viewed?.phone ?? null,
        role: "partner",
        activatedAt: viewed?.activatedAt ?? null,
        lastLoginAt: viewed?.lastLoginAt ?? null,
      }
    : user;
  const contactId = user.contactId;

  const [accountId, images] = await Promise.all([sessionAccountFor(user), imageMeta(user)]);

  let fromSf: PartnerData | null = null;
  let loadError = false;
  if (contactId) {
    try {
      fromSf = await loadPartnerData(contactId);
    } catch (err) {
      console.error("[portal] loading partner data from Salesforce failed", err);
      loadError = true;
    }
  }
  const data = mergePartnerData(fromSf, { name: person.name, company: person.company, phone: person.phone, email: person.email || fromSf?.email || "" });

  const requests = person.id
    ? await prisma.portalChangeRequest.findMany({ where: { userId: person.id }, orderBy: { createdAt: "desc" }, take: 50 }).catch((err) => {
        console.error("[portal] loading change requests failed", err);
        return [];
      })
    : [];

  const isAdmin = person.role === "admin";
  const access = person.activatedAt ? t.profile.activeSince(formatDate(person.activatedAt)) : viewing && !viewed ? "–" : t.profile.active;
  const rows: PartnerDataRow[] = contactId
    ? [
        { label: t.auth.name, value: data.name, field: "name" },
        { label: t.auth.company, value: data.company, field: "company" },
        { label: tx.data.address, value: data.address, field: "address" },
        { label: t.profile.email, value: data.email, field: "email" },
        { label: t.auth.phone, value: data.phone, field: "phone" },
        { label: tx.data.iban, value: data.iban, field: "iban" },
        ...(data.partnerNr ? [{ label: tx.data.partnerNr, value: data.partnerNr, field: null }] : []),
        { label: t.profile.access, value: access, field: null },
        { label: t.profile.role, value: t.profile.rolePartner, field: null },
      ]
    : [
        // HYPOTEQ staff: no Salesforce Contact, nothing to request.
        { label: t.auth.name, value: data.name, field: null },
        { label: t.auth.company, value: data.company, field: null },
        { label: t.profile.email, value: data.email, field: null },
        { label: t.auth.phone, value: data.phone, field: null },
        { label: t.profile.access, value: access, field: null },
        { label: t.profile.role, value: isAdmin ? t.profile.roleAdmin : t.profile.rolePartner, field: null },
      ];
  const current: Record<string, string | null> = { name: data.name, company: data.company, address: data.address, email: data.email, phone: data.phone, iban: data.iban };
  const canRequest = !viewing && !!user.sfContactId;

  const since = person.activatedAt
    ? person.activatedAt.toLocaleDateString(`${locale}-CH`, { month: "long", year: "numeric", timeZone: "Europe/Zurich" })
    : null;
  const sub = isAdmin ? t.profile.roleAdmin : [data.company, since ? tx.partnerSince(since) : null].filter(Boolean).join(" · ");

  return (
    <>
      <div className="flex flex-wrap items-center gap-5">
        <ProfileAvatar initials={initials(person.name, person.email || "?")} photoV={images.photo?.v ?? null} readOnly={viewing} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>{t.nav.profile}</Eyebrow>
          <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em] text-white">{data.name || person.email}</h1>
          {sub ? <p className="m-0 text-[17px] text-white/70">{sub}</p> : null}
        </div>
      </div>

      <div className="grid items-start gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
        <div className="flex min-w-0 flex-col gap-6">
          <PartnerDataCard rows={rows} current={current} canRequest={canRequest} loadError={loadError} note={contactId ? tx.data.note : t.profile.sub} />

          {requests.length ? (
            <Card className="gap-3">
              <Eyebrow accent>{tx.change.listTitle}</Eyebrow>
              <div className="flex flex-col">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-4 border-t border-white/[.14] py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] text-white/70">
                        {changeRequestNr(r.id)} · {formatDate(r.createdAt)}
                      </span>
                      <span className="break-words text-[15px] font-medium">
                        {tx.change.fields[r.field] || r.field}: {r.newValue}
                      </span>
                    </div>
                    <Badge tone={isChangeStatus(r.status) ? CHANGE_STATUS_TONE[r.status] : "neutral"}>{tx.change.status[r.status] || r.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {contactId ? <LogoCard logo={images.logo} canEdit={!viewing && !!accountId} noAccount={!accountId} /> : null}

          <SecurityCard lastLogin={person.lastLoginAt ? t.common.lastLogin(formatDateTime(person.lastLoginAt)) : viewing ? "–" : t.profile.firstLogin} readOnly={viewing} />
        </div>
      </div>
    </>
  );
}
