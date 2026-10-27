/**
 * HYPO without the model: reading a typed answer to the question that was asked. Pure.
 *
 * Two uses (Konzept Kap. 9 «Fallback»): when the language model is not reachable, HYPO keeps
 * going on chips and these readers; and when an answer is plainly just the answer («1.2 Mio»,
 * «max@muster.ch», «ja»), no model call is made for it at all.
 *
 * The readers know the four funnel languages. They return funnel values (German, spec 7) and
 * never guess: an answer that does not read cleanly is null, and the caller asks the model or
 * asks again.
 */

import { coerce, normaliseDate, normaliseMonth, type HypoKey, type HypoValue } from "./fields";

const lower = (s: string) => s.toLowerCase().normalize("NFC");

/** «1.2 Mio», «1,2 Millionen», «250k», «250'000», «CHF 1 200 000», «850 mila» → francs; null when none. */
export function readAmount(text: string): number | null {
  const s = lower(text).replace(/chf|fr\.|sfr\.?/g, " ");
  const unit = String.raw`(mio\.?|millionen|million(?:s)?|milioni|milione|mln|m(?![a-z])|k(?![a-z])|tsd\.?|tausend|mille|mila)`;
  const isMillion = (u: string) => /^(mio|million|milion|mln|m$)/.test(u);
  // «1.200.000», «250.000»: a «.» or «,» before groups of exactly three digits groups thousands —
  // except «1.250 Mio», which is a decimal.
  const grouped = s.match(new RegExp(String.raw`(\d{1,3}(?:[.,]\d{3})+)(?![\d.,])\s*${unit}?`, "u"));
  if (grouped && !(grouped[2] && isMillion(grouped[2]) && grouped[1].split(/[.,]/).length === 2)) {
    const factor = grouped[2] ? (isMillion(grouped[2]) ? 1_000_000 : 1_000) : 1;
    const r = Math.round(Number(grouped[1].replace(/[.,]/g, "")) * factor);
    return Number.isFinite(r) && r >= 1000 ? r : null;
  }
  // Apostrophes, spaces and no-break spaces group thousands («250'000», «1 200 000»).
  const m = s.match(new RegExp(String.raw`(\d{1,3}(?:['’\u00a0 ]\d{3})+|\d+)(?:[.,](\d+))?\s*${unit}?`, "u"));
  if (!m) return null;
  const intPart = m[1].replace(/['’\u00a0 ]/g, "");
  const u = m[3] ?? "";
  const factor = isMillion(u) ? 1_000_000 : u ? 1_000 : 1;
  const n = Number(`${intPart}.${m[2] || "0"}`) * factor;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  // Every amount HYPO asks for is in the thousands; «8» or «1.2» alone is not an answer.
  return r >= 1000 ? r : null;
}

// A word ends at a space, punctuation or the end (\b does not know «sì» or «nö»).
const YES = /^(ja|jo|jep|jawohl|genau|klar|richtig|stimmt|korrekt|gerne|yes|yeah|yep|sure|correct|right|oui|exact|exactement|d'accord|volontiers|si|sì|certo|esatto|giusto|volentieri)(?=$|[\s,.!?;:)»"'])/u;
const NO = /^(nein|nö|ne|nee|nicht|keine?|no|nope|not|non|pas|aucun|nessun[oa]?)(?=$|[\s,.!?;:)»"'])/u;

/** Ja / Nein from the start of an answer («Ja, genau», «non merci»); null when unclear. */
export function readYesNo(text: string): "Ja" | "Nein" | null {
  const s = lower(text).trim().replace(/^[«"'(]+/, "");
  if (YES.test(s)) return "Ja";
  if (NO.test(s)) return "Nein";
  return null;
}

/** Words that name an option, per funnel value, in the four languages (lower case, prefixes). */
const SYNONYMS: Record<string, Record<string, readonly string[]>> = {
  "ans.antrag": {
    "Neue Hypothek": ["kauf", "kaufen", "erwerb", "neue hypothek", "neu", "buy", "buying", "purchase", "new mortgage", "achat", "acheter", "acquérir", "nouvelle", "acquist", "comprare", "compra", "nuova ipoteca"],
    "Ablösung": ["ablös", "ablos", "verläng", "erneuer", "umschuld", "refinanc", "renew", "remortgage", "extend", "renouvel", "refinanc", "prolong", "rinnov", "rifinanz", "prolung", "sostitu"],
  },
  "ans.kn": {
    "Natürliche Person": ["privat", "natürlich", "ich selbst", "wir selbst", "private", "personal", "myself", "privé", "personne physique", "moi-même", "privat", "persona fisica", "privato", "io stesso"],
    "Juristische Person": ["firma", "gmbh", "ag", "unternehmen", "gesellschaft", "juristisch", "company", "business", "corporate", "ltd", "entreprise", "société", "sàrl", "personne morale", "azienda", "società", "sagl", "persona giuridica"],
  },
  "ans.anrede": {
    Herr: ["herr", "mr", "mister", "monsieur", "m.", "signor"],
    Frau: ["frau", "mrs", "ms", "madame", "mme", "signora"],
  },
  "ans.immo": {
    "Bestehende Immobilie": ["bestehend", "bestand", "altbau", "existing", "existant", "existante", "esistente"],
    Neubau: ["neubau", "neu gebaut", "erstbezug", "new build", "newly built", "neuf", "construction neuve", "nuova costruzione", "nuovo"],
    Bauprojekt: ["bauprojekt", "bauen", "selbst bauen", "construction project", "build", "building", "projet de construction", "construire", "progetto di costruzione", "costruire"],
  },
  "ans.lieg": {
    Einfamilienhaus: ["einfamilienhaus", "efh", "haus", "house", "detached", "maison", "villa", "casa unifamiliare", "casa"],
    Stockwerkeigentum: ["stockwerkeigentum", "stwe", "wohnung", "eigentumswohnung", "apartment", "flat", "condo", "appartement", "ppe", "propriété par étages", "appartamento", "ppp", "proprietà per piani"],
    Mehrfamilienhaus: ["mehrfamilienhaus", "mfh", "multi-family", "apartment building", "immeuble", "maison plurifamiliale", "plurifamiliare", "palazzina"],
  },
  "ans.nutz": {
    "Vermietet & teilweise selbstbewohnt": ["teilweise", "teils", "partly", "partially", "partiellement", "en partie", "parzialmente", "in parte"],
    Selbstbewohnt: ["selbst bewohnt", "selbstbewohnt", "selber wohnen", "selbst wohnen", "eigennutz", "live in", "own use", "owner-occupied", "habiter", "occupé", "propre usage", "abitare", "uso proprio"],
    Vermietet: ["vermietet", "vermieten", "rendite", "rented", "rent out", "let", "investment", "loué", "louer", "rendement", "affittat", "affittare", "reddito"],
    Zweitwohnsitz: ["zweitwohn", "ferien", "second home", "holiday", "résidence secondaire", "vacances", "seconda casa", "vacanza"],
    Gewerbe: ["gewerbe", "geschäft", "büro", "commercial", "business", "office", "commerce", "bureau", "commerciale", "ufficio"],
  },
  "borrower.0.job": {
    Angestellt: ["angestellt", "arbeitnehmer", "employed", "employee", "salarié", "employé", "dipendente", "impiegat"],
    Selbständig: ["selbständig", "selbstständig", "freelance", "self-employed", "own business", "indépendant", "indipendente", "autonomo"],
    Pensioniert: ["pension", "rentner", "rente", "ruhestand", "retired", "retraité", "retraite", "pensionat", "in pensione"],
  },
  "ans.laufzeit": {
    SARON: ["saron"],
    Mix: ["mix", "kombin", "combin", "mélange", "misto"],
  },
};

/** Whether `w` starts a word of `s` (`s` padded with spaces); words of up to 3 letters must be whole. */
function hasWord(s: string, w: string): boolean {
  const word = w.trim();
  if (!word) return false;
  return word.length <= 3 ? s.includes(` ${word} `) : s.includes(` ${word}`);
}

/**
 * The option an answer names: the chip label in any language or a synonym. A hit inside a longer
 * hit of another option gives way to it («maison» to «maison plurifamiliale»). Null when the
 * answer names none or more than one.
 */
export function readOption(key: HypoKey, text: string, options: readonly string[], labels: readonly string[] = []): string | null {
  const s = ` ${lower(text).replace(/[^\p{L}\p{N}&'-]+/gu, " ").trim()} `;
  const matched = new Map<string, string[]>();
  options.forEach((value, i) => {
    const words = [value, labels[i] ?? "", ...(SYNONYMS[key]?.[value] ?? [])].map((w) => lower(w).replace(/[^\p{L}\p{N}&'-]+/gu, " ").trim()).filter(Boolean);
    const found = words.filter((w) => hasWord(s, w));
    if (found.length) matched.set(value, found);
  });
  if (key === "ans.laufzeit") {
    const years = s.match(/ (2|3|5|10) ?(jahre?|years?|ans?|anni) /);
    if (years) matched.set(`${years[1]} Jahre`, [years[0].trim()]);
  }
  // «Vermietet & teilweise selbstbewohnt» names «vermietet» and «selbstbewohnt» too: it wins.
  if (matched.has("Vermietet & teilweise selbstbewohnt")) return "Vermietet & teilweise selbstbewohnt";
  const hits = [...matched.entries()].filter(([value, words]) =>
    ![...matched.entries()].some(([other, longer]) => other !== value && words.every((w) => longer.some((l) => l !== w && l.includes(w))))
  );
  return hits.length === 1 ? hits[0][0] : null;
}

export function readEmail(text: string): string | null {
  const m = text.match(/[^\s@<>()«»"',;:]+@[^\s@<>()«»"',;:]+\.[a-z]{2,}/i);
  return m ? (coerce("txt.mail", m[0]) as string | null) : null;
}

export function readPhone(text: string): string | null {
  const m = text.match(/\+?\d[\d\s/().-]{7,}\d/);
  return m ? (coerce("txt.tel", m[0].trim()) as string | null) : null;
}

/** «8400 Winterthur», «Winterthur 8400», «8400» → PLZ and Ort (Ort may be empty). */
export function readPlace(text: string): { plz: string | null; ort: string | null } {
  const m = text.match(/\b([1-9]\d{3})\b/);
  const plz = m ? m[1] : null;
  const rest = text
    .replace(/\b[1-9]\d{3}\b/, " ")
    .replace(/^(in|bei|à|a|en|nach|near|vers)\s+/i, "")
    .replace(/[.,;!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const ort = rest && rest.length <= 40 && /^[\p{L}][\p{L}\p{M}' .()/-]*$/u.test(rest) ? rest : null;
  return { plz, ort };
}

const NAME_LEAD =
  /^(ich hei(ss|ß)e|ich bin|mein name ist|er hei(ss|ß)t|sie hei(ss|ß)t|my name is|i am|i'm|his name is|her name is|je m'appelle|je suis|il s'appelle|elle s'appelle|mi chiamo|sono|si chiama)\s+/i;

/** «Max Muster», «Ich heisse Anna Maria Beispiel» → first names and last name; null when not a name. */
export function readName(text: string): { vor: string; nach: string } | null {
  const s = text.trim().replace(NAME_LEAD, "").replace(/[.!]+$/, "").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return null;
  const nach = parts[parts.length - 1];
  const vor = parts.slice(0, -1).join(" ");
  return coerce("txt.vor", vor) && coerce("txt.nach", nach) ? { vor, nach } : null;
}

const MONTHS: readonly (readonly string[])[] = [
  ["jan", "janvier", "gennaio", "januar", "january"],
  ["feb", "février", "fevrier", "febbraio", "februar", "february"],
  ["mär", "mar", "märz", "maerz", "mars", "marzo", "march"],
  ["apr", "avril", "aprile", "april"],
  ["mai", "maggio", "may"],
  ["jun", "juin", "giugno", "juni", "june"],
  ["jul", "juillet", "luglio", "juli", "july"],
  ["aug", "août", "aout", "agosto", "august"],
  ["sep", "sept", "septembre", "settembre", "september"],
  ["okt", "oct", "octobre", "ottobre", "oktober", "october"],
  ["nov", "novembre", "november"],
  ["dez", "dec", "déc", "décembre", "dicembre", "dezember", "december"],
];

/** A month by name («März 2027», «end of march 2027») → MM.JJJJ. */
function readMonthName(s: string): string | null {
  const m = lower(s).match(/([a-zäéû]+)\.?\s+(\d{4})/u);
  if (!m) return null;
  const word = m[1];
  const idx = MONTHS.findIndex((names) => names.some((n) => word === n || (n.length >= 3 && word.startsWith(n) && word.length <= n.length + 6)));
  return idx >= 0 ? normaliseMonth(`${idx + 1}.${m[2]}`) || null : null;
}

/** A date (`TT.MM.JJJJ`) or, when `month`, also a month (`MM.JJJJ`). */
export function readDate(text: string, month = false): string | null {
  const t = text.trim();
  const full = t.match(/\b(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))\b/) || t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (full) {
    const d = normaliseDate(full[1]);
    if (d) return d;
  }
  if (!month) return null;
  const mm = t.match(/\b(\d{1,2}[./-]\d{4})\b/);
  if (mm) {
    const v = normaliseMonth(mm[1]);
    if (v) return v;
  }
  return readMonthName(t);
}

/** «weiss ich nicht», «keine Ahnung», «not sure», «je ne sais pas», «non lo so». */
export function saysUnknown(text: string): boolean {
  return /(wei(ss|ß) (ich )?(es )?nicht|keine ahnung|unbekannt|noch offen|noch nicht|unklar|don'?t know|not sure|no idea|unknown|not yet|je ne sais pas|aucune idée|pas encore|inconnu|non lo so|non so|nessuna idea|non ancora|sconosciut)/i.test(text);
}

/**
 * Questions about HYPO itself rather than the request (DECISIONS V92, «nur HYPOTEQ»): who built it,
 * which AI / model / provider runs it, its prompt or instructions, attempts to override them.
 * HYPO answers these with one fixed text and never passes them to the model. «Bist du ein
 * Mensch?» is not one of them — it has its own text (Konzept Kap. 10).
 */
const ABOUT_BOT = [
  // who built / made / trained you
  /\bwer (hat|haben) (dich|euch|hypo) (gebaut|programmiert|entwickelt|gemacht|erstellt|erschaffen|trainiert|geschrieben)/i,
  /\bwho (built|made|created|developed|programmed|trained|wrote|owns|runs|powers) (you|hypo|this (bot|chat|assistant))/i,
  /\bqui (t'a|vous a|a) (créé|cree|construit|programmé|programme|développé|developpe|conçu|concu|entraîné|entraine)/i,
  /\bchi (ti|l'|vi|ha) ?(ha )?(creato|costruito|programmato|sviluppato|realizzato|addestrato)/i,
  // which model / AI / technology
  /\b(welche[snmr]?|was für ein(e|en)?) (ki|ai|modell|model|sprachmodell|technologie|technik|software|llm)\b/i,
  /\b(what|which) (ai|model|llm|language model|technology|provider)\b/i,
  /\b(quel|quelle) (ia|modèle|modele|technologie)\b/i,
  /\b(quale|che) (ia|modello|tecnologia)\b/i,
  /\b(basierst|läufst|laeufst|beruhst) du auf\b|\bare you (based|built|running) on\b|\bes-tu basé|\bsei basato/i,
  // vendor and model names that are no one's first name …
  /\b(chat ?gpt|gpt-?\d|openai|open ai|anthropic|deepseek|llm|large language model|sprachmodell|modèle de langage|modello linguistico)\b/i,
  // … and the ones that can be («Claude Dupont»): only asked of HYPO
  /\b(bist du|seid ihr|are you|es-tu|êtes-vous|etes-vous|sei|è) (ein |eine |a |an |un |une |uno )?(claude|gemini|bard|llama|mistral|copilot|grok)\b/i,
  // the prompt, the instructions, attempts to override them
  /\b(system ?prompt|dein(en)? prompt|your prompt|ton prompt|il tuo prompt|prompt engineering)\b/i,
  /\b(deine|ihre|your|tes|vos|le tue|sue) (anweisungen|instruktionen|instructions|regeln|rules|règles|istruzioni|regole)\b/i,
  /\b(ignorier(e|en)?|vergiss|ignore|forget|disregard|oublie|ignora|dimentica)\b.{0,40}\b(anweisungen|instruktionen|instructions|regeln|rules|règles|istruzioni|regole|prompt|vorgaben)\b/i,
  /\b(jailbreak|developer mode|dan mode|entwicklermodus)\b/i,
];

export function asksAboutBot(text: string): boolean {
  const s = text.normalize("NFC");
  return ABOUT_BOT.some((re) => re.test(s));
}

/** «Bist du ein Mensch?», «are you a bot?», «es-tu une IA ?» — Konzept Kap. 10 has the answer. */
export function asksIfHuman(text: string): boolean {
  return /\b(bist du|seid ihr|sind sie|are you|es-tu|êtes-vous|etes-vous|sei|è|lei è) (ein |eine |a |an |un |une |uno |una |un')?(echte[rs]? )?(mensch|human|person|real person|bot|ki|ai|ia|roboter|robot|chatbot|maschine|machine|humain|vraie personne|personne réelle|umano|persona( vera)?|macchina)\b/i.test(
    text.normalize("NFC")
  );
}

/** «überspringen», «skip», «passer», «salta». */
export function saysSkip(text: string): boolean {
  return /^(überspringen|ueberspringen|weiter|später|skip|later|next|passer|plus tard|suivant|salta|saltare|più tardi|dopo)\b/i.test(text.trim());
}

/** The answer reads as nothing but the answer: short, no second statement in it. */
export function isPlainAnswer(text: string): boolean {
  // «ca. 1.1 Mio» is one statement: abbreviations do not end a sentence.
  const s = text.trim().replace(/\b(ca|zirka|rund|env|approx|circa|mio|fr|chf|tsd|nr|str|z\. ?b|e\. ?g)\./gi, "$1");
  return s.length <= 60 && !/[.;!?]\s+\S/.test(s) && s.split(/\s+/).length <= 6;
}

/** Reads the value of one field from a typed answer; null when it does not read cleanly. */
export function readField(key: HypoKey, kind: string, text: string, options: readonly string[] = [], labels: readonly string[] = []): HypoValue | null {
  switch (kind) {
    case "amount":
      return coerce(key, readAmount(text));
    case "yesno":
      return readYesNo(text);
    case "enum":
      return readOption(key, text, options, labels);
    case "email":
      return readEmail(text);
    case "phone":
      return readPhone(text);
    case "plz":
      return readPlace(text).plz;
    case "date":
      return readDate(text);
    case "month":
      return readDate(text, true);
    case "name":
    case "text":
      return coerce(key, text);
    default:
      return null;
  }
}
