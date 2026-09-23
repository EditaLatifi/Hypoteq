import { NewPasswordForm } from "@/components/portal/AuthForms";
import { getDict } from "@/lib/portal/i18n/server";
import { peekToken } from "@/lib/portal/tokens";
import InvalidLink from "../../InvalidLink";

export default async function NewPasswordPage({ params }: { params: { token: string } }) {
  const { t } = await getDict();
  const row = await peekToken(params.token, "reset");
  if (!row || row.user.status !== "active") {
    return <InvalidLink title={t.auth.invalidTitle} text={t.auth.invalidReset} retryHref="/portal/passwort-vergessen" retryLabel={t.auth.requestNew} />;
  }
  return <NewPasswordForm token={params.token} email={row.user.email} />;
}
