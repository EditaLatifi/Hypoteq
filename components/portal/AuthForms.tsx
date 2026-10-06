"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail, MailCheck, Phone, User, WandSparkles } from "lucide-react";
import {
  activateAction,
  confirmProfileAction,
  loginAction,
  magicLoginAction,
  requestMagicLinkAction,
  requestResetAction,
  resetPasswordAction,
  type FormState,
} from "@/app/portal/actions";
import { useLocale, useT } from "@/components/portal/I18n";
import { btn, Field, FormError, TextLink } from "@/components/portal/ui";

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#CAF476]">{eyebrow}</div>
      <h2 className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.02em]">{title}</h2>
      {children ? <p className="m-0 text-white/70">{children}</p> : null}
    </div>
  );
}

function Submit({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={disabled || pending} className={`${btn.primary} h-[52px] w-full text-[19px]`}>
      {pending ? t.common.pleaseWait : children}
      {!pending ? <ArrowRight size={20} /> : null}
    </button>
  );
}

/** A password input with an eye button that shows or hides what was typed. */
function PasswordField(props: Omit<React.ComponentProps<typeof Field>, "type" | "icon" | "trailing">) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      icon={<Lock size={20} />}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
          aria-pressed={visible}
          title={visible ? t.auth.hidePassword : t.auth.showPassword}
          className="grid h-10 w-10 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/[.08] hover:text-white focus-visible:text-white"
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      }
    />
  );
}

export function SentPanel({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-5">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[#CAF476] text-[#132219]">
        <MailCheck size={26} strokeWidth={2} />
      </span>
      <h2 className="m-0 text-[34px] font-bold leading-[1.1] tracking-[-0.02em]">{t.auth.sentTitle}</h2>
      <p className="m-0 text-white/70">{text}</p>
      <TextLink href="/portal/login">{t.common.backToLogin}</TextLink>
    </div>
  );
}

export function LoginForm() {
  const t = useT();
  const [loginState, login] = useFormState<FormState, FormData>(loginAction, undefined);
  const [magicState, magic] = useFormState<FormState, FormData>(requestMagicLinkAction, undefined);
  const [email, setEmail] = useState("");

  if (magicState?.sent) return <SentPanel text={magicState.sent} />;
  const error = magicState?.error || loginState?.error;

  return (
    <>
      <AuthHeading eyebrow={t.common.portal} title={t.auth.loginTitle}>
        {t.auth.loginSub}
      </AuthHeading>
      <form action={login} className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Field
            label={t.auth.email}
            name="email"
            type="email"
            autoComplete="username"
            placeholder={t.auth.emailPlaceholder}
            icon={<Mail size={20} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PasswordField label={t.auth.password} name="password" autoComplete="current-password" placeholder="••••••••" />
        </div>
        <FormError>{error}</FormError>
        <div className="flex flex-col gap-3">
          <Submit>{t.auth.submitLogin}</Submit>
          <div className="flex flex-wrap justify-between gap-3">
            <Link href="/portal/passwort-vergessen" className={`${btn.ghost} h-9 text-[16px]`}>
              {t.auth.forgot}
            </Link>
            {/* Same form, different action: only the e-mail is used. */}
            <button type="submit" formAction={magic} formNoValidate className={`${btn.ghost} h-9 text-[16px]`}>
              <WandSparkles size={18} /> {t.auth.sendMagic}
            </button>
          </div>
        </div>
      </form>
      <div className="border-t border-white/[.14] pt-5 text-[15px] text-white/70">{t.auth.noAccess}</div>
    </>
  );
}

export function ResetRequestForm() {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(requestResetAction, undefined);
  if (state?.sent) return <SentPanel text={state.sent} />;
  return (
    <>
      <AuthHeading eyebrow={t.auth.resetEyebrow} title={t.auth.resetTitle}>
        {t.auth.resetSub}
      </AuthHeading>
      <form action={action} className="flex flex-col gap-5">
        <Field label={t.auth.email} name="email" type="email" autoComplete="username" placeholder={t.auth.emailPlaceholder} icon={<Mail size={20} />} required />
        <FormError>{state?.error}</FormError>
        <Submit>{t.auth.sendLink}</Submit>
      </form>
      <TextLink href="/portal/login">{t.common.backToLogin}</TextLink>
    </>
  );
}

function Checkbox({ name, children, checked, onChange }: { name: string; children: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px] text-white/85">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-none cursor-pointer accent-[#CAF476]"
      />
      <span>{children}</span>
    </label>
  );
}

