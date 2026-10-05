"use client";

import { useLayoutEffect, useRef, type ChangeEvent, type HTMLInputTypeAttribute } from "react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { chf, parseAmount } from "@/lib/funnel-v3/format";
import { fieldId } from "../logic";

interface BaseProps {
  /** Field name (validation key); the DOM id is derived from it. */
  field: string;
  label: string;
  placeholder?: string;
  hint?: string;
  /** i18n key of the validation message, shown under the field. */
  error?: string;
  className?: string;
}

function useIds(field: string) {
  const id = fieldId(field);
  return { id, hintId: `${id}-hint`, errId: `${id}-err` };
}

function Messages({ hint, error, hintId, errId }: { hint?: string; error?: string; hintId: string; errId: string }) {
  const { t } = useFunnelT();
  return (
    <>
      {hint ? (
        <span id={hintId} className="v3-field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="v3-error" role="alert">
          {t(error)}
        </span>
      ) : null}
    </>
  );
}

const describedBy = (hint: string | undefined, error: string | undefined, hintId: string, errId: string) =>
  [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;

export function TextField({
  field,
  label,
  placeholder,
  hint,
  error,
  className,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  const { id, hintId, errId } = useIds(field);
  return (
    <div className={`v3-field${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="v3-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="v3-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errId)}
        onChange={(e) => onChange(e.target.value)}
      />
      <Messages hint={hint} error={error} hintId={hintId} errId={errId} />
    </div>
  );
}

const digitsBefore = (s: string, pos: number) => s.slice(0, pos).replace(/\D/g, "").length;

/** Position just after the n-th digit of s (0 → right after the «CHF » prefix). */
function caretAfterDigits(s: string, n: number): number {
  if (n <= 0) {
    const first = s.search(/\d/);
    return first < 0 ? s.length : first;
  }
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (/\d/.test(s[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return s.length;
}

/**
 * A CHF amount, formatted while typing (`CHF 449'000`, spec 1.7). The caret stays behind the
 * same digit when the grouping changes. 0 shows as empty (amounts default to 0, types.ts).
 */
export function AmountField({
  field,
  label,
  placeholder = "CHF",
  hint,
  error,
  className,
  value,
  onChange,
  disabled,
}: BaseProps & { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const { id, hintId, errId } = useIds(field);
  const ref = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const shown = value > 0 ? chf(value) : "";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretDigits.current === null || document.activeElement !== el) return;
    const pos = caretAfterDigits(shown, caretDigits.current);
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [shown]);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Whole francs: a decimal part typed by habit is dropped, not multiplied into the amount.
    const n = Math.round(parseAmount(raw));
    caretDigits.current = digitsBefore(raw, e.target.selectionStart ?? raw.length);
    onChange(n);
  };

  return (
    <div className={`v3-field${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="v3-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className="v3-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errId)}
        onChange={handle}
      />
      <Messages hint={hint} error={error} hintId={hintId} errId={errId} />
    </div>
  );
}

export function TextArea({
  field,
  label,
  placeholder,
  hint,
  error,
  className,
  value,
  onChange,
  rows = 3,
}: BaseProps & { value: string; onChange: (value: string) => void; rows?: number }) {
  const { id, hintId, errId } = useIds(field);
  return (
    <div className={`v3-field${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}>
      <label className="v3-field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="v3-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, hintId, errId)}
        onChange={(e) => onChange(e.target.value)}
      />
      <Messages hint={hint} error={error} hintId={hintId} errId={errId} />
    </div>
  );
}
