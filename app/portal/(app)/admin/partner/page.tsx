import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { startViewAsAction } from "@/app/portal/actions";
import InviteForm from "@/components/portal/InviteForm";
import { ACCESS_TONE } from "@/components/portal/access";
import { Badge, Card, Eyebrow, FormError, PageHeader, btn, formatDateTime } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { listPartnerContacts, type PartnerContact } from "@/lib/portal/salesforce";
import { requireAdmin } from "@/lib/portal/session";

const STATUSES = ["active", "invited", "disabled"];

export default async function AdminPartnersPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireAdmin();
  const { t } = await getDict();
  const status = STATUSES.includes(searchParams.status || "") ? searchParams.status! : "";

  let contacts: PartnerContact[] = [];
  let contactsFailed = false;
  const [users, counts] = await Promise.all([
    prisma.portalUser.findMany({ where: status ? { status } : undefined, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 }),
    prisma.portalUser.groupBy({ by: ["status"], _count: true }),
    listPartnerContacts()
      .then((c) => (contacts = c))
      .catch((err) => {
        console.error("[portal] listing partner contacts failed", err);
        contactsFailed = true;
      }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const filters: [string, string][] = [["", t.admin.filterAll], ...STATUSES.map((s) => [s, t.admin.access[s]] as [string, string])];

  return (
    <>
      <PageHeader eyebrow={t.nav.administration} title={t.nav.partners} sub={t.admin.partnersSub} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            [t.admin.kpiTotal, counts.reduce((n, c) => n + c._count, 0)],
            [t.admin.kpiActive, count("active")],
            [t.admin.kpiInvited, count("invited")],
            [t.admin.kpiDisabled, count("disabled")],
          ] as [string, number][]
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-xl border border-white/[.08] bg-[#1A2E20] p-5">
            <span className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">{value}</span>
            <span className="text-[13px] text-white/70">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card>
          <Eyebrow accent>{t.admin.inviteTitle}</Eyebrow>
          <p className="m-0 text-[15px] text-white/70">{t.admin.inviteText}</p>
          <InviteForm />
        </Card>

        <Card>
          <Eyebrow accent>{t.admin.viewAsTitle}</Eyebrow>
          <p className="m-0 text-[15px] text-white/70">{t.admin.viewAsText}</p>
          <FormError>{contactsFailed ? t.admin.casesLoadError : null}</FormError>
          {contacts.length ? (
            <form action={startViewAsAction} className="flex flex-wrap gap-3">
              <select
                name="contactId"
                required
                defaultValue=""
                aria-label={t.admin.viewAsPick}
                className="h-[50px] min-w-[220px] flex-1 rounded-xl border border-white/[.14] bg-[#1A2E20] px-3.5 text-[16px] text-white outline-none focus:border-[#CAF476]"
              >
                <option value="" disabled>
                  {t.admin.viewAsPick}
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ""} ({t.admin.viewAsCases(c.caseCount)})
                  </option>
                ))}
              </select>
              <button type="submit" className={`${btn.primary} h-[50px] text-[16px]`}>
                <Eye size={18} /> {t.admin.viewAsBtn}
              </button>
            </form>
          ) : null}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <Link
            key={label}
            href={key ? `/portal/admin/partner?status=${key}` : "/portal/admin/partner"}
            className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[14px] font-semibold ${
              status === key ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/20 text-white hover:bg-white/[.08]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-white/[.08] bg-[#1A2E20] px-5">
        {users.map((u) => (
          <Link
            key={u.id}
            href={`/portal/admin/partner/${u.id}`}
            className="grid grid-cols-1 items-center gap-x-5 gap-y-3 border-b border-white/[.14] py-4 last:border-b-0 hover:bg-white/[.03] sm:grid-cols-2 lg:grid-cols-[1.2fr_1.3fr_1fr_auto]"
          >
            <div className="min-w-0">
              <div className="truncate text-[17px] font-medium">{u.name || u.email}</div>
              <div className="truncate text-[13px] text-white/70">{u.company || "–"}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px]">{u.email}</div>
              <div className="text-[13px] text-white/70">{u.role === "admin" ? t.admin.admin : u.sfContactId ? `SF ${u.sfContactId}` : t.admin.noSf}</div>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <Badge tone={ACCESS_TONE[u.status] || "neutral"}>{t.admin.access[u.status] || u.status}</Badge>
              <span className="text-[13px] text-white/70">{t.common.lastLogin(formatDateTime(u.lastLoginAt))}</span>
            </div>
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-2 text-[16px] font-semibold">
                {t.admin.details} <ArrowRight size={18} />
              </span>
            </div>
          </Link>
        ))}
        {users.length === 0 ? <div className="py-10 text-[15px] text-white/70">{t.admin.noPartners}</div> : null}
      </div>
    </>
  );
}
