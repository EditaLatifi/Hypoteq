"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useFunnelV3 } from "@/lib/funnel-v3/store";
import { useFunnelT } from "@/lib/funnel-v3/useFunnelT";
import { LANGS, type Lang } from "@/lib/funnel-v3/i18n";
import { filesFromInput, screenFiles, addPickedFiles, ACCEPTED_EXTENSIONS } from "@/lib/funnel-v3/upload";
import { getRequirement } from "@/lib/funnel-v3/requirements";
import { formatParams, optionText } from "@/lib/funnel-v3/hypo/engine";
import { questionById, type Question } from "@/lib/funnel-v3/hypo/flow";
import type { HypoMessage } from "@/lib/funnel-v3/hypo/session";
import type { AbgleichField } from "@/lib/funnel-v3/abgleich/evaluate";
import LanguageSwitch, { useSwitchLanguage } from "../LanguageSwitch";
import { useAbgleich } from "../finish/useAbgleich";
import { useFunnelState } from "../hooks";
import DossierPanel from "./DossierPanel";
import { ConflictCard, DocumentCard, LinkCard, RecognisedCard, SummaryCard } from "./HypoCards";
import { HypoFace, HypoWordmark } from "./HypoMark";
import {
  FORM,
  SKIP,
  UNKNOWN,
  announceConflict,
  announceFile,
  choosePartner,
  closeHypo,
  hypoEvent,
  leaveToForm,
  pickChip,
  sendText,
} from "./controller";
import { loadHypoConfig, useHypo } from "./hypoStore";

/** Kap. 7 «kontextuelle Upload-Chips»: the document that answers the question on screen. */
const UPLOAD_FOR: Record<string, string> = {
  inc: "lohnausweise",
  job: "lohnausweise",
  old: "hyp_zins",
  ablauf: "hyp_zins",
  bank: "hyp_zins",
  name: "id",
  kaufpreis: "kaufvertrag",
  firma: "hr",
};

const SUGGESTIONS = [
  { key: "hypo.suggest.1", chip: "hypo.suggestChip.1", intent: "kauf" },
  { key: "hypo.suggest.2", chip: "hypo.suggestChip.2", intent: "abloesung" },
  { key: "hypo.suggest.3", chip: "hypo.suggestChip.3", intent: "neubau_wert_offen" },
];

/** Kap. 3: the examples rotate as the placeholder (~4 s) until the field is focused or typed in. */
function useRotatingPlaceholder(active: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % SUGGESTIONS.length), 4000);
    return () => window.clearInterval(id);
  }, [active]);
  return i;
}

interface ChipDef {
  value: string;
  label: string;
  disabled?: boolean;
}

/** The chips of what is on screen: an offer, a «stimmt das?», or the question's options. */
function useChips(q: Question | null, current: string | null, offer: string | null, lang: Lang, t: (k: string, p?: Record<string, string | number>) => string): { chips: ChipDef[]; multi: boolean } {
  return useMemo(() => {
    const yn = (yes = "hypo.chip.yes", no = "hypo.chip.no"): ChipDef[] => [
      { value: "Ja", label: t(yes) },
      { value: "Nein", label: t(no) },
    ];
    if (offer === "language") return { chips: [...LANGS.filter((l) => l !== lang).map((l) => ({ value: l, label: l.toUpperCase() })), { value: FORM, label: t("hypo.chip.form") }], multi: false };
    if (offer) return { chips: yn(), multi: false };
    if (current === "confirm" || current?.startsWith("doc:")) return { chips: yn("hypo.chip.confirmYes", "hypo.chip.confirmNo"), multi: false };
    if (!q) return { chips: [], multi: false };
    const extra: ChipDef[] = [];
    if (q.unknown) extra.push({ value: UNKNOWN, label: t("hypo.chip.unknown") });
    if (q.optional && q.kind !== "multi") extra.push({ value: SKIP, label: t("hypo.chip.skip") });
    if (q.kind === "yesno") return { chips: [...yn(), ...extra], multi: false };
    if (q.kind === "choice") return { chips: [...(q.options ?? []).map((o) => ({ value: o, label: optionText(q, o, lang), disabled: q.disabled?.includes(o) })), ...extra], multi: false };
    if (q.kind === "multi") return { chips: (q.options ?? []).map((o) => ({ value: o, label: optionText(q, o, lang) })), multi: true };
    return { chips: extra, multi: false };
  }, [q, current, offer, lang, t]);
}

