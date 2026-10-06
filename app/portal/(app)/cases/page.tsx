import { redirect } from "next/navigation";
import CaseList from "@/components/portal/CaseList";
import { FormError, PageHeader } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { requireUser } from "@/lib/portal/session";
import { CASE_FILTERS, type CaseFilter } from "@/lib/portal/status";

export default async function CasesPage({ searchParams }: { searchParams: { filter?: string } }) {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();

  const { cases, failed } = await loadMyCases(user, locale);
  const initialFilter = (CASE_FILTERS as readonly string[]).includes(searchParams.filter || "") ? (searchParams.filter as CaseFilter) : "Alle";

  return (
    <>
      <PageHeader eyebrow={t.nav.cases} title={t.cases.title} />
      <FormError>{failed ? t.common.casesLoadError : null}</FormError>
      <CaseList cases={cases} initialFilter={initialFilter} viewerContactId={user.contactId} />
    </>
  );
}
