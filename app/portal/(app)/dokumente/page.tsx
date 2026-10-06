import { redirect } from "next/navigation";
import DocumentList, { type DocRow } from "@/components/portal/DocumentList";
import { FormError, PageHeader, formatDate } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { docLabel } from "@/lib/portal/salesforce";
import { requireUser } from "@/lib/portal/session";
import { CLOSED_STATUSES } from "@/lib/portal/status";

export default async function DocumentsPage() {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();

  const { cases, failed } = await loadMyCases(user, locale);
  const open = cases.filter((c) => !CLOSED_STATUSES.includes(c.status));
  const uploads = await prisma.portalUpload.findMany({
    where: { caseId: { in: open.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const rows: DocRow[] = [];
  for (const c of open) {
    for (const d of c.documents) {
      rows.push({
        id: `${c.id}-${d.state}-${d.key || d.name}`,
        caseId: c.id,
        caseNr: c.nr,
        kunde: c.kunde,
        name: d.name,
        state: d.state,
        docKey: d.key,
        meta: null,
      });
    }
    for (const u of uploads.filter((u) => u.caseId === c.id)) {
      rows.push({
        id: u.id,
        caseId: c.id,
        caseNr: c.nr,
        kunde: c.kunde,
        name: u.docKey ? docLabel(u.docKey, locale) : t.caseDetail.otherDoc,
        state: "hochgeladen",
        docKey: u.docKey,
        meta: `${u.fileName} · ${formatDate(u.createdAt)}`,
      });
    }
  }
  const order = { fehlt: 0, offen: 1, hochgeladen: 2, vorhanden: 3 };
  rows.sort((a, b) => order[a.state] - order[b.state]);
  const action = rows.filter((r) => r.state === "fehlt" || r.state === "offen").length;

  return (
    <>
      <PageHeader eyebrow={t.nav.documents} title={t.documentsPage.title} sub={t.documentsPage.count(rows.length, action)} />
      <FormError>{failed ? t.common.casesLoadError : null}</FormError>
      <DocumentList rows={rows} readOnly={!!user.viewingAs} />
    </>
  );
}
