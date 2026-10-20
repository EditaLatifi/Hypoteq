import { ArrowUpRight } from "lucide-react";
import SpecialNotice from "@/components/portal/special/SpecialNotice";
import SpecialRequestList from "@/components/portal/special/SpecialRequestList";
import SpecialWizard from "@/components/portal/special/SpecialWizard";
import { Card, PageHeader, btn } from "@/components/portal/ui";
import { NEW_FINANCING_PATH } from "@/lib/portal/funnelLink";
import { getDict } from "@/lib/portal/i18n/server";
import { requireUser } from "@/lib/portal/session";
import { listSpecialRequests, type SpecialRequestView } from "@/lib/portal/specialServer";

/**
 * Spezialfinanzierung (handoff 4): the wizard, and the partner's requests so far. Partners
 * submit; an admin viewing as a partner sees the list read-only, an admin without a
 * Salesforce Contact only the explanation.
 */
export default async function SpecialFinancingPage() {
  const user = await requireUser();
  const { t } = await getDict();
  const s = t.special;
  const canSubmit = !user.viewingAs && !!user.contactId;

  let rows: SpecialRequestView[] = [];
  try {
    rows = await listSpecialRequests(user);
  } catch (err) {
    // E.g. before prisma/sql/2026-10-15-v5-and-portal.sql has run: the wizard still shows.
    console.error("[portal] listing special financings failed", err);
  }

  return (
    <>
      <PageHeader eyebrow={s.eyebrow} title={s.title} sub={<span className="block max-w-[720px]">{s.sub}</span>}>
        {canSubmit && user.role !== "admin" ? (
          <a href={NEW_FINANCING_PATH} className={`${btn.ghost} h-9 text-[16px]`}>
            {s.toFunnel} <ArrowUpRight size={18} />
          </a>
        ) : null}
      </PageHeader>

      <SpecialNotice s={s} />

      {canSubmit ? (
        <SpecialWizard />
      ) : (
        <Card>
          <p className="m-0 text-[15px] text-white/70">{user.viewingAs ? s.readOnly : s.noContact}</p>
        </Card>
      )}

      {user.contactId ? <SpecialRequestList rows={rows} s={s} /> : null}
    </>
  );
}
