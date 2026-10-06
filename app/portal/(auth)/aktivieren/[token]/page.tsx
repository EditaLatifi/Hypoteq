import { ActivateForm } from "@/components/portal/AuthForms";
import { getDict } from "@/lib/portal/i18n/server";
import { peekToken } from "@/lib/portal/tokens";
import InvalidLink from "../../InvalidLink";

export default async function ActivatePage({ params }: { params: { token: string } }) {
  const { t } = await getDict();
  const row = await peekToken(params.token, "invite");
  if (!row || row.user.status === "disabled") {
    return <InvalidLink title={t.auth.invalidTitle} text={t.auth.invalidActivate} retryHref="/portal/login" retryLabel={t.auth.toLogin} />;
  }
  return <ActivateForm token={params.token} email={row.user.email} name={row.user.name} company={row.user.company} />;
}
