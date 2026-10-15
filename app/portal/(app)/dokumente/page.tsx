import { redirect } from "next/navigation";
import DocumentList, { type DocRow } from "@/components/portal/DocumentList";
import { FormError, PageHeader, formatDate } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { requireUser } from "@/lib/portal/session";
import { isClosedStatus, needsDocument } from "@/lib/portal/status";

/**
 * Every document of the open Cases in one list. No longer in the navigation (handoff order,
 * DECISIONS P21); reached from «Alle fehlenden Dokumente» on the dashboard.
 */
export default async function DocumentsPage() {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();

  const { cases, failed } = await loadMyCases(user, locale);
  const rows: DocRow[] = [];
  for (const c of cases.filter((c) => !isClosedStatus(c.status))) {
    c.documents.forEach((d, i) => {
      rows.push({
        id: `${c.id}-${i}`,
        caseId: c.id,
        caseNr: c.nr,
        kunde: c.kunde,
        name: d.name,
        status: d.status,
        docKey: d.key,
        context: `${c.kunde} · ${c.nr} · ${t.docCats[d.category]}`,
        meta: d.upload ? t.caseDetail.uploadedOn(formatDate(d.upload.at), d.upload.fileName) : d.person,
      });
    });
  }
  const order: Record<string, number> = { fehlt: 0, ungueltig: 0, neu: 1, hochgeladen: 2, pruefung: 3, vorhanden: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  const action = rows.filter((r) => needsDocument(r.status)).length;

  return (
    <>
      <PageHeader eyebrow={t.nav.documents} title={t.documentsPage.title} sub={t.documentsPage.count(rows.length, action)} />
      <FormError>{failed ? t.common.casesLoadError : null}</FormError>
      <DocumentList rows={rows} readOnly={!!user.viewingAs} />
    </>
  );
}