export function ActivateForm({ token, email, name, company }: { token: string; email: string; name: string | null; company: string | null }) {
  const t = useT();
  const locale = useLocale();
  const [state, action] = useFormState<FormState, FormData>(activateAction, undefined);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);

  const modeBtn = (m: "password" | "magic") =>
    `h-11 rounded-full border text-[15px] font-medium transition-colors ${
      mode === m ? "border-[#CAF476] bg-[#CAF476] text-[#132219]" : "border-white/30 text-white hover:bg-white/[.08]"
    }`;

  return (
    <>
      <AuthHeading eyebrow={t.auth.activateEyebrow} title={t.auth.activateTitle}>
        {t.auth.activateHello(name)}{" "}
        {company ? (
          <>
            {t.auth.activateGrantedFor} <strong className="font-medium text-white">{company}</strong> {t.auth.activateGrantedFor2}.
          </>
        ) : (
          <>{t.auth.activateGranted}.</>
        )}{" "}
        {t.auth.activateChoose}
      </AuthHeading>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="mode" value={mode} />
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={modeBtn("password")} onClick={() => setMode("password")}>
            {t.auth.modePassword}
          </button>
          <button type="button" className={modeBtn("magic")} onClick={() => setMode("magic")}>
            {t.auth.modeMagic}
          </button>
        </div>
        {mode === "password" ? (
          <div className="flex flex-col gap-4">
            <Field label={t.auth.email} value={email} disabled icon={<Mail size={20} />} readOnly />
            <input type="hidden" name="username" value={email} autoComplete="username" />
            <PasswordField label={t.auth.newPassword} name="password" autoComplete="new-password" placeholder={t.auth.pwPlaceholder} hint={t.auth.pwHint} />
            <PasswordField label={t.auth.repeatPassword} name="password2" autoComplete="new-password" placeholder="••••••••" />
          </div>
        ) : (
          <div className="rounded-xl bg-white/[.08] p-4 text-[15px] text-white/70">{t.auth.magicInfo(email)}</div>
        )}
        <div className="flex flex-col gap-3">
          <Checkbox name="privacy" checked={privacy} onChange={setPrivacy}>
            {t.auth.accept}{" "}
            <a href={`/${locale}/agb`} target="_blank" rel="noreferrer" className="text-[#CAF476] underline">
              {t.auth.privacy}
            </a>
            .
          </Checkbox>
          <Checkbox name="terms" checked={terms} onChange={setTerms}>
            {t.auth.accept}{" "}
            <a href={`/${locale}/agb`} target="_blank" rel="noreferrer" className="text-[#CAF476] underline">
              {t.auth.terms}
            </a>
            .
          </Checkbox>
        </div>
        <FormError>{state?.error}</FormError>
        <Submit disabled={!privacy || !terms}>{t.auth.activateSubmit}</Submit>
      </form>
      <TextLink href="/portal/login">{t.common.backToLogin}</TextLink>
    </>
  );
}

export function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(resetPasswordAction, undefined);
  return (
    <>
      <AuthHeading eyebrow={t.auth.resetEyebrow} title={t.auth.newPwTitle}>
        {t.auth.newPwSub(email)}
      </AuthHeading>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="username" value={email} autoComplete="username" />
        <PasswordField label={t.auth.newPassword} name="password" autoComplete="new-password" placeholder={t.auth.pwPlaceholder} hint={t.auth.pwHint} />
        <PasswordField label={t.auth.repeatPassword} name="password2" autoComplete="new-password" placeholder="••••••••" />
        <FormError>{state?.error}</FormError>
        <Submit>{t.auth.savePassword}</Submit>
      </form>
    </>
  );
}

/**
 * The magic link lands on a page with a button instead of logging in on GET: mail
 * scanners open links to check them, and a GET login would spend the token before the
 * partner ever clicks.
 */
export function MagicLoginForm({ token, email }: { token: string; email: string }) {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(magicLoginAction, undefined);
  return (
    <>
      <AuthHeading eyebrow={t.common.portal} title={t.auth.loginTitle}>
        {t.auth.magicSub(email)}
      </AuthHeading>
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />
        <FormError>{state?.error}</FormError>
        <Submit>{t.auth.magicSubmit}</Submit>
      </form>
    </>
  );
}

export function ConfirmProfileForm({ email, name, company, phone }: { email: string; name: string; company: string; phone: string }) {
  const t = useT();
  const [state, action] = useFormState<FormState, FormData>(confirmProfileAction, undefined);
  return (
    <>
      <AuthHeading eyebrow={t.auth.confirmEyebrow} title={t.auth.confirmTitle}>
        {t.auth.confirmSub}
      </AuthHeading>
      <form action={action} className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <Field label={t.auth.name} name="name" defaultValue={name} icon={<User size={20} />} required autoComplete="name" />
          <Field label={t.auth.company} name="company" defaultValue={company} icon={<Building2 size={20} />} autoComplete="organization" />
          <Field label={t.auth.phone} name="phone" defaultValue={phone} icon={<Phone size={20} />} autoComplete="tel" />
          <Field label={t.auth.email} value={email} disabled readOnly icon={<Mail size={20} />} hint={t.auth.emailLocked} />
        </div>
        <FormError>{state?.error}</FormError>
        <Submit>{t.auth.confirmSubmit}</Submit>
      </form>
    </>
  );
}
