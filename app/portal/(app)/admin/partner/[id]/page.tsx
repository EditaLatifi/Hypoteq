import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Link2, Mail, UserCheck, UserX, X } from "lucide-react";
import { assignCaseAction, resendInviteAction, setPartnerStatusAction, unassignCaseAction } from "@/app/portal/(app)/admin/actions";
import { startViewAsAction } from "@/app/portal/actions";
import { ACCESS_TONE } from "@/components/portal/access";
import { Badge, Card, Eyebrow, FormError, btn, formatChf, formatDate, formatDateTime } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { partnerCaseField } from "@/lib/portal/config";
import { getDict } from "@/lib/portal/i18n/server";
import { listPartnerCases, listUnassignedCases, type PortalCaseSummary, type UnassignedCase } from "@/lib/portal/salesforce";
import { requireAdmin } from "@/lib/portal/session";

export default async function AdminPartnerDetailPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  const { t, locale } = await getDict();
  const p = await prisma.portalUser.findUnique({ where: { id: params.id } });
  if (!p) notFound();

  let cases: PortalCaseSummary[] = [];
  let unassigned: UnassignedCase[] = [];
  let failed = false;
  if (p.sfContactId) {
    try {
      [cases, unassigned] = await Promise.all([listPartnerCases(p.sfContactId, locale), listUnassignedCases()]);
    } catch (err) {
      console.error("[portal] admin: loading partner cases failed", err);
      failed = true;
    }
  }

  const facts: [string, string][] = [
    [t.admin.sfContact, p.sfContactId || "–"],
    [t.admin.sfAccount, p.sfAccountId || "–"],
    [t.admin.loginEmail, p.email],
    [t.auth.phone, p.phone || "–"],
    [t.profile.access, t.admin.access[p.status] || p.status],
    [t.admin.invited, p.invitedAt ? (p.invitedBy ? t.admin.invitedBy(formatDate(p.invitedAt), p.invitedBy) : formatDate(p.invitedAt)) : "–"],
    [t.admin.activated, formatDate(p.activatedAt)],
    [t.admin.loginMethod, p.status !== "active" ? "–" : p.passwordHash ? t.admin.loginBoth : t.admin.loginMagic],
    [t.common.language, (p.locale || "de").toUpperCase()],
    [t.profile.role, p.role === "admin" ? t.profile.roleAdmin : t.profile.rolePartner],
  ];
  const self = p.id === admin.id;

  return (
    <>
      <div>
        <Link href="/portal/admin/partner" className={`${btn.ghost} h-9 text-[16px]`}>
          <ArrowLeft size={18} /> {t.admin.backToList}
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>
            {t.profile.rolePartner}
            {p.company ? ` · ${p.company}` : ""}
          </Eyebrow>
          <h1 className="m-0 text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em]">{p.name || p.email}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={ACCESS_TONE[p.status] || "neutral"}>{t.admin.access[p.status] || p.status}</Badge>
            <span className="text-[15px] text-white/70">{t.common.lastLogin(formatDateTime(p.lastLoginAt))}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.sfContactId ? (
            <form action={startViewAsAction}>
              <input type="hidden" name="contactId" value={p.sfContactId} />
              <button type="submit" className={`${btn.secondary} h-10 text-[15px]`}>
                <Eye size={18} /> {t.admin.viewAsThis}
              </button>
            </form>
          ) : null}
          {!self && p.status === "invited" ? (
            <form action={resendInviteAction}>
              <input type="hidden" name="userId" value={p.id} />
              <button type="submit" className={`${btn.primary} h-10 text-[15px]`}>
                <Mail size={18} /> {t.admin.resend}
              </button>
            </form>
          ) : null}
          {!self ? (
            <form action={setPartnerStatusAction}>
              <input type="hidden" name="userId" value={p.id} />
              <input type="hidden" name="to" value={p.status === "disabled" ? "active" : "disabled"} />
              <button type="submit" className={`${btn.secondary} h-10 text-[15px]`}>
                {p.status === "disabled" ? <UserCheck size={18} /> : <UserX size={18} />}
                {p.status === "disabled" ? t.admin.reactivate : t.admin.deactivate}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card>
          <Eyebrow accent>{t.admin.mapping}</Eyebrow>
          <div className="flex flex-col">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-white/[.14] py-3">
                <span className="text-[15px] text-white/70">{k}</span>
                <span className="break-all text-right text-[15px] font-medium tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow accent>{t.admin.assigned}</Eyebrow>
            <span className="text-[13px] text-white/70">{t.admin.viewAsCases(cases.length)}</span>
          </div>
          <FormError>{failed ? t.admin.casesLoadError : null}</FormError>
          <div className="flex flex-col">
            {cases.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.14] py-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{c.kunde}</div>
                  <div className="text-[13px] text-white/70">
                    {c.nr} · {formatChf(c.betrag)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.tone}>{t.status[c.status] || c.status}</Badge>
                  <form action={unassignCaseAction}>
                    <input type="hidden" name="userId" value={p.id} />
                    <input type="hidden" name="caseId" value={c.id} />
                    <button type="submit" aria-label={t.admin.unassign} title={t.admin.unassign} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/[.08]">
                      <X size={18} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {!cases.length && !failed ? (
              <div className="border-t border-white/[.14] py-4 text-[15px] text-white/70">{p.sfContactId ? t.admin.noAssigned : t.admin.noContact}</div>
            ) : null}
          </div>

          {p.sfContactId && !failed ? (
            <div className="flex flex-col gap-2.5 border-t border-white/[.14] pt-4">
              <div className="text-[11px] uppercase tracking-[.14em] text-white/45">{t.admin.assignTitle}</div>
              {unassigned.length ? (
                <form action={assignCaseAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={p.id} />
                  <select
                    name="caseId"
                    required
                    defaultValue=""
                    aria-label={t.admin.assignPick}
                    className="h-11 min-w-[200px] flex-1 rounded-xl border border-white/[.14] bg-[#1A2E20] px-3.5 text-[15px] text-white outline-none focus:border-[#CAF476]"
                  >
                    <option value="" disabled>
                      {t.admin.assignPick}
                    </option>
                    {unassigned.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nr} · {u.kunde} · {formatChf(u.betrag)} · {formatDate(u.createdAt)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={`${btn.secondary} h-10 text-[15px]`}>
                    <Link2 size={18} /> {t.admin.assignBtn}
                  </button>
                </form>
              ) : (
                <div className="text-[15px] text-white/70">{t.admin.allAssigned}</div>
              )}
              <p className="m-0 text-[13px] text-white/60">{t.admin.assignHint(partnerCaseField())}</p>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