function MessageView({ m, fields }: { m: HypoMessage; fields: readonly AbgleichField[] }) {
  const { t, lang } = useFunnelT();
  if (m.from === "user") return <div className="v3-hypo-msg v3-hypo-msg--user">{m.text}</div>;
  let body: ReactNode = null;
  switch (m.kind) {
    case "text":
      body = t(m.key, m.params ? formatParams(m.params, lang) : undefined);
      break;
    case "link":
      body = <LinkCard textKey={m.key} url={m.url} />;
      break;
    case "recognised":
      return <RecognisedCard items={m.items} notes={m.notes} />;
    case "document":
      return <DocumentCard fileId={m.fileId} />;
    case "conflict":
      return <ConflictCard field={fields.find((f) => f.id === m.fieldId)} />;
    case "summary":
      return <SummaryCard />;
  }
  return <div className="v3-hypo-msg v3-hypo-msg--hypo">{body}</div>;
}

/**
 * Kap. 7: a file dropped in the chat gets its card at once (the card follows the pipeline). Each
 * conflict between a chat answer and one of those files that the customer can decide gets its
 * own card; the rest (identity) stays for the Abgleich page before the submit.
 */
function useConflictWatch(conflicts: readonly AbgleichField[]) {
  const shownFiles = useHypo((s) => s.shownFiles);
  useEffect(() => {
    for (const f of conflicts) {
      if (f.choosable && f.against && shownFiles.includes(f.against.docId)) announceConflict(f.id);
    }
  }, [conflicts, shownFiles]);
}

