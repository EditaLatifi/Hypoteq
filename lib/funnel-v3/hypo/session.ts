/**
 * HYPO's own state beside the funnel store (Konzept Kap. 5): who is typing, what was answered or
 * confirmed in the chat, what waits for a «stimmt das?», which offers were made. The answers
 * themselves live in the funnel store — HYPO writes there through its actions, so the form, the
 * documents and the submit see exactly what the chat recorded.
 */

import type { HypoKey, HypoValue } from "./fields";

/** Kap. 4: Kunde (default), Vermittler / Vertriebspartner, HYPOTEQ-Berater (start toggle). */
export type HypoRole = "kunde" | "partner" | "berater";

/** A value from a message whose Ampel is yellow or red: not stored until confirmed (Kap. 1.2). */
export interface PendingValue {
  key: HypoKey;
  value: HypoValue;
  confidence: number;
}

/** A name match from Salesforce (Kap. 4): never an id, never an address. */
export interface PartnerMatch {
  name: string;
  company: string | null;
}

/** The offers of Kap. 6 — each made at most once per conversation. */
export type Offer = "broker" | "academy" | "bewertung" | "language";

/**
 * Kap. 6 Immobilienbewertung (HYPOTEQ 29.10.2026, point 4): HYPO offers this link, the customer
 * answers the questions there; the chat gives no advice and still sets «Bewertung angefragt».
 */
export const BEWERTUNG_URL = "https://hypoteq-hedonic.wuestappraisal.com";

export interface HypoSession {
  role: HypoRole;
  /** The first message was sent: the partner chip is gone (Kap. 4). */
  started: boolean;
  /** Keys answered or confirmed in the chat (a «Nein» counts, though it is the default). */
  answered: HypoKey[];
  /** Questions closed without a value: skipped optional ones, multiple choice answered, offers made. */
  closed: string[];
  /** Yellow / red values waiting for one question each, oldest first. */
  confirm: PendingValue[];
  /** The question on screen. */
  current: string | null;
  /** The offer on screen, asked before the next question. */
  offer: Offer | null;
  /** Eigenmittel sources picked, each still to get its amount. */
  emSources: string[];
  /** «250'000 Eigenkapital» before its source is known. */
  emTotal: number;
  bank: string;
  ablauf: string;
  adresse: string;
  /** Kap. 6 Immobilienbewertung: true once ordered. */
  bewertung: boolean;
  /** The academy link was given. */
  academy: boolean;
  /** The Säule 3a / PK sentence was said. */
  pensionNoted: boolean;
  partnerMatch: PartnerMatch | null;
  /** The name search ran (with or without a hit). */
  partnerSearched: boolean;
  /** «Du bist … ?» answered. */
  partnerConfirmed: boolean | null;
  /** The e-mail recognition answered for txt.bmail: «partner», «hypoteq» or «unknown». */
  partnerStatus: "partner" | "hypoteq" | "unknown" | null;
  /** Unreadable messages in a row (Kap. 6: two → offer language or the form). */
  misses: number;
  /** The model answered at least once / failed: null = not asked yet. */
  llm: boolean | null;
}

export function initialSession(role: HypoRole = "kunde"): HypoSession {
  return {
    role,
    started: false,
    answered: [],
    closed: [],
    confirm: [],
    current: null,
    offer: null,
    emSources: [],
    emTotal: 0,
    bank: "",
    ablauf: "",
    adresse: "",
    bewertung: false,
    academy: false,
    pensionNoted: false,
    partnerMatch: null,
    partnerSearched: false,
    partnerConfirmed: null,
    partnerStatus: null,
    misses: 0,
    llm: null,
  };
}

/** A message in the conversation. HYPO's texts are message keys, so a language switch re-renders them. */
export type HypoMessage =
  | { id: string; from: "user"; kind: "text"; text: string; at: string }
  | { id: string; from: "hypo"; kind: "text"; key: string; params?: Record<string, string | number>; at: string }
  | { id: string; from: "hypo"; kind: "link"; key: string; url: string; label?: string; at: string }
  | { id: string; from: "hypo"; kind: "recognised"; items: RecognisedItem[]; notes?: string[]; at: string }
  | { id: string; from: "hypo"; kind: "document"; fileId: string; at: string }
  | { id: string; from: "hypo"; kind: "conflict"; fieldId: string; at: string }
  | { id: string; from: "hypo"; kind: "summary"; at: string };

export interface RecognisedItem {
  key: HypoKey;
  value: HypoValue;
  confidence: number;
}
