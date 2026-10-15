import { redirect } from "next/navigation";
import CaseList from "@/components/portal/CaseList";
import { FormError, PageHeader } from "@/components/portal/ui";
import { getDict } from "@/lib/portal/i18n/server";
import { loadMyCases } from "@/lib/portal/load";
import { requireUser } from "@/lib/portal/session";

export default async function CasesPage() {
  const user = await requireUser();
  if (!user.contactId) redirect("/portal/dashboard");
  const { t, locale } = await getDict();

  const { cases, failed } = await loadMyCases(user, locale);

  // The filter (?filter=…) is read in CaseList, from the URL it keeps up to date.
  return (
    <>
      <PageHeader eyebrow={t.nav.cases} title={t.cases.title} />
      <FormError>{failed ? t.common.casesLoadError : null}</FormError>
      <CaseList cases={cases} viewerContactId={user.contactId} />
    </>
  );
}
