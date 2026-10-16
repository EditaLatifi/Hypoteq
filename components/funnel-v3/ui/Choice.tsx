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
  Repeat,
  Ruler,
  User,
  type LucideIcon,
} from "lucide-react";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import type { FieldPath } from "@/lib/funnel-v3/types";
import { CARD_KEYS, HINT_KEYS, OPTIONS, deltaLabel, fieldId, optionDelta, type ChoiceKey } from "../logic";
import type { ReqState } from "@/lib/funnel-v3/requirements";
import FromDoc from "./FromDoc";

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
};

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Prototype scrollNext: after a card was picked, the next question comes into view (Handover 2
 * «Karte, springt automatisch zur nächsten Frage»). Questions carry `data-q`.
 */
function scrollToNextQuestion(from: HTMLElement | null) {
  if (!from || typeof window === "undefined") return;
  window.setTimeout(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-q]"));
    const next = all[all.indexOf(from) + 1];
    if (!next) return;
    window.scrollTo({ top: next.getBoundingClientRect().top + window.scrollY - 120, behavior: reducedMotion() ? "auto" : "smooth" });
  }, 80);
}

export interface ChoiceProps {
  /** The question; also the i18n group of the option labels (`opt.<key>.<value>`). */
  qkey: ChoiceKey;
  value: string | undefined;
  onChange: (value: string) => void;
  /** The options to offer when the state limits them (Nutzung per Kreditnehmer); default OPTIONS. */
  options?: readonly string[];
  /** Options shown but not selectable (Bauprojekt at an Ablösung, Handover 2). */
  disabled?: readonly string[];
  /** Why they are not selectable (tooltip of the option; the hint line says it too). */
  disabledTitle?: string;
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
  /** Hint under the options (default: HINT_KEYS). */
  hint?: string | null;
  /** The answer's «aus Dokument» mark (Schnellanmeldung, Handover 3). */
  source?: FieldPath;
  /** One row: label left, options right. */
  row?: boolean;
  error?: string;
  children?: ReactNode;
}

/**
 * A single-choice question as chips or cards, with radio-group semantics: one tab stop,
 * arrow keys move and select, Space / Enter select. Every option shows how many documents it
 * adds («+2 Unterlagen», Handover 2).
 */
export default function Choice({
  qkey,
  value,
  onChange,
  options: offered,
  disabled = [],
  disabledTitle,
  reqState,
  borrowerId,
  field,
  label,
  hideLabel,
  hint,
  source,
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
  const wrap = useRef<HTMLDivElement>(null);
  const options = offered ?? OPTIONS[qkey];
  const card = CARD_KEYS.has(qkey);
  const hintText = hint === undefined ? (HINT_KEYS[qkey] ? t(HINT_KEYS[qkey]!) : null) : hint;
  const name = field ?? qkey;
  const off = new Set(disabled);
  const selectedIndex = options.findIndex((o) => o === value);
  const firstOn = options.findIndex((o) => !off.has(o));
  const tabStop = selectedIndex >= 0 ? selectedIndex : Math.max(firstOn, 0);

  const pick = (o: string, scroll: boolean) => {
    if (off.has(o)) return;
    onChange(o);
    if (scroll && card) scrollToNextQuestion(wrap.current);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(k)) return;
    e.preventDefault();
    e.stopPropagation();
    const on = options.map((o, i) => (off.has(o) ? -1 : i)).filter((i) => i >= 0);
    if (!on.length) return;
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const from = on.indexOf(current >= 0 ? current : tabStop);
    let to = from < 0 ? 0 : from;
    if (k === "ArrowRight" || k === "ArrowDown") to = (to + 1) % on.length;
    else if (k === "ArrowLeft" || k === "ArrowUp") to = (to - 1 + on.length) % on.length;
    else if (k === "Home") to = 0;
    else if (k === "End") to = on.length - 1;
    const idx = on[to];
    pick(options[idx], false);
    refs.current[idx]?.focus();
  };

  const describedBy = [hintText && !row ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;

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
        const isOff = off.has(o);
        const n = reqState && !isOff ? optionDelta(reqState, qkey, o, borrowerId) : 0;
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
            aria-disabled={isOff ? true : undefined}
            title={isOff ? disabledTitle : undefined}
            tabIndex={i === tabStop ? 0 : -1}
            className={`${card ? "v3-card" : "v3-chip"}${isOff ? " is-off" : ""}`}
            onClick={() => pick(o, true)}
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

  const text = label ?? t(`q.${qkey}`);
  const mark = source ? <FromDoc path={source} label={hideLabel ? text : undefined} /> : null;

  return (
    <div ref={wrap} data-q={qkey} className={`${row ? "v3-qrow" : "v3-q"}${error ? " has-error" : ""}`}>
      {hideLabel ? (
        <span id={labelId} className="v3-sr-only">
          {text}
        </span>
      ) : (
        <span className="v3-q-head">
          <span id={labelId} className="v3-q-label">
            {text}
          </span>
          {mark}
        </span>
      )}
      {group}
      {hideLabel ? mark : null}
      {!row && hintText ? (
        <span id={hintId} className="v3-note">
          {hintText}
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
