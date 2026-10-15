"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { FilePenLine, Pencil, Send } from "lucide-react";
import type { FormState } from "@/app/portal/actions";
import { submitChangeRequestAction } from "@/app/portal/profileActions";
import { useT } from "@/components/portal/I18n";
import { Dialog, Notice, inputClass, selectClass } from "@/components/portal/profile/bits";
import { Card, Eyebrow, FormError, btn } from "@/components/portal/ui";

export type PartnerDataRow = { label: string; value: string | null; field: string | null };

/**
 * «Partnerdaten»: read from Salesforce, never edited here. «Änderung beantragen» and the
 * pencil of a row open the request dialog; the request goes to HYPOTEQ (Salesforce Task
 * and mail) and appears under «Änderungsanträge».
 */
export default function PartnerDataCard({
  rows,
  current,
  canRequest,
  loadError,
  note,
}: {
  rows: PartnerDataRow[];
  /** Current value per requestable field, for «Aktuell:» in the dialog. */
  current: Record<string, string | null>;
  canRequest: boolean;
  loadError: boolean;
  note: string;
}) {
  const t = useT();
  const tx = t.profileExtra;
  const [open, setOpen] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow accent>{t.profile.partnerData}</Eyebrow>
        {canRequest ? (
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setOpen("address");
            }}
            className={`${btn.secondary} h-9 text-[15px]`}
          >
            <FilePenLine size={17} /> {tx.data.requestChange}
          </button>
        ) : null}
      </div>
      {loadError ? <FormError>{tx.data.loadError}</FormError> : null}
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 border-t border-white/[.14] py-3">
            <span className="flex-none text-[15px] text-white/70">{r.label}</span>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="break-words text-right text-[15px] font-medium">{r.value || "–"}</span>
              {canRequest && r.field ? (
                <button
                  type="button"
                  aria-label={`${tx.data.requestChange}: ${r.label}`}
                  title={tx.data.requestChange}
                  onClick={() => {
                    setSent(null);
                    setOpen(r.field);
                  }}
                  className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/70 hover:bg-white/[.08] hover:text-white"
                >
                  <Pencil size={16} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <Notice ok={sent} />
      <p className="m-0 text-[13px] text-white/70">{note}</p>

      {open ? (
        <ChangeRequestDialog
          initialField={open}
          current={current}
          onClose={() => setOpen(null)}
          onSent={(message) => {
            setOpen(null);
            setSent(message);
          }}
        />
      ) : null}
    </Card>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={disabled || pending} className={`${btn.primary} h-10 px-5 text-[15px]`}>
      {pending ? t.common.pleaseWait : t.profileExtra.change.submit} <Send size={16} />
    </button>
  );
}

function ChangeRequestDialog({
  initialField,
  current,
  onClose,
  onSent,
}: {
  initialField: string;
  current: Record<string, string | null>;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const t = useT();
  const tx = t.profileExtra.change;
  const [state, action] = useFormState<FormState, FormData>(submitChangeRequestAction, undefined);
  const [field, setField] = useState(initialField);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (state?.ok) onSent(state.ok);
  }, [state, onSent]);

  return (
    <Dialog title={tx.title} onClose={onClose}>
      <form action={action} className="flex flex-col gap-4">
        <p className="m-0 text-[15px]">{tx.intro}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-white/70">{tx.field}</span>
          <select name="field" value={field} onChange={(e) => setField(e.target.value)} className={selectClass}>
            {Object.keys(tx.fields).map((k) => (
              <option key={k} value={k}>
                {tx.fields[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[13px] text-white/70">
          {tx.current} <span className="text-white">{(field !== "other" && current[field]) || "–"}</span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold">{tx.newValue}</span>
          <input
            name="newValue"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={500}
            placeholder={tx.newValue}
            autoFocus
            className={`${inputClass} h-[50px] text-[17px]`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-white/70">{tx.note}</span>
          <textarea name="note" rows={3} maxLength={1000} placeholder={tx.notePlaceholder} className={`${inputClass} resize-y py-3 leading-snug`} />
        </label>
        <FormError>{state?.error}</FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn.ghost} h-10 px-3 text-[15px]`}>
            {t.common.cancel}
          </button>
          <SubmitButton disabled={!value.trim()} />
        </div>
      </form>
    </Dialog>
  );
}
