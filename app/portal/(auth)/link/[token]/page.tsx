import { MagicLoginForm } from "@/components/portal/AuthForms";
import { getDict } from "@/lib/portal/i18n/server";
import { peekToken } from "@/lib/portal/tokens";
import InvalidLink from "../../InvalidLink";

export default async function MagicLinkPage({ params }: { params: { token: string } }) {
  const { t } = await getDict();
  const row = await peekToken(params.token, "magic");
  if (!row || row.user.status !== "active") {
    return <InvalidLink title={t.auth.invalidTitle} text={t.auth.invalidMagic} retryHref="/portal/login" retryLabel={t.auth.requestNew} />;
  }
  return <MagicLoginForm token={params.token} email={row.user.email} />;
}
