"use client";

import { useFormState, useFormStatus } from "react-dom";
import { KeyRound, LogOut } from "lucide-react";
import { logoutAction, type FormState } from "@/app/portal/actions";
import { sendPasswordLinkAction } from "@/app/portal/profileActions";
import { useT } from "@/components/portal/I18n";
import { Notice } from "@/components/portal/profile/bits";
import { Card, Eyebrow, btn } from "@/components/portal/ui";

function PasswordButton() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={pending} className={`${btn.secondary} h-10 text-[16px] disabled:opacity-60`}>
      <KeyRound size={18} /> {pending ? t.common.pleaseWait : t.profile.changePassword}
    </button>
  );
}

/**
 * «Sicherheit»: last login, «Passwort ändern» (sends the existing reset link to the login
 * address — no address to type, as in the prototype) and «Abmelden».
 */
export default function SecurityCard({ lastLogin, readOnly }: { lastLogin: string; readOnly: boolean }) {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(sendPasswordLinkAction, undefined);

  return (
    <Card className="gap-3">
      <Eyebrow accent>{t.profile.security}</Eyebrow>
      <div className="text-[15px] text-white/70">{lastLogin}</div>
      {readOnly ? (
        <p className="m-0 text-[13px] text-white/45">{t.profileExtra.security.viewAs}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <form action={action}>
              <PasswordButton />
            </form>
            <form action={logoutAction}>
              <button type="submit" className={`${btn.ghost} h-10 px-2 text-[16px]`}>
                <LogOut size={18} /> {t.nav.logout}
              </button>
            </form>
          </div>
          <Notice ok={state?.ok} error={state?.error} />
        </>
      )}
    </Card>
  );
}
