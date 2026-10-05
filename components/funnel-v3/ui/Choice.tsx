"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  Briefcase,
  Building,
  Building2,
  Hammer,
  Home,
  House,
  KeyRound,
  Mountain,
  Repeat,
  Ruler,
  User,
  type LucideIcon,
} from "lucide-react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { CARD_KEYS, HINT_KEYS, OPTIONS, deltaLabel, fieldId, optionDelta, type ChoiceKey } from "../logic";
import type { ReqState } from "@/lib/funnel-v3/requirements";

/** The prototype's card icons (design-system names → lucide). */
const ICONS: Record<string, LucideIcon> = {
  "Neue Hypothek": KeyRound,
  Ablösung: Repeat,
  "Natürliche Person": User,
  "Juristische Person": Briefcase,
  "Bestehende Immobilie": Home,
  Neubau: Hammer,
  Bauprojekt: Ruler,
  Einfamilienhaus: House,
  Stockwerkeigentum: Building2,
  Mehrfamilienhaus: Building,
  Ferienobjekt: Mountain,
};

export interface ChoiceProps {
  /** The question; also the i18n group of the option labels (`opt.<key>.<value>`). */
  qkey: ChoiceKey;
  value: string | undefined;
  onChange: (value: string) => void;
  /** State the «+N Unterlagen» badges are measured on; no badges without it. */
  reqState?: ReqState;
  /** Per-borrower questions: whose answer it is. */
  borrowerId?: string;
  /** Field name for errors and focus (defaults to the key). */
  field?: string;
  /** Label override; defaults to `q.<key>`. */
  label?: string;
  /** Label only for assistive technology (Anrede in the prototype has none on screen). */
  hideLabel?: boolean;
  /** One row: label left, options right (the Eigenmittel card). */
  row?: boolean;
  error?: string;
  children?: ReactNode;
}

/**
 * A single-choice question as chips or cards, with radio-group semantics: one tab stop,
 * arrow keys move and select, Space / Enter select.
 */
export default function Choice({
  qkey,
  value,
  onChange,
  reqState,
  borrowerId,
  field,
  label,
  hideLabel,
  row,
  error,
  children,
}: ChoiceProps) {
  const { t, opt } = useFunnelT();
  const uid = useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const options = OPTIONS[qkey];
  const card = CARD_KEYS.has(qkey);
  const hintKey = HINT_KEYS[qkey];
  const name = field ?? qkey;
  const selectedIndex = options.findIndex((o) => o === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(k)) return;
    e.preventDefault();
    e.stopPropagation();
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const from = current >= 0 ? current : tabStop;
    let to = from;
    if (k === "ArrowRight" || k === "ArrowDown") to = (from + 1) % options.length;
    else if (k === "ArrowLeft" || k === "ArrowUp") to = (from - 1 + options.length) % options.length;
    else if (k === "Home") to = 0;
    else if (k === "End") to = options.length - 1;
    onChange(options[to]);
    refs.current[to]?.focus();
  };

  const describedBy = [hintKey && !row ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;

  const group = (
    <div
      id={fieldId(name)}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={`v3-opts${row ? " v3-opts--tight" : ""}`}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const selected = o === value;
        const n = reqState ? optionDelta(reqState, qkey, o, borrowerId) : 0;
        const d = deltaLabel(n, t);
        const Icon = card ? ICONS[o] : undefined;
        return (
          <button
            key={o}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabStop ? 0 : -1}
            className={card ? "v3-card" : "v3-chip"}
            onClick={() => onChange(o)}
          >
            {Icon ? <Icon className="v3-card-icon" size={26} strokeWidth={1.75} aria-hidden="true" /> : null}
            <span>{opt(qkey, o)}</span>
            {d ? (
              <span className="v3-delta">
                <span className="v3-delta-short">{d.short}</span>
                <span className="v3-delta-long">{d.long}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const labelEl = (
    <span id={labelId} className={hideLabel ? "v3-sr-only" : "v3-q-label"}>
      {label ?? t(`q.${qkey}`)}
    </span>
  );

  return (
    <div className={`${row ? "v3-qrow" : "v3-q"}${error ? " has-error" : ""}`}>
      {labelEl}
      {group}
      {!row && hintKey ? (
        <span id={hintId} className="v3-note">
          {t(hintKey)}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="v3-error" role="alert">
          {t(error)}
        </span>
      ) : null}
      {children}
    </div>
  );
}