export default function HypoChat() {
  const { t, lang } = useFunnelT();
  const switchLanguage = useSwitchLanguage();
  const messages = useHypo((s) => s.messages);
  const session = useHypo((s) => s.session);
  const busy = useHypo((s) => s.busy);
  const state = useFunnelState();
  const [text, setText] = useState("");
  const [rotating, setRotating] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const placeholder = useRotatingPlaceholder(rotating && !session.started);

  const abgleich = useAbgleich();
  useConflictWatch(abgleich.conflicts);
  useEffect(() => {
    void loadHypoConfig();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);
  // A turned phone or an opened keyboard shrinks the list: the latest message stays in view.
  useEffect(() => {
    const keep = () => listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    window.addEventListener("resize", keep);
    return () => window.removeEventListener("resize", keep);
  }, []);

  const q = useMemo(() => questionById(session.current, state, session), [session, state]);
  const { chips, multi } = useChips(q, session.current, session.offer, lang, t);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [session.current]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setText("");
    void sendText(v, lang);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    setRotating(false);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  const onChip = (c: ChipDef) => {
    if (busy || c.disabled) return;
    if (session.offer === "language" && c.value !== FORM) switchLanguage(c.value as Lang);
    void pickChip([c.value], [c.label], session.offer === "language" && c.value !== FORM ? (c.value as Lang) : lang);
  };
  const onMultiDone = () => {
    if (busy) return;
    const labels = chips.filter((c) => picked.includes(c.value)).map((c) => c.label);
    void pickChip(picked, labels, lang);
  };
  const onFiles = (list: FileList | null) => {
    const { accepted } = screenFiles(filesFromInput(list));
    if (!accepted.length) return;
    const entries = addPickedFiles(accepted);
    for (const e of entries) announceFile(e.id);
    hypoEvent("upload", session.current ?? "start");
    if (fileRef.current) fileRef.current.value = "";
  };
  const applySuggestion = (i: number) => {
    setText(t(SUGGESTIONS[i].key).replace(/…$/, ""));
    setRotating(false);
    hypoEvent("suggestion", SUGGESTIONS[i].intent);
    inputRef.current?.focus();
  };

  const showExample = rotating && !session.started && !text;
  const uploadReq = q ? UPLOAD_FOR[q.id] : undefined;
  const uploadLabel = uploadReq ? getRequirement(uploadReq) : undefined;
  const isPartnerView = session.role !== "kunde";

  return (
    <div className="v3-hypo" data-role={session.role}>
      <header className="v3-hypo-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="v3-hypo-logo" src="/images/HYPOTEQ_layout_logo_white.png" alt="HYPOTEQ" />
        <span className="v3-hypo-who">
          <HypoFace size={34} title="HYPO" />
          <span className="v3-hypo-who-text">
            <HypoWordmark />
            <span className="v3-hypo-who-sub">{t("hypo.name").replace(/^HYPO\s*—\s*/, "")}</span>
          </span>
        </span>
        <span className="v3-hypo-head-actions">
          <LanguageSwitch dark compact />
          {session.started ? (
            <button type="button" className="v3-hypo-ghost" onClick={() => leaveToForm("button")}>
              {t("hypo.toForm")}
            </button>
          ) : (
            <button type="button" className="v3-hypo-ghost" onClick={closeHypo}>
              {t("hypo.back")}
            </button>
          )}
        </span>
      </header>

      <div className="v3-hypo-body">
        <section className="v3-hypo-chat">
          <div className="v3-hypo-messages" ref={listRef} aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <div key={m.id} className={`v3-hypo-line v3-hypo-line--${m.from}`}>
                {m.from === "hypo" ? <HypoFace size={26} className="v3-hypo-avatar" /> : null}
                <MessageView m={m} fields={abgleich.fields} />
              </div>
            ))}
            {busy ? (
              <div className="v3-hypo-line v3-hypo-line--hypo">
                <HypoFace size={26} className="v3-hypo-avatar v3-hypo-typing" title={t("hypo.typing")} />
                <span className="v3-hypo-msg v3-hypo-msg--hypo v3-hypo-dots" aria-label={t("hypo.typing")}>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ) : null}
          </div>

          {chips.length || uploadLabel ? (
            <div className="v3-hypo-chips" role="group">
              {chips.map((c) =>
                multi ? (
                  <button
                    key={c.value}
                    type="button"
                    className="v3-hypo-chip"
                    aria-pressed={picked.includes(c.value)}
                    disabled={busy}
                    onClick={() => setPicked((p) => (p.includes(c.value) ? p.filter((x) => x !== c.value) : [...p, c.value]))}
                  >
                    {c.label}
                  </button>
                ) : (
                  <button key={c.value} type="button" className="v3-hypo-chip" disabled={busy || c.disabled} onClick={() => onChip(c)}>
                    {c.label}
                  </button>
                )
              )}
              {multi ? (
                <button type="button" className="v3-hypo-chip v3-hypo-chip--go" disabled={busy} onClick={onMultiDone}>
                  {picked.length ? t("hypo.chip.done") : t("hypo.chip.none")}
                </button>
              ) : null}
              {uploadLabel ? (
                <button type="button" className="v3-hypo-chip v3-hypo-chip--upload" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {t("hypo.chip.upload", { doc: t(uploadLabel.labelKey) })}
                </button>
              ) : null}
            </div>
          ) : null}

          {!session.started ? (
            <div className="v3-hypo-suggest" role="group" aria-label={t("hypo.suggestLabel")}>
              {SUGGESTIONS.map((s, i) => (
                <button key={s.key} type="button" className="v3-hypo-chip v3-hypo-chip--soft" onClick={() => applySuggestion(i)}>
                  {t(s.chip)}
                </button>
              ))}
            </div>
          ) : null}

          <form className="v3-hypo-composer" onSubmit={submit}>
            <button type="button" className="v3-hypo-attach" aria-label={t("hypo.attach")} title={t("hypo.attach")} onClick={() => fileRef.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
              onChange={(e) => onFiles(e.target.files)}
            />
            <span className="v3-hypo-field">
              <textarea
                ref={inputRef}
                className="v3-hypo-input"
                aria-label={t("hypo.input.label")}
                rows={1}
                value={text}
                maxLength={1500}
                placeholder={showExample ? "" : t(session.started ? "hypo.input.label" : SUGGESTIONS[placeholder].key)}
                onFocus={() => setRotating(false)}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
              />
              {showExample ? (
                // Kap. 3: the examples fade in turn over the empty field (a placeholder cannot fade).
                <span key={placeholder} className="v3-hypo-example" aria-hidden="true">
                  {t(SUGGESTIONS[placeholder].key)}
                </span>
              ) : null}
            </span>
            <button type="submit" className="v3-hypo-send" disabled={busy || !text.trim()} aria-label={t("hypo.send")}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>

          <div className="v3-hypo-foot">
            {!session.started && !isPartnerView ? (
              <button type="button" className="v3-hypo-partner" onClick={() => void choosePartner(lang)}>
                {t("hypo.partnerChip")}
              </button>
            ) : null}
            <span className="v3-hypo-notice">{t("hypo.notice")}</span>
            <span className="v3-hypo-notice">
              {t("hypo.privacy").split("{link}")[0]}
              <a href={`/${lang}/agb`} target="_blank" rel="noopener noreferrer">
                {t("hypo.privacyLink")}
              </a>
              {t("hypo.privacy").split("{link}")[1] ?? ""}
            </span>
          </div>
        </section>
        <DossierPanel />
      </div>
    </div>
  );
}
