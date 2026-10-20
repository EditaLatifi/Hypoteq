import { SALESFORCE_ACCOUNT_FIELDS } from "./salesforceAccountFieldConfig";
import { funnelToSalesforceMap } from './funnelToSalesforceMap';
import { SALESFORCE_CASE_FIELDS, SFFieldType } from "./salesforceFieldConfig";
import { ART_LIEGENSCHAFT_MAP, NUTZUNG_MAP, isZweitwohnsitzNutzung } from "./propertyLabels";
import { resolvePartner, type PartnerResolution } from "./partnerDirectory";
import { calcForState } from "@/lib/funnel-v3/calc";
import { normaliseFunnelState } from "@/lib/funnel-v3/legacy";
import { splitFullName } from "@/lib/funnel-v3/requirements";

// Sales Partner = the partner *company* Account on the Case (HYPOTEQ AG for direct
// leads; Betterhomes / Remax / ... for partner leads). Verified against production:
// the API name is the unhelpfully generic `Account__c` (label "Sales Partner"), which
// is NOT the standard `AccountId` — that one holds the customer. Overridable per-org.
const SALES_PARTNER_FIELD = process.env.SF_SALES_PARTNER_FIELD || 'Account__c';
const HYPOTEQ_ACCOUNT_NAME = process.env.HYPOTEQ_ACCOUNT_NAME || 'HYPOTEQ AG';

export const NEW_PARTNER_NOTE = 'Neuer Partner – bitte prüfen und anlegen';
export const PARTNER_CHECK_FAILED_NOTE = 'Partner konnte nicht geprüft werden – bitte prüfen';

/**
 * The Comments line for an Auskunftsermächtigung submitted anyway over the AI's verdict
 * (HYPOTEQ 19.10. E.4): «Auskunftsermächtigung trotzdem eingereicht – AI-Hinweis: … – manuell
 * prüfen», read from the signature block of Dokumenten_Check_State__c. Null otherwise.
 */
export function signatureCaseNote(checkState: unknown): string | null {
  if (typeof checkState !== 'string') return null;
  try {
    const sig = JSON.parse(checkState)?.signature;
    if (sig?.override !== true || typeof sig.aiNote !== 'string' || !sig.aiNote.trim()) return null;
    return `Auskunftsermächtigung trotzdem eingereicht – ${sig.aiNote.trim()}`;
  } catch {
    return null;
  }
}

function prependComment(caseData: Record<string, any>, note: string) {
  const existing = typeof caseData['Comments'] === 'string' ? caseData['Comments'].trim() : '';
  caseData['Comments'] = existing ? `${note}\n\n${existing}` : note;
}

/**
 * Put the submitting Berater on the Case (spec 6.3, DECISIONS D13).
 *   partner (VP Contact) → Partner_Consultant__c = Contact, Sales Partner = its Account
 *   HYPOTEQ user         → OwnerId = User
 *   unknown              → no lookups; Supplied* from the new-partner form and a note in
 *                          Comments so HYPOTEQ creates the partner by hand. Nothing is created
 *                          in Salesforce for them.
 * Runs after the Case field cleanup, so the standard fields set here survive it.
 */
export async function applyPartnerToCase(
  caseData: Record<string, any>,
  partnerEmail: string,
  partnerForm: { email?: string; vorname?: string; nachname?: string; telefon?: string; firma?: string } | undefined | null,
): Promise<void> {
  let resolved: PartnerResolution | null = null;
  try {
    resolved = await resolvePartner(partnerEmail, { fresh: true });
  } catch (err) {
    console.error(`[Salesforce Sync] Partner lookup failed for ${partnerEmail}:`, err);
  }

  if (resolved?.status === 'partner') {
    caseData['Partner_Consultant__c'] = resolved.contactId;
    if (resolved.accountId) caseData[SALES_PARTNER_FIELD] = resolved.accountId;
    console.log(`[Salesforce Sync] Partner recognised: Contact ${resolved.contactId}, Account ${resolved.accountId ?? '–'}`);
    return;
  }
  if (resolved?.status === 'hypoteq') {
    caseData['OwnerId'] = resolved.userId;
    console.log(`[Salesforce Sync] HYPOTEQ user submitted: Owner ${resolved.userId}`);
    return;
  }

  const form = partnerForm || {};
  const name = [form.vorname, form.nachname].map((s) => (s || '').trim()).filter(Boolean).join(' ');
  if (name) caseData['SuppliedName'] = name;
  caseData['SuppliedEmail'] = (form.email || partnerEmail || '').trim() || null;
  if (form.telefon?.trim()) caseData['SuppliedPhone'] = form.telefon.trim();
  if (form.firma?.trim()) caseData['SuppliedCompany'] = form.firma.trim();
  // A failed lookup is not proof the partner is new — say so, so nobody creates a duplicate. Nor
  // is a miss from the 24-hour fallback (partnerDirectory, HYPOTEQ 19.10. B17): HYPOTEQ may have
  // added the partner since.
  const checked = resolved && !resolved.stale;
  prependComment(caseData, checked ? NEW_PARTNER_NOTE : PARTNER_CHECK_FAILED_NOTE);
  console.log(`[Salesforce Sync] Partner not recognised (${checked ? 'unknown' : resolved ? 'lookup failed, stale miss' : 'lookup failed'}): ${partnerEmail}`);
}

/**
 * Case_Name__c of a funnel Case (HYPOTEQ 19.10. D.4, mapping «Case Name (generiert)»; DECISIONS
 * V65): «{Nachname} {Vorname} – {PLZ} {Ort}», a company «{Firma} – {PLZ} {Ort}». A part that is
 * missing is left out; without a name the Case still says what it is — «Unvollständige Anfrage –
 * {PLZ} {Ort}», else «Unvollständige Anfrage – {who submitted}», else with the date — so it is never
 * empty (the field is required) and stays chaseable.
 */
export function funnelCaseName(p: { firma?: string | null; nachname?: string | null; vorname?: string | null; plz?: string | null; ort?: string | null; submitter?: string | null }, today: Date = new Date()): string {
  const s = (v: string | null | undefined) => String(v || '').trim();
  const who = s(p.firma) || [s(p.nachname), s(p.vorname)].filter(Boolean).join(' ');
  const place = [s(p.plz), s(p.ort)].filter(Boolean).join(' ');
  if (who) return place ? `${who} – ${place}` : who;
  const tail = place || s(p.submitter);
  return tail ? `Unvollständige Anfrage – ${tail}` : `Unvollständige Anfrage ${today.toISOString().slice(0, 10)}`;
}

/**
 * Case.OwnerId of a funnel Case (HYPOTEQ 19.10. D.2, mapping «Owner»: «Queue Web-Anfragen oder
 * HYPOTEQ-User»; DECISIONS V64). A HYPOTEQ user as Berater is already the owner
 * (applyPartnerToCase, by the User's e-mail); every other Case goes to the queue «Web-Anfragen»
 * (salesforceApi.findFunnelQueueId, resolved at runtime, cached). Fails soft: no queue, a failed
 * lookup or an API without the function leave the default owner.
 */
export async function applyFunnelOwner(caseData: Record<string, any>, salesforceApi: any): Promise<void> {
  if (caseData['OwnerId']) return;
  if (typeof salesforceApi?.findFunnelQueueId !== 'function') return;
  try {
    const queueId = await salesforceApi.findFunnelQueueId();
    if (queueId) {
      caseData['OwnerId'] = queueId;
      console.log(`[Salesforce Sync] Owner: queue Web-Anfragen ${queueId}`);
    } else {
      console.warn('[Salesforce Sync] Queue «Web-Anfragen» not found — the Case keeps the default owner');
    }
  } catch (err) {
    console.error('[Salesforce Sync] Queue «Web-Anfragen» could not be resolved — the Case keeps the default owner:', err);
  }
}

/**
 * Case.RecordTypeId of a funnel Case: «Standardfinanzierung» (HYPOTEQ 20.10.2026), set
 * explicitly — without it the integration user's default applied («Spezialfinanzierung» on
 * 19.10.). Resolved at runtime (salesforceApi.findFunnelCaseRecordTypeId, cached once found).
 * Fails soft like the owner: no record type, a failed lookup or an API without the function
 * leave the default.
 */
export async function applyFunnelRecordType(caseData: Record<string, any>, salesforceApi: any): Promise<void> {
  if (caseData['RecordTypeId']) return;
  if (typeof salesforceApi?.findFunnelCaseRecordTypeId !== 'function') return;
  try {
    const recordTypeId = await salesforceApi.findFunnelCaseRecordTypeId();
    if (recordTypeId) {
      caseData['RecordTypeId'] = recordTypeId;
      console.log(`[Salesforce Sync] Record type: Standardfinanzierung ${recordTypeId}`);
    } else {
      console.warn('[Salesforce Sync] Record type «Standardfinanzierung» not found — the Case takes the default record type');
    }
  } catch (err) {
    console.error('[Salesforce Sync] Record type «Standardfinanzierung» could not be resolved — the Case takes the default:', err);
  }
}

/**
 * Swiss date (TT.MM.JJJJ, also T.M.JJJJ) or an ISO date → Salesforce `YYYY-MM-DD`; null for
 * anything that is not a real calendar date. The Kaufdatum and the Ablösedatum read from the
 * Zinsabrechnung are typed or printed text — «Mai 2026» or «31.02.2026» must not reach the Date
 * field Kaufdatum_Datum__c as a broken date (Salesforce would reject it).
 */
export function toSalesforceDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (match) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Convert Swiss date format (DD.MM.YYYY) to Salesforce format (YYYY-MM-DD)
function convertSwissDateToSalesforce(swissDate: string): string | null {
  return toSalesforceDate(swissDate);
}

/**
 * Kaufdatum__c «Kauf- & Ablöse-Datum» is Text(80) (HYPOTEQ 19.10. B13 / B15, DECISIONS V41): a
 * real calendar date as «TT.MM.JJJJ» (also from T.M.JJJJ or YYYY-MM-DD); anything else typed or
 * printed («Ende 2026») as it is — it is a text field, and staff read it; null when empty.
 * Kaufdatum_Datum__c gets the same date as a Date (toSalesforceDate), only when it is one.
 */
export function toKaufdatumText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  const iso = toSalesforceDate(s);
  if (!iso) return s.slice(0, 80);
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** «unbekannt», «keine Angabe», «–»: the document names no heating. */
const NO_HEATING = /^(unbekannt|unknown|inconnue?|sconosciut[oa]|keine?( angaben?)?|nicht (angegeben|ersichtlich|bekannt)|none|aucune?|nessun[oa]?|k\.? ?a\.?|n\/?a|[-–—?.\s]*)$/;

/**
 * Heizungsart read from the documents (v5 no longer asks it, Handover 0 / 8) → the
 * Waermeerzeugung__c picklist (HYPOTEQ 19.10. B15): Wärmepumpe Luft-Wasser (the default for a
 * Wärmepumpe), Wärmepumpe Wasser-Wasser (also Erdsonde, Grundwasser, Sole-Wasser), Fernwärme,
 * Holz (Pellets), Gas Erdgas, Gas Biogas, Öl — recognised by key words in DE/FR/IT/EN. A text that
 * names a heating but none of these («Elektroheizung», «Solar») → «Andere»; no text, or one that
 * says there is none to read («unbekannt»), → nothing. The text stays in the JSON `info.heizung`.
 */
export function toWaermeerzeugung(heizung: unknown): string | null {
  if (typeof heizung !== 'string') return null;
  const v = heizung.trim().toLowerCase();
  if (!v || NO_HEATING.test(v)) return null;
  // Ground and water source first (Erdsonde = Sole-Wasser: the picklist has no own value for it).
  if (/wasser[\s/-]*wasser|sole[\s/-]*wasser|erd(sonde|w(ä|ae)rme|reich|kollektor)|grundwasser|eau[\s/-]*eau|g[ée]otherm|sonde g|acqua[\s/-]*acqua|geotermic|water[\s/-]*(to[\s/-]*)?water|ground[\s/-]*source|brine/.test(v)) {
    return 'Wärmepumpe Wasser-Wasser';
  }
  if (/w(ä|ae)rmepumpe|heat ?pump|pompe à chaleur|pompa di calore|\bwp\b|\bpac\b/.test(v)) return 'Wärmepumpe Luft-Wasser';
  if (/fernw(ä|ae)rme|district heating|chauffage à distance|teleriscaldamento/.test(v)) return 'Fernwärme';
  if (/holz|pellet|\bbois\b|legna|\bwood\b|schnitzel/.test(v)) return 'Holz';
  // Oil before gas: «gasolio» is heating oil.
  if (/(^|[\s(/-])(heiz)?(ö|oe)l|mazout|fioul|gasolio|nafta|\boil\b/.test(v)) return 'Öl';
  // Biogas before gas.
  if (/bio-?ga[sz]/.test(v)) return 'Gas Biogas';
  if (/(^|[\s(/-])(erd)?gas|\bgaz\b|\bgas\b/.test(v)) return 'Gas Erdgas';
  return 'Andere';
}

/**
 * The blocks v5 adds to Dokumenten_Check_State__c beside the foundation's (entry, answers with
 * the Eigenmittel rows, sources, signature, info — lib/funnel-v3/checkState.ts):
 *
 *   calc     the funnel's numbers (lib/funnel-v3/calc.ts): Gesamtfinanzierung, Eigenmittel total
 *            and % (Eigenmittel_Total__c of the proposal is Eigenmittel__c here, DECISIONS V5),
 *            harte Eigenmittel, Belehnung, Tragbarkeit, Urteil — Tragbarkeit__c and
 *            EigenmittelProzent__c carry the same calculation since HYPOTEQ 19.10. B14 (v5PercentFields)
 *   kontakt  the phone (PersonMobilePhone of the proposal is Account.Phone here) and, for a
 *            company, the zeichnungsberechtigte Person (also the Contact on the Business Account, B16)
 *
 * A Nachreichung re-writes the JSON and carries both over (unknown keys are kept).
 */
export function v5CheckStateBlocks(state: NonNullable<ReturnType<typeof normaliseFunnelState>>, calc: ReturnType<typeof calcForState>) {
  const round1 = (v: number | null) => (v === null || !Number.isFinite(v) ? undefined : Math.round(v * 10) / 10);
  const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 0));
  const isKauf = state.ans.antrag === 'Neue Hypothek';
  const isJur = state.ans.kn === 'Juristische Person';
  return {
    calc: compact({
      gesamtfinanzierung: Math.round(calc.need),
      objektwert: Math.round(calc.value),
      gesamtkosten: isKauf ? Math.round(calc.cost) : undefined,
      eigenmittelTotal: isKauf ? Math.round(calc.emTotal) : undefined,
      eigenmittelProzent: isKauf && calc.emTotal > 0 ? round1(calc.emPct) : undefined,
      harteEigenmittel: isKauf && calc.emTotal > 0 ? Math.round(calc.hard) : undefined,
      belehnung: round1(calc.ltv),
      tragbarkeit: round1(calc.affordability),
      urteil: calc.verdict,
    }),
    kontakt: compact({
      telefon: state.txt.tel.trim(),
      zeichnungsberechtigt: isJur ? state.txt.zeichner.trim() : undefined,
    }),
  };
}

/**
 * Tragbarkeit__c and EigenmittelProzent__c of a funnel v5 payload (HYPOTEQ 19.10. B14: «der Funnel
 * schreibt die v5-Werte», the Handover formula of lib/funnel-v3/calc.ts; replaces S1 / S6 for v5,
 * DECISIONS V41):
 *   Tragbarkeit__c         calc.affordability (Kreditnehmer 1 + 2); none for a juristische Person
 *                          or without income — as the funnel shows «–»
 *   EigenmittelProzent__c  Kauf: (Gesamtkosten − Hypothek) / Gesamtkosten — with Eigenmittel entered
 *                          the funnel's «x %» (calc.emPct), without them the 20 % of its 80 % rule;
 *                          Ablösung: 100 − Belehnung (the part of the Objektwert the mortgage leaves)
 * Rounded to one decimal like the funnel. Testfall Rosanna: 19.6 % and 20 %.
 */
export function v5PercentFields(
  state: Pick<NonNullable<ReturnType<typeof normaliseFunnelState>>, "ans">,
  calc: ReturnType<typeof calcForState>,
): { Tragbarkeit__c?: number; EigenmittelProzent__c?: number } {
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const out: { Tragbarkeit__c?: number; EigenmittelProzent__c?: number } = {};
  if (calc.affordability !== null && Number.isFinite(calc.affordability)) out.Tragbarkeit__c = round1(calc.affordability);
  if (state.ans.antrag === 'Neue Hypothek' && calc.cost > 0) {
    out.EigenmittelProzent__c = round1(((calc.cost - calc.need) / calc.cost) * 100);
  } else if (state.ans.antrag === 'Ablösung' && calc.ltv !== null && Number.isFinite(calc.ltv)) {
    out.EigenmittelProzent__c = round1(100 - calc.ltv);
  }
  return out;
}

/** Adds the v5 blocks to the JSON string; leaves it as it is when it is not JSON or would outgrow the field. */
export function withV5CheckStateBlocks(json: string, blocks: Record<string, Record<string, unknown>>, maxLength = 131072): string {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return json;
    for (const [k, v] of Object.entries(blocks)) if (Object.keys(v).length) obj[k] = v;
    const out = JSON.stringify(obj);
    return out.length <= maxLength ? out : json;
  } catch {
    return json;
  }
}

// Transform German picklist values to proper Salesforce format
function transformErwerbsstatus(value: string | null | undefined): string | null {
  if (!value) return null;
  const mapping: Record<string, string> = {
    'angestellt': 'Angestellt',
    'selbständig': 'Selbständig',
    'rentner': 'Rentner'
  };
  return mapping[value.toLowerCase()] || value;
}

/**
 * Funnel v3 Anrede → PersonAccount.Salutation (spec 6.4): Herr → Mr., Frau → Mrs. Anything
 * else (the legacy funnel sends nothing) → null, so no Salutation is written.
 */
export function toSalesforceSalutation(value: unknown): 'Mr.' | 'Mrs.' | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'herr' || v === 'mr.' || v === 'mr') return 'Mr.';
  if (v === 'frau' || v === 'mrs.' || v === 'mrs') return 'Mrs.';
  return null;
}

function transformZivilstand(value: string | null | undefined): string | null {
  if (!value) return null;
  const mapping: Record<string, string> = {
    'ledig': 'Ledig',
    'verheiratet': 'Verheiratet',
    'geschieden': 'Geschieden',
    'verwitwet': 'Verwitwet'
  };
  return mapping[value.toLowerCase()] || value;
}

// Validation function
function validatePersonData(person: any, personIndex: number, isPartnerEmail: boolean = false, isJuristicPerson: boolean = false) {
  const errors: string[] = [];
  
  // Skip email/phone validation for juristic persons (companies)
  if (isJuristicPerson) {
    // Only validate that company name (lastName) exists
    if (!person.lastName || person.lastName.trim() === '') {
      errors.push(`Person ${personIndex}: Company name is mandatory`);
    }
    return errors;
  }
  
  // For natural persons - email and phone validation
  // Skip email validation for partner submissions (partner fills in their own email, not end-customer's)
  if (!isPartnerEmail && (!person.email || person.email.trim() === '')) {
    errors.push(`Person ${personIndex}: Email is mandatory`);
  }
  
  // Phone is mandatory only for end-customers, not for partner email-only submissions
  if (!isPartnerEmail && !person.phone && !person.telefon) {
    errors.push(`Person ${personIndex}: Telephone is mandatory`);
  }
  
  return errors;
}

/**
 * Funnel v3 co-borrower without e-mail (DECISIONS D18) → a person for the Account loop, or
 * null when no name was entered (nothing to create an Account for).
 */
function v3CoBorrowerPerson(kn: any): Record<string, any> | null {
  const firstName = String(kn.firstName || kn.vorname || '').trim();
  const lastName = String(kn.lastName || kn.nachname || kn.name || '').trim();
  if (!firstName && !lastName) return null;
  return {
    firstName,
    lastName: lastName || 'Unknown',
    email: '',
    phone: '',
    erwerbsstatus: kn.erwerb || kn.erwerbsstatus || null,
    zivilstand: kn.zivilstand || null,
    geburtsdatum: kn.geburtsdatum || kn.birthdate || null,
    v3CoBorrower: true,
  };
}

const personNameKey = (p: any) =>
  `${String(p?.firstName || '').trim()}|${String(p?.lastName || '').trim()}`
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Same first and last name (case and spacing aside) — the within-submission de-duplication of D18. */
function samePersonName(a: any, b: any): boolean {
  return !a?.isJuristic && personNameKey(a) === personNameKey(b);
}

function sanitizeSFAccountValue(sfField: string, value: any) {
  const type = SALESFORCE_ACCOUNT_FIELDS[sfField];
  if (!type) return value ?? null;
  switch (type) {
    case "boolean":
      if (value === true || value === false) return value;
      if (value == null) return false;
      const v = String(value).trim().toLowerCase();
      if (["ja", "yes", "true", "1"].includes(v)) return true;
      if (["nein", "no", "false", "0", ""].includes(v)) return false;
      return false;
    case "date":
      return value || null;
    case "picklist":
      return value || null;
    case "string":
    default:
      return value ?? null;
  }
}

/** A yes in any spelling the funnels send: «Ja» (v5), «ja» (v1), yes / oui / sì, true. */
function isYes(value: unknown): boolean {
  if (value === true) return true;
  return typeof value === 'string' && ['ja', 'yes', 'oui', 'sì', 'si', 'true', '1'].includes(value.trim().toLowerCase());
}

// Parse a percentage value into a plain number (handles "1.34", "1,34", "1.34%")
function parsePercent(value: any): number | null {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/%/g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function sanitizeSFValue(sfField: string, value: any) {
  const type = SALESFORCE_CASE_FIELDS[sfField];

  if (!type) return undefined;

  switch (type) {
    case "currency": {
      if (value === "" || value == null) return null;
      const n = Number(
        String(value)
          .replace(/CHF\s?/gi, "")
          .replace(/'/g, "")
      );
      return Number.isFinite(n) ? n : null;
    }

    case "percent":
      return parsePercent(value);

    case "boolean": {
      if (value === true || value === false) return value;
      const v = String(value).toLowerCase();
      return ["ja", "yes", "true", "1"].includes(v);
    }

    case "date":
      // Convert Swiss date format (DD.MM.YYYY) to Salesforce format (YYYY-MM-DD)
      if (!value || value === '') return null;
      return convertSwissDateToSalesforce(value);

    case "picklist":
      // Handle Ja/Nein picklists - ensure proper capitalization. The French and Italian
      // spellings are normalised too (Verpf_ndung_PK__c used to be dropped for «Oui»/«Sì»).
      if (value && typeof value === 'string') {
        const lowerValue = value.trim().toLowerCase();
        if (['ja', 'yes', 'oui', 'sì', 'si'].includes(lowerValue)) return 'Ja';
        if (['nein', 'no', 'non'].includes(lowerValue)) return 'Nein';
      }
      return value ?? null;
      
    case "string":
      return value ?? null;
  }
}

// Translate document i18n keys into German labels for the Salesforce Dokumenten-Check tab.
// Falls back to the bare key so an unmapped document is still visible rather than silently
// dropped from the missing list.
function resolveDocLabelsDe(keys: string[]): string[] {
  let de: any = {};
  try { de = require("@/messages/de.json"); } catch { /* label lookup is best-effort */ }
  return keys.map((key) => {
    const [ns, name] = key.split(".");
    return de?.[ns]?.[name] || key;
  });
}

/**
 * Funnel v3: the Dokumenten_Check_State__c of the Case createOrUpdateCase is about to update
 * (its duplicate guard: same Account, created in the last five minutes), so a re-sync merges
 * instead of overwriting manual ticks. Best-effort: null when there is none or it cannot be read.
 */
async function readRecentCaseCheckState(salesforceApi: any, accountId: unknown): Promise<string | null> {
  if (typeof accountId !== 'string' || !accountId || typeof salesforceApi?.sfQuery !== 'function') return null;
  try {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const id = typeof salesforceApi.soqlString === 'function' ? salesforceApi.soqlString(accountId) : `'${accountId.replace(/'/g, '')}'`;
    const rows = await salesforceApi.sfQuery(
      `SELECT Dokumenten_Check_State__c FROM Case WHERE AccountId = ${id} AND CreatedDate >= ${since} ORDER BY CreatedDate DESC LIMIT 1`,
      'v3 Dokumenten_Check_State__c'
    );
    return rows?.[0]?.Dokumenten_Check_State__c ?? null;
  } catch (err) {
    console.warn('[Salesforce Sync] Could not read the existing Dokumenten_Check_State__c:', err);
    return null;
  }
}

/**
 * Juristische Person → Business Account + Contact (HYPOTEQ 19.10. B16, Handover 8; DECISIONS V63):
 *
 *   Account  a company Account (never a Person Account; record type resolved at runtime by
 *            salesforceApi.getBusinessAccountRecordTypeId): Name = Firma, Phone, UID and Sitz
 *            from the Handelsregisterauszug where read. Reused, never duplicated: the same UID
 *            first, else exactly the same Name (salesforceApi.findBusinessAccount). A reused
 *            Account is not changed.
 *   Contact  the zeichnungsberechtigte Person on that Account: Vorname / Nachname, E-Mail and
 *            Telefon of step 1 — reused when that Account already has a Contact with the e-mail
 *            (without one: the same name). Without a name there is no Contact. A Contact that
 *            cannot be written costs only the Contact, not the Case.
 *
 * Returns the Account as the Person Account loop does ({ id }) and the Contact ({ id }) or null.
 */
export async function syncCompanyAccount(
  salesforceApi: any,
  person: { lastName: string; email?: string; phone?: string; uid?: string | null; sitz?: string | null; adresse?: string; signatory?: { firstName?: string; lastName?: string } },
): Promise<{ account: { id: string }; contact: { id: string } | null }> {
  for (const fn of ['findBusinessAccount', 'createBusinessAccount']) {
    // salesforceApi is the module's default export object: a function missing there is undefined
    // with no compile error (see the note at the bottom of components/salesforceApi.ts).
    if (typeof salesforceApi?.[fn] !== 'function') throw new Error(`salesforceApi.${fn} is not a function — it is likely missing from the default export in components/salesforceApi.ts`);
  }
  const name = String(person.lastName || '').trim();
  const email = String(person.email || '').trim();
  const phone = String(person.phone || '').trim();

  const existing = await salesforceApi.findBusinessAccount({ uid: person.uid ?? null, name });
  let accountId: string;
  if (existing?.Id) {
    accountId = existing.Id;
    console.log(`[Salesforce Sync] Company «${name}»: existing Business Account ${accountId} (same ${existing.matchedBy === 'uid' ? 'UID' : 'Name'})`);
  } else {
    const created = await salesforceApi.createBusinessAccount({ name, phone: phone || null, uid: person.uid ?? null, sitz: person.sitz ?? null, street: person.adresse || null });
    accountId = created?.id || created?.Id;
    console.log(`[Salesforce Sync] Company «${name}»: Business Account created ${accountId}`);
  }

  const firstName = String(person.signatory?.firstName || '').trim();
  const lastName = String(person.signatory?.lastName || '').trim();
  let contact: { id: string } | null = null;
  if (lastName && accountId) {
    try {
      const found =
        existing?.Id && typeof salesforceApi.findContactOnAccount === 'function'
          ? await salesforceApi.findContactOnAccount(accountId, { email, firstName, lastName })
          : null;
      if (found?.Id) {
        contact = { id: found.Id };
        console.log(`[Salesforce Sync] Signatory ${firstName} ${lastName}: existing Contact ${found.Id}`);
      } else {
        const fields: Record<string, any> = { AccountId: accountId, LastName: lastName };
        if (firstName) fields.FirstName = firstName;
        if (email) fields.Email = email;
        if (phone) fields.Phone = phone;
        const created = await salesforceApi.createContact(fields);
        const id = created?.id || created?.Id;
        if (id) contact = { id };
        console.log(`[Salesforce Sync] Signatory ${firstName} ${lastName}: Contact created ${id}`);
      }
    } catch (err) {
      console.error(`[Salesforce Sync] Contact for the signatory of «${name}» not written (the Case goes on without it):`, err);
    }
  }
  return { account: { id: accountId }, contact };
}

export async function syncFunnelStepsToSalesforce(stepData: Record<string, any>, salesforceApi: any) {
  console.log('[Salesforce Sync] Starting sync process...');
  
  // Flatten all data
  const flatData = {
    ...stepData,
    ...(stepData.financing || {}),
    ...(stepData.project || {}),
    ...(stepData.property || {}),
    ...(stepData.client || {}),
  };
  // Log flatData for debugging
  console.log("Flat data for mapping:", flatData);

  // The funnel state of a v3 / v5 payload (legacy.ts reads either into the v5 shape): what the
  // customer answered and what the documents said (UID and Sitz of a company, the Heizung, …).
  const v3State = stepData.v3 ? normaliseFunnelState(stepData.v3) : null;

  // Capture raw project type up front — flatData.projektArt gets rewritten to a display
  // label ("Neue Hypothek" / "Ablösung") later, which breaks downstream lowercase checks.
  const projektArtRaw = (flatData.projektArt || '').toLowerCase();
  const isKauf = projektArtRaw === 'kauf' || projektArtRaw === 'neue hypothek';
  const isAbloesung = projektArtRaw === 'abloesung' || projektArtRaw === 'ablösung';

  // For Ablösung, reuse abloesedatum as kaufdatum (Kaufdatum__c is the date field)
  if (isAbloesung && flatData.abloesedatum) {
    flatData.kaufdatum = flatData.abloesedatum;
  }

  // Extract partner email if customerType is "partner" (doesn't create Account, just stored in Case)
  // Funnel v3 sends the Berater block as `partner` ({ email, vorname, nachname, telefon,
  // firma }); the older funnel only had the partner's address in client.email.
  let partnerEmail: string | null = null;
  const partnerEmailRaw = stepData.partner?.email || stepData.client?.email;
  if (stepData.customerType === 'partner' && partnerEmailRaw) {
    partnerEmail = String(partnerEmailRaw).trim();
    console.log(`[Salesforce Sync] Partner email detected: ${partnerEmail}`);
  }

  // Extract persons from kreditnehmer array (end-customers who will get Accounts)
  const persons: any[] = [];
  
  // Company names live on kreditnehmer[].firmenname for some funnel paths and on
  // property.firmen[] for others; a juristic lead needs whichever one was filled in.
  const firmenList: any[] = Array.isArray(stepData.property?.firmen) ? stepData.property.firmen : [];

  // Use kreditnehmer array as primary source (end-customer data)
  if (Array.isArray(stepData.property?.kreditnehmer) && stepData.property.kreditnehmer.length > 0) {
    for (let i = 0; i < stepData.property.kreditnehmer.length; i++) {
      const kn = stepData.property.kreditnehmer[i];

      // A borrower is only *usably* juristic when a company name exists to become LastName.
      // Partner submissions routinely flag borrowerType `jur` while leaving Firmenname blank,
      // and treating those as juristic dropped them entirely — discarding complete personal
      // contact data and leaving the sync with zero persons, which killed the whole lead.
      const declaredJuristic = stepData.borrowers?.[0]?.type === 'jur';
      const companyName = String(
        kn.firmenname ||
        (declaredJuristic ? (firmenList[i]?.firmenname || firmenList[0]?.firmenname || '') : '') ||
        ''
      ).trim();
      const isJuristicPerson = Boolean(companyName);

      if (isJuristicPerson) {
        // A company becomes a Business Account (Name = Firma) with its zeichnungsberechtigte
        // Person as a Contact (HYPOTEQ 19.10. B16) — no Person Account named after it any more.
        // v5 asks the signatory as one name (txt.zeichner); the old funnel as Vorname / Name.
        const zeichner = String(kn.zeichnungsberechtigt || '').trim();
        const signatory = zeichner
          ? splitFullName(zeichner)
          : { first: String(kn.vorname || '').trim(), last: String(kn.name || kn.nachname || '').trim() };
        persons.push({
          firstName: '',
          lastName: companyName,
          email: kn.email || kn.emailAdresse || '',
          phone: kn.phone || kn.telefon || '',
          // From the Handelsregisterauszug (v5 facts), where it was read.
          uid: i === 0 ? v3State?.info?.uid ?? null : null,
          sitz: i === 0 ? v3State?.info?.sitz ?? null : null,
          adresse: kn.adresse || '',
          signatory: { firstName: signatory.first, lastName: signatory.last },
          erwerbsstatus: null,
          zivilstand: null,
          geburtsdatum: null,
          isJuristic: true, // Mark as juristic person for validation
        });
      } else {
        // === FUNNEL V3 CO-BORROWERS (DECISIONS D18) — v3 payloads only ===
        // v3 asks no e-mail or phone for Kreditnehmer 2 and 3, so the rule below (a natural
        // person needs an e-mail unless a partner submits) dropped them from a customer's
        // submission. They become Person Accounts by name. Without an e-mail there is nothing
        // to look an existing Account up by, and a name alone must never pull in someone
        // else's Account, so the only de-duplication is within this submission.
        if (stepData.v3 && i > 0 && !(kn.email || kn.emailAdresse)) {
          const coBorrower = v3CoBorrowerPerson(kn);
          if (!coBorrower) continue;
          if (persons.some((p) => samePersonName(p, coBorrower))) {
            console.log(`[Salesforce Sync] v3 co-borrower ${i + 1} repeats a person of this submission — not created twice`);
          } else {
            persons.push(coBorrower);
          }
          continue;
        }
        // === END FUNNEL V3 CO-BORROWERS ===

        // For natural persons - existing logic
        // For partner submissions, email may be empty on kreditnehmer
        if ((kn.vorname || kn.name || kn.firstName) && ((kn.email || kn.emailAdresse) || partnerEmail)) {
          persons.push({
            firstName: kn.firstName || kn.vorname || '',
            lastName: kn.lastName || kn.nachname || kn.name || 'Unknown',
            email: kn.email || kn.emailAdresse || '',
            phone: kn.phone || kn.telefon || '',
            erwerbsstatus: kn.erwerb || kn.erwerbsstatus || null,
            zivilstand: kn.zivilstand || null,
            geburtsdatum: kn.geburtsdatum || kn.birthdate || null,
            // Funnel v3 Anrede (spec 6.4); the legacy funnel never sends it.
            salutation: kn.anrede || null,
          });
        }
      }
    }
  }
  
  // Fallback to client object ONLY if kreditnehmer is empty AND it's NOT a partner submission
  if (persons.length === 0 && !partnerEmail) {
    if (stepData.client) {
      persons.push({
        firstName: stepData.client.firstName || stepData.client.vorname || '',
        lastName: stepData.client.lastName || stepData.client.nachname || stepData.client.name || 'Unknown',
        email: stepData.client.email || stepData.client.emailAdresse || '',
        phone: stepData.client.phone || stepData.client.telefon || '',
        erwerbsstatus: stepData.client.erwerb || stepData.client.erwerbsstatus || null,
        zivilstand: stepData.client.zivilstand || null,
        geburtsdatum: stepData.client.geburtsdatum || stepData.client.birthdate || null,
        salutation: stepData.client.anrede || null,
      });
    } else if (flatData.email) {
      // Final fallback if no client object
      persons.push({
        firstName: flatData.firstName || flatData.vorname || '',
        lastName: flatData.lastName || flatData.nachname || flatData.name || 'Unknown',
        email: flatData.email || flatData.emailAdresse || '',
        phone: flatData.phone || flatData.telefon || '',
        erwerbsstatus: flatData.erwerb || flatData.erwerbsstatus || null,
        zivilstand: flatData.zivilstand || null,
        geburtsdatum: flatData.geburtsdatum || flatData.birthdate || null,
      });
    }
  }

  // At most 3 borrowers in Salesforce (Client__c, Client_2__c, Client_3__c; HYPOTEQ 19.10. B17):
  // any further ones stay in the JSON (`answers.borrowers`) and the database — the lead is kept.
  if (persons.length > 3) {
    console.warn(`[Salesforce Sync] ${persons.length} borrowers — Salesforce links the first 3, the others stay in the JSON`);
    persons.splice(3);
  }

  // A lead with no usable borrower name is still a lead. Partner Ablösung submissions can
  // legitimately arrive with every Kreditnehmer field blank, and throwing here used to
  // discard the entire enquiry — financing figures, partner consultant and all. Create the
  // Case without a linked Account instead and let a human complete it in Salesforce.
  const hasPersons = persons.length > 0;
  if (!hasPersons) {
    console.warn(
      '[Salesforce Sync] No borrower name in this submission — creating the Case without a ' +
      'linked Account so the lead is not lost. Needs manual completion in Salesforce.'
    );
  }

  // VALIDATION: Validate each person
  const validationErrors: string[] = [];
  persons.forEach((person, index) => {
    // Skip email/phone validation for juristic persons
    const isJuristicPerson = (person as any).isJuristic === true;
    // A v3 co-borrower has no e-mail or phone by design (D18): validated like a partner's borrower.
    const contactOptional = !!partnerEmail || (person as any).v3CoBorrower === true;
    const errors = validatePersonData(person, index + 1, contactOptional, isJuristicPerson);
    validationErrors.push(...errors);
  });

  if (validationErrors.length > 0) {
    throw new Error('Validation failed: ' + validationErrors.join('; '));
  }

  console.log(`[Salesforce Sync] Processing ${persons.length} person(s)`);
  if (partnerEmail) {
    console.log(`[Salesforce Sync] Partner email will be stored in Case: ${partnerEmail}`);
  }

  // Store created accounts and contacts
  const accounts: any[] = [];
  const contacts: any[] = [];

  // Process each person: Create or find Account, then create Contact
  for (let i = 0; i < persons.length; i++) {
    const person = persons[i];
    const email = person.email || person.emailAdresse;
    const phone = person.phone || person.telefon;
    const firstName = person.firstName || person.vorname || '';
    const lastName = person.lastName || person.nachname || person.name || 'Unknown';
    const isJuristicPerson = (person as any).isJuristic === true;

    console.log(`[Salesforce Sync] Processing person ${i + 1}: ${email} (${isJuristicPerson ? 'Company' : 'Individual'})`);

    // A company: Business Account + Contact (HYPOTEQ 19.10. B16) — not the Person Account below.
    if (isJuristicPerson) {
      const company = await syncCompanyAccount(salesforceApi, person);
      accounts.push(company.account);
      contacts.push(company.contact);
      continue;
    }

    // STEP 1: Find or create Account. Only look up by email when we actually have one —
    // partner submissions often have no end-customer email, and querying with '' can match
    // unrelated empty-email Accounts from prior submissions.
    let account = email ? await salesforceApi.findAccountByEmail(email) : null;

    // Prepare Account data - Person Account fields (natural persons; a company returned above)
    const accountData: Record<string, any> = {
      LastName: lastName,
      FirstName: firstName,
    };
    if (email) accountData.PersonEmail = email;
    if (phone) accountData.Phone = phone;
   
    // Add address if available
    if (person.adresse) {
      accountData.PersonMailingStreet = person.adresse;
      console.log(`[Salesforce Sync] Adding address: ${person.adresse}`);
    }
    
    // Add additional person fields (only for natural persons)
    if (!isJuristicPerson) {
      if (person.erwerbsstatus) {
        accountData.Erwerbsstatus__c = transformErwerbsstatus(person.erwerbsstatus);
        console.log(`[Salesforce Sync] Erwerbsstatus: ${person.erwerbsstatus} -> ${accountData.Erwerbsstatus__c}`);
      }
      if (person.zivilstand) {
        accountData.Zivilstand__c = transformZivilstand(person.zivilstand);
        console.log(`[Salesforce Sync] Zivilstand: ${person.zivilstand} -> ${accountData.Zivilstand__c}`);
      }
      if (person.geburtsdatum) {
        const convertedDate = convertSwissDateToSalesforce(person.geburtsdatum);
        accountData.Geburtsdatum__c = convertedDate;
        console.log(`[Salesforce Sync] Geburtsdatum: ${person.geburtsdatum} -> ${convertedDate}`);
      } else {
        console.log(`[Salesforce Sync] No Geburtsdatum found for person`);
      }
      // Funnel v3 Anrede → Salutation (spec 6.4). Only on a NEW Person Account: an existing
      // Account's salutation is never overwritten (the update block below does not set it).
      const salutation = toSalesforceSalutation(person.salutation);
      if (salutation) {
        accountData.Salutation = salutation;
        console.log(`[Salesforce Sync] Salutation: ${person.salutation} -> ${salutation}`);
      }
    }

    // Sanitize all account fields (skip core identity fields)
    const skipFields = ['LastName', 'FirstName', 'PersonEmail', 'Phone', 'Geburtsdatum__c', 'Name', 'Email__c', 'Salutation'];
    for (const [field, value] of Object.entries(accountData)) {
      if (value !== undefined && !skipFields.includes(field)) {
        accountData[field] = sanitizeSFAccountValue(field, value);
      }
    }
    
    console.log(`[Salesforce Sync] Final accountData before create/update:`, JSON.stringify(accountData, null, 2));
    
    if (account) {
      console.log(`[Salesforce Sync] Account found for ${email}: ${account.Id}`);
      
      // Check if this is a Person Account or Business Account
      const isPersonAccount = (account as any).IsPersonAccount === true;
      console.log(`[Salesforce Sync] Account type: ${isPersonAccount ? 'Person Account' : 'Business Account'}`);
      
      // Update existing account - LastName and FirstName cannot be updated on Person Accounts
      const updateData: Record<string, any> = {};
      if (phone) updateData.Phone = phone;
      
      // Add address if available - use correct field based on account type
      if (person.adresse) {
        if (isPersonAccount) {
          updateData.PersonMailingStreet = person.adresse;
        } else {
          // For Business Accounts, use BillingStreet instead
          updateData.BillingStreet = person.adresse;
        }
      }
      
      // Add optional person fields (only for natural persons AND Person Accounts)
      if (!isJuristicPerson && isPersonAccount) {
        if (person.erwerbsstatus) {
          updateData.Erwerbsstatus__c = transformErwerbsstatus(person.erwerbsstatus);
        }
        if (person.zivilstand) {
          updateData.Zivilstand__c = transformZivilstand(person.zivilstand);
        }
        if (person.geburtsdatum) {
          const convertedDate = convertSwissDateToSalesforce(person.geburtsdatum);
          if (convertedDate) {
            updateData.Geburtsdatum__c = convertedDate;
            console.log(`[Salesforce Sync] Updating Geburtsdatum: ${person.geburtsdatum} -> ${convertedDate}`);
          }
        }
      }
      
      console.log(`[Salesforce Sync] Updating Account ${account.Id} with data:`, JSON.stringify(updateData, null, 2));
      await salesforceApi.updatePersonAccount(account.Id, updateData);
    } else {
      // Create new Account
      console.log(`[Salesforce Sync] Creating new Account for ${email || lastName}`);
      if (accountData.Salutation) {
        // createAccount already drops a field the org lacks or forbids and retries
        // (writeWithFieldFallback). Should Salutation still be refused for a reason that
        // helper does not know, the Anrede must not cost the Account — or the Case after it.
        try {
          account = await salesforceApi.createAccount(accountData);
        } catch (salutationErr) {
          console.warn(`[Salesforce Sync] Account create with Salutation failed, retrying without it:`, salutationErr);
          const { Salutation: _dropped, ...withoutSalutation } = accountData;
          account = await salesforceApi.createAccount(withoutSalutation);
        }
      } else {
        account = await salesforceApi.createAccount(accountData);
      }
      console.log(`[Salesforce Sync] Account created: ${account.id || account.Id}`);
    }

    accounts.push(account);

    // STEP 2: Find or create Contact linked to this Account
    // NOTE: Person Accounts cannot have Contacts - they contain contact info directly
    // Only create Contacts for Business Accounts (standard accounts)
    const accountId = account.id || account.Id;
    
    // Person Accounts are created with RecordTypeId for Person Account
    // We'll skip Contact creation for Person Accounts since they already contain contact data
    console.log(`[Salesforce Sync] Skipping Contact creation for Person Account ${accountId}`);
    console.log(`[Salesforce Sync] Person Account contains contact data directly`);
    
    // For compatibility with existing code, push null for person accounts
    contacts.push(null);
  }

  // STEP 3: Create ONE Case linked to the main Account (first person), if there is one
  const mainAccount = accounts[0];
  const mainAccountId = mainAccount ? (mainAccount.id || mainAccount.Id) : null;

  console.log(
    mainAccountId
      ? `[Salesforce Sync] Creating Case linked to main Account: ${mainAccountId}`
      : `[Salesforce Sync] Creating Case with no linked Account (no borrower name supplied)`
  );

  // Transform project type values
  if (!flatData.borrowerType && Array.isArray(stepData.borrowers) && stepData.borrowers.length > 0) {
    flatData.borrowerType = stepData.borrowers[0].type;
  }

  flatData.projektArt =
    flatData.projektArt === "kauf" ? "Neue Hypothek" :
    flatData.projektArt === "abloesung" ? "Ablösung" :
    flatData.projektArt;

  flatData.borrowerType =
    flatData.borrowerType === "nat" ? "Natürliche Person" :
    flatData.borrowerType === "jur" ? "Juristische Personen" :
    flatData.borrowerType;

  flatData.artImmobilie =
    flatData.artImmobilie === "bestehend" ? "Bestehende Immobilie" :
    flatData.artImmobilie === "neubau" ? "Neubau" :
    flatData.artImmobilie;

  flatData.neubauArt =
    flatData.neubauArt === "bereits_erstellt" ? "Bereits erstellt" :
    flatData.neubauArt === "bauprojekt" ? "Bauprojekt" :
    flatData.neubauArt;

  // Map every locale (DE/EN/FR/IT) label to the Salesforce restricted picklist value.
  // SF picklist: Einfamilienhaus, Wohnung, Mehrfamilienhaus, Landwirschaftszone.
  // Unmapped values are sent through; the createOrUpdateCase retry helper drops them
  // if SF rejects the picklist so the Case is still created. The table is shared with the
  // document rules (components/propertyLabels.ts), which branch on the same answer.
  if (flatData.artLiegenschaft && ART_LIEGENSCHAFT_MAP[flatData.artLiegenschaft]) {
    flatData.artLiegenschaft = ART_LIEGENSCHAFT_MAP[flatData.artLiegenschaft];
  }

  flatData.modell =
    flatData.modell === "saron" ? "Saron" :
    flatData.modell === "mix" ? "Mix" :
    flatData.modell === "1" ? "1 Jahr" :
    flatData.modell === "2" ? "2 Jahre" :
    flatData.modell === "3" ? "3 Jahre" :
    flatData.modell === "4" ? "4 Jahre" :
    flatData.modell === "5" ? "5 Jahre" :
    flatData.modell === "6" ? "6 Jahre" :
    flatData.modell === "7" ? "7 Jahre" :
    flatData.modell === "8" ? "8 Jahre" :
    flatData.modell === "9" ? "9 Jahre" :
    flatData.modell === "10" ? "10 Jahre" :
    flatData.modell;

  // SF picklist: Selbstbewohnt, Zweitwohnsitz, Vermietet & teilweise selbstbewohnt,
  // Rendite-Immobilie, Für eigenes Geschäft. NUTZUNG_MAP (components/propertyLabels.ts)
  // maps every locale label users see.
  if (flatData.nutzung) {
    flatData.nutzung = NUTZUNG_MAP[flatData.nutzung] ?? null;
  }

  // Erbvorbezug / Erbschaft has no Case field of its own. It is the same kind of money as a
  // Schenkung — family funds that count as Eigenmittel — so it is folded into the existing
  // Schenkung_usw__c figure. Done before the mapping loop so the Case field and the
  // Eigenmittel total below both see the combined amount. Darlehen is deliberately NOT
  // added: it has its own field, Darlehen_Eigenmittel__c (HYPOTEQ 19.10. D.1), and the legacy
  // Eigenmittel total below leaves it out (the v5 total counts it, calc.ts).
  const schenkungOnly = Number(flatData.eigenmittel_schenkung || 0);
  const erbschaft = Number(flatData.eigenmittel_erbschaft || 0);
  if (erbschaft > 0) {
    flatData.eigenmittel_schenkung = String(schenkungOnly + erbschaft);
  }

  // Build Case data
  const caseData: Record<string, any> = {};
  if (mainAccountId) caseData.AccountId = mainAccountId;

  // Map all Case fields from funnelToSalesforceMap
  for (const [funnelField, mapping] of Object.entries(funnelToSalesforceMap)) {
    if (mapping.salesforceObject !== "case") continue;

    // Accept alternate key names for korrespondenzsprache and Stage__c
    let value = flatData[funnelField];
    if (funnelField === 'korrespondenzsprache' && (value === undefined || value === null)) {
      value = flatData.korrespondenzSprache || flatData.correspondenceLanguage || value;
    }
    if (funnelField === 'Stage__c' && (value === undefined || value === null)) {
      value = flatData.stage || flatData.stage__c || value;
    }
    if (Array.isArray(value)) value = value.join(", ");

    // Renovationsbetrag__c only with Renovation = Ja (HYPOTEQ 19.10. B4).
    if (funnelField === 'renovationsBetrag' && !isYes(flatData.renovation)) continue;

    // Special handling for erhoehung_betrag: only set if erhoehung is "Ja"
    if (funnelField === 'erhoehung_betrag') {
      const erhoehungAnswer = flatData.erhoehung;
      if (erhoehungAnswer !== 'Ja' && erhoehungAnswer !== 'ja' && erhoehungAnswer !== 'yes' && erhoehungAnswer !== 'Yes') {
        console.log(`[Salesforce Sync] SKIPPED erhoehung_betrag because erhoehung is not "Ja": ${erhoehungAnswer}`);
        continue; // Skip this field if user didn't answer "Ja" to the increase question
      }
    }

    const sfField = mapping.salesforceField;
    const sanitized = sanitizeSFValue(sfField, value);

    // Skip null currency fields for Ablösung-specific fields to avoid Salesforce errors
    const isAbloesungCurrencyField = sfField === 'Hypothekarbetrag__c';
    const isNullCurrency = sanitized === null && SALESFORCE_CASE_FIELDS[sfField] === "currency";

    if (sanitized !== undefined && !(isAbloesungCurrencyField && isNullCurrency)) {
      caseData[sfField] = sanitized;
      // Log Ablösung-specific fields for debugging
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag' || funnelField === 'korrespondenzsprache' || funnelField === 'Stage__c') {
        console.log(`[Salesforce Sync] Mapped ${funnelField}: ${value} → ${sfField}: ${sanitized}`);
      }
    } else {
      // Log when a field is skipped
      if (funnelField === 'abloesung_betrag' || funnelField === 'erhoehung' || funnelField === 'erhoehung_betrag' || funnelField === 'kaufdatum' || funnelField === 'kommentar' || funnelField === 'hypothekarbetrag' || funnelField === 'korrespondenzsprache' || funnelField === 'Stage__c') {
        console.log(`[Salesforce Sync] SKIPPED ${funnelField} (value was undefined after sanitization): ${value}`);
      }
    }
  }

  // === KAUF- & ABLÖSE-DATUM (HYPOTEQ 19.10. B13 / B15, DECISIONS V41) — every payload ===
  // Kaufdatum__c is Text(80): «TT.MM.JJJJ» (or the text as typed); Kaufdatum_Datum__c the real
  // date, only when it is one. At an Ablösung flatData.kaufdatum is the Ablösedatum (above).
  delete caseData['Kaufdatum__c'];
  const kaufdatumText = toKaufdatumText(flatData.kaufdatum);
  if (kaufdatumText) caseData['Kaufdatum__c'] = kaufdatumText;
  const kaufdatumIso = toSalesforceDate(flatData.kaufdatum);
  if (kaufdatumIso) caseData['Kaufdatum_Datum__c'] = kaufdatumIso;

  // Calculate and add Hypothekenbedarf, Eigenmittel %, Tragbarkeit %
  const kaufpreis = Number(flatData.kaufpreis || 0);
  const eigenmittel_bar = Number(flatData.eigenmittel_bar || 0);
  const eigenmittel_saeule3 = Number(flatData.eigenmittel_saeule3 || 0);
  const eigenmittel_pk = Number(flatData.eigenmittel_pk || 0);
  // Already includes Erbschaft (folded in above); Darlehen is excluded on purpose.
  const eigenmittel_schenkung = Number(flatData.eigenmittel_schenkung || 0);
  const eigenmittel = eigenmittel_bar + eigenmittel_saeule3 + eigenmittel_pk + eigenmittel_schenkung;

  // The funnel's own calculation (lib/funnel-v3/calc.ts) — what the customer saw.
  const v3Calc = v3State ? calcForState(v3State) : null;

  // Add total Eigenmittel to Case
  if (eigenmittel > 0) {
    caseData['Eigenmittel__c'] = eigenmittel;
    console.log(`[Salesforce Sync] Total Eigenmittel: ${eigenmittel}`);
  }
  // === FUNNEL V5 EIGENMITTEL TOTAL (Handover 8 «Eigenmittel total», DECISIONS V41) ===
  // Eigenmittel_Total__c of the proposal is Eigenmittel__c in the existing mapping (V5). Its value
  // is the funnel's «Eigenmittel total»: Ersparnisse + 3a + PK-Vorbezug + Schenkung + Erbvorbezug
  // + Darlehen (PK-Verpfändung is a security). An Ablösung has none — its Säule 3a is Vorsorge.
  if (v3Calc) {
    if (isKauf && v3Calc.emTotal > 0) caseData['Eigenmittel__c'] = v3Calc.emTotal;
    else delete caseData['Eigenmittel__c'];
  }

  // Tragbarkeit / Eigenmittel % — MUST mirror components/funnelCalc.tsx exactly so
  // Salesforce matches the values the customer saw in the funnel calculator.
  const STRESS_RATE = 0.05;
  const MAINTENANCE_RATE = 0.008;
  const borrowerType = stepData.borrowers?.[0]?.type;
  const isJur = borrowerType === 'jur';
  const grossIncome = Number(flatData.brutto || 0) + Number(flatData.bonus || 0);
  // Primary residence unless the usage is a second / holiday home
  const isZweitwohnsitz = isZweitwohnsitzNutzung(flatData.nutzung);
  const isPrimaryResidence = !isZweitwohnsitz;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  // Affordability ratio (natural persons only): same formula as funnelCalc.tsx
  const affordabilityPct = (totalMortgage: number): number | null => {
    if (isJur || grossIncome <= 0) return null;
    const amort = isPrimaryResidence ? ((0.8 - 0.6667) / 15) : 0;
    const affordabilityCHF = totalMortgage * (STRESS_RATE + MAINTENANCE_RATE + amort);
    return round1((affordabilityCHF / grossIncome) * 100);
  };

  // === FUNNEL V3 GESAMTFINANZIERUNG (spec 6.7, DECISIONS S6; v5 Handover 5) — v3 payloads only ===
  // The Gesamtfinanzierung is the funnel's own calculation (lib/funnel-v3/calc.ts, the same
  // the customer saw): Kauf = Kaufpreis + Renovation − Eigenmittel (none entered: 80 %),
  // Ablösung = bestehende + Erhöhung. Computed here from the submitted answers; the payload's
  // financing.hypoBetrag (the same number) is the fallback. Tragbarkeit__c and
  // EigenmittelProzent__c of a v5 payload are replaced by the funnel's values below
  // (v5PercentFields, HYPOTEQ 19.10. B14); the formulas here stay for legacy payloads (S1).
  const v3Need = v3Calc ? v3Calc.need : NaN;
  const v3HypoBetragRaw = stepData.v3 ? Number(String(flatData.hypoBetrag ?? '').replace(/'/g, '')) : NaN;
  const v3HypoBetrag =
    Number.isFinite(v3Need) && v3Need > 0 ? v3Need : Number.isFinite(v3HypoBetragRaw) && v3HypoBetragRaw > 0 ? v3HypoBetragRaw : null;

  if (isKauf && v3HypoBetrag !== null) {
    caseData['Gesch_tzter_Hypothekenbedarf__c'] = v3HypoBetrag;

    // Eigenmittel % = the part of the object value the mortgage does not cover.
    const objectValue = Number(flatData.immobilienwert || 0) || kaufpreis;
    if (objectValue > 0) caseData['EigenmittelProzent__c'] = round1(((objectValue - v3HypoBetrag) / objectValue) * 100);

    const tragb = affordabilityPct(v3HypoBetrag);
    if (tragb !== null) caseData['Tragbarkeit__c'] = tragb;

    console.log(`[Salesforce Sync] v3 Kauf calc: Gesamtfinanzierung=${v3HypoBetrag}, Objektwert=${objectValue}, Eigenmittel%=${caseData['EigenmittelProzent__c']}, Tragbarkeit%=${caseData['Tragbarkeit__c']}`);
  // === END FUNNEL V3 GESAMTFINANZIERUNG (the Ablösung branch below reads v3HypoBetrag too) ===
  } else if (isKauf) {
    // funnelCalc: companies (juristic) count only cash (Bar) as equity
    const ownFundsForCalc = isJur ? eigenmittel_bar : eigenmittel;
    const hypothekenbedarf = Math.max(kaufpreis - ownFundsForCalc, 0);
    caseData['Gesch_tzter_Hypothekenbedarf__c'] = hypothekenbedarf;

    if (kaufpreis > 0) caseData['EigenmittelProzent__c'] = round1((ownFundsForCalc / kaufpreis) * 100);

    const tragb = affordabilityPct(hypothekenbedarf);
    if (tragb !== null) caseData['Tragbarkeit__c'] = tragb;

    console.log(`[Salesforce Sync] Kauf calc: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel%=${caseData['EigenmittelProzent__c']}, Tragbarkeit%=${caseData['Tragbarkeit__c']}`);
  } else if (isAbloesung) {
    // totalMortgage = bestehende Hypothek + Erhöhung (falls Ja)
    const betrag = Number(flatData.abloesung_betrag || 0);
    const erhoehungJa = String(flatData.erhoehung).toLowerCase() === 'ja' || String(flatData.erhoehung).toLowerCase() === 'yes';
    const erhoehung = erhoehungJa ? Number(flatData.erhoehung_betrag || 0) : 0;
    // Funnel v3: the Gesamtfinanzierung the funnel showed (same sum, computed once in calc.ts).
    const hypothekenbedarf = v3HypoBetrag !== null ? v3HypoBetrag : betrag + erhoehung;
    caseData['Gesch_tzter_Hypothekenbedarf__c'] = hypothekenbedarf;

    const propertyValue = Number(flatData.immobilienwert || 0) || Number(flatData.kaufpreis || 0) || hypothekenbedarf;
    if (propertyValue > 0) caseData['EigenmittelProzent__c'] = round1(((propertyValue - hypothekenbedarf) / propertyValue) * 100);

    const tragb = affordabilityPct(hypothekenbedarf);
    if (tragb !== null) caseData['Tragbarkeit__c'] = tragb;

    console.log(`[Salesforce Sync] Ablösung calc: Hypothekenbedarf=${hypothekenbedarf}, Eigenmittel%=${caseData['EigenmittelProzent__c']}, Tragbarkeit%=${caseData['Tragbarkeit__c']}`);
  }

  // === FUNNEL V5 TRAGBARKEIT / EIGENMITTEL % (HYPOTEQ 19.10. B14, DECISIONS V41) — v3 / v5 payloads ===
  // The values the funnel showed (calc.ts, Handover formula), not the S1 / S6 formulas above.
  if (v3State && v3Calc) {
    delete caseData['Tragbarkeit__c'];
    delete caseData['EigenmittelProzent__c'];
    Object.assign(caseData, v5PercentFields(v3State, v3Calc));
    console.log(`[Salesforce Sync] v5 calc: Eigenmittel%=${caseData['EigenmittelProzent__c'] ?? '–'}, Tragbarkeit%=${caseData['Tragbarkeit__c'] ?? '–'}`);
  }

  // Add partner email AFTER mapping to prevent it from being overwritten
  // TODO: Uncomment after creating Partner_Email__c field in Salesforce
  // if (partnerEmail) {
  //   caseData['Partner_Email__c'] = partnerEmail;
  //   console.log(`[Salesforce Sync] Added partner email to Case: ${partnerEmail}`);
  // }

  // ONLY link Client 2 Account if there are actually 2 or more persons (moved to end after cleanup)

  // FINANCING LOGIC: Temporarily store bank data to apply after cleanup
  let bankData: Record<string, any> = {};
  const hasFinancingOffers = flatData.finanzierungsangebote;
  const hasFinancing = hasFinancingOffers === 'Ja' || hasFinancingOffers === true || hasFinancingOffers === 'yes' || hasFinancingOffers === 'ja';

  console.log('[Salesforce Sync] finanzierungsangebote:', flatData.finanzierungsangebote, 'hasFinancing:', hasFinancing);

  if (hasFinancing) {
    console.log('[Salesforce Sync] Financing offers exist - mapping bank fields');
    
    // Map multiple bank offers from angebote array
    const angebote = flatData.angebote || stepData.property?.angebote || [];
    console.log('[Salesforce Sync] angebote array:', JSON.stringify(angebote, null, 2));
    
    if (Array.isArray(angebote) && angebote.length > 0) {
      // First bank offer
      if (angebote[0]) {
        bankData['Bank__c'] = angebote[0].bank || null;
        bankData['Zins__c'] = parsePercent(angebote[0].zins);
        bankData['Laufzeit__c'] = angebote[0].laufzeit || null;
        console.log('[Salesforce Sync] Bank 1:', angebote[0].bank, 'Zins:', angebote[0].zins, 'Laufzeit:', angebote[0].laufzeit);
      }
      
      // Second bank offer
      if (angebote[1]) {
        bankData['Bank2__c'] = angebote[1].bank || null;
        bankData['Zins2__c'] = parsePercent(angebote[1].zins);
        bankData['Laufzeit2__c'] = angebote[1].laufzeit || null;
        console.log('[Salesforce Sync] Mapped second bank offer');
      }
      
      // Third bank offer
      if (angebote[2]) {
        bankData['Bank3__c'] = angebote[2].bank || null;
        bankData['Zins3__c'] = parsePercent(angebote[2].zins);
        bankData['Laufzeit3__c'] = angebote[2].laufzeit || null;
        console.log('[Salesforce Sync] Mapped third bank offer');
      }
    }
  }

  // Set Hypothekarvolumen__c based on project type
  if (isKauf && caseData['Gesch_tzter_Hypothekenbedarf__c']) {
    // For purchase: use calculated mortgage need
    caseData['Hypothekarvolumen__c'] = caseData['Gesch_tzter_Hypothekenbedarf__c'];
  } else if (isAbloesung) {
    // For refinancing: use total (abloesung_betrag + hypothekarbetrag + erhoehung if applicable)
    const abloesungBetrag = Number(flatData.abloesung_betrag || 0);
    const hypothekarBetrag = Number(flatData.hypothekarbetrag || 0);
    const erhoehungBetrag = flatData.erhoehung === 'Ja' ? Number(flatData.erhoehung_betrag || 0) : 0;
    const totalVolumen = abloesungBetrag + hypothekarBetrag + erhoehungBetrag;
    if (totalVolumen > 0) {
      caseData['Hypothekarvolumen__c'] = totalVolumen;
      console.log(`[Salesforce Sync] Hypothekarvolumen: ${abloesungBetrag} + ${hypothekarBetrag} + ${erhoehungBetrag} = ${totalVolumen}`);
    }
  }

  // Property location. Direct: PLZ/Ort come from the client. Partner: from the property
  // section. Both land in flatData (client spread last wins for direct; property provides
  // them for partner). PropertyStep makes both mandatory, so they are normally present.
  const plz = String(flatData.zip || flatData.liegenschaftZip || '').trim();
  const ort = String(flatData.ort || '').trim();
  // PLZ and Ort read together as one location ("8001 Zürich").
  const location = [plz, ort].filter(Boolean).join(' ');

  // Populate the Objektinformationen fields too — the funnel already asks for this, and
  // until now it was only ever used to build the Case name.
  if (location) caseData['PLZ_Ort__c'] = location;
  if (ort) caseData['City__c'] = ort;
  console.log(`[Salesforce Sync] Location → PLZ_Ort__c: "${location}", City__c: "${ort}"`);

  // === FUNNEL V5 VALUES FROM THE DOCUMENTS AND THE COMPANY (Handover 8) — v3 / v5 payloads only ===
  if (v3State) {
    // Heizungsart is no longer asked; the documents say it (Verkaufsdokumentation, GVZ).
    const heizung = toWaermeerzeugung(v3State.info?.heizung);
    if (heizung) caseData['Waermeerzeugung__c'] = heizung;
    // (A company's zeichnungsberechtigte Person is its Contact since HYPOTEQ 19.10. B16 — no
    // longer the first line of Kommentar__c; the JSON keeps it, `kontakt.zeichnungsberechtigt`.)

    // HYPOTEQ 19.10. B17 / D.1: the Geschätzter Objektwert as entered — an empty one is not
    // invented from the Kaufpreis (Kaufpreis__c has that), DECISIONS V60.
    if (v3State.fin.val > 0) caseData['Geschaetzter_Objektwert__c'] = Math.round(v3State.fin.val);
    // HYPOTEQ 19.10. D.1: the chips in Checkboxes as well («auswertbar»); the JSON keeps them.
    caseData['Privatkredit__c'] = v3State.ans.kredite === 'Ja';
    caseData['Leasing__c'] = v3State.ans.leasing === 'Ja';
    caseData['Unterhaltspflicht__c'] = v3State.ans.unterhalt === 'Ja';
    caseData['Solidarbuergschaft__c'] = v3State.ans.buerge === 'Ja';
  } else {
    // v1 «Geschätzter Objektwert» (HYPOTEQ 19.10. B17 «Reste aus v1»): the legacy funnel's value.
    const value = Number(String(flatData.immobilienwert ?? '').replace(/CHF\s?|'/gi, '').trim());
    if (Number.isFinite(value) && value > 0) caseData['Geschaetzter_Objektwert__c'] = value;
  }
  // === END FUNNEL V5 VALUES ===

  // Document completeness (spec: Dokumenten-Upload & Completeness-Check).
  // The verdict is computed in the funnel, because only the client knows which document
  // sections were rendered for this case type. Written into fields that already existed
  // on Case and had never been populated.
  const completeness = stepData.documentCompleteness;
  // Funnel v3 writes its own document fields further down (after the cleanup).
  if (!stepData.v3 && completeness && typeof completeness === 'object') {
    caseData['Documents_completed__c'] = completeness.complete === true;

    for (const [field, provided] of Object.entries(completeness.salesforceFlags || {})) {
      caseData[field] = provided === true;
    }

    // Human-readable state for the Dokumenten-Check tab. German on purpose: this is read
    // by HYPOTEQ staff, not by the customer, whatever locale the funnel ran in.
    // Resolve i18n keys to readable German labels. The Dokumenten-Check tab is read by
    // HYPOTEQ staff, so it stays German whatever locale the funnel ran in — and a raw
    // "funnel.salaryStatementBonus" in the CRM helps nobody.
    const missingLabels: string[] = Array.isArray(completeness.missingLabels)
      ? completeness.missingLabels
      : resolveDocLabelsDe(completeness.missing || []);
    // Dokumenten_Check_State__c is NOT free text: it is the JSON "checked map" that drives
    // the Dokumenten-Check tab. Writing German prose into it, as this once did, left the tab
    // unable to parse its own state — so that was disabled, and the tab then showed
    // "0 / 11 Dokumente" on every dossier no matter what the customer had uploaded, because
    // the tab does not read the Dok_*__c booleans below. It reads only this field.
    //
    // The schema is now known (read back off Cases staff had saved by hand) and lives in
    // dokumentenCheckState.ts. Nothing is merged here: this runs at submit time, when the
    // Case is being created and has no state to preserve.
    const { buildDokumentenCheckState, tabEntriesFor, unmappedSupplied } = await import('./dokumentenCheckState');
    const supplied: string[] = Array.isArray(completeness.supplied) ? completeness.supplied : [];
    const checkState = buildDokumentenCheckState(supplied);
    if (checkState) caseData['Dokumenten_Check_State__c'] = checkState;

    // Documents the customer supplied that the tab has no entry for. Logged rather than
    // dropped in silence: it is the only signal that the tab's checklist and the funnel's
    // document set have drifted apart, and it reads as "the sync is broken" otherwise.
    const notShown = unmappedSupplied(supplied);
    if (notShown.length) {
      console.warn(
        `[Salesforce Sync] ${notShown.length} uploaded document(s) have no Dokumenten-Check entry ` +
        `and will not appear in the tab: ${notShown.join(', ')}`
      );
    }

    console.log(
      `[Salesforce Sync] Documents complete=${completeness.complete}, ` +
      `missing=${missingLabels.length}, supplied=${supplied.length}, ` +
      `tab entries ticked=${tabEntriesFor(supplied).length}, ` +
      `flags=${JSON.stringify(completeness.salesforceFlags)}`
    );
  }

  // Case_Name__c is required at creation (HYPOTEQ 19.10. D.4, DECISIONS V65): «{Nachname}
  // {Vorname} – {PLZ} {Ort}», a company «{Firma} – {PLZ} {Ort}» — always set here, for every
  // payload, whatever a payload's own caseName said. Kreditnehmer 1 names the Case.
  {
    const first = persons[0] as any;
    const who = v3State
      ? v3State.ans.kn === 'Juristische Person'
        ? { firma: v3State.txt.firma }
        : { nachname: v3State.txt.nach || v3State.borrowers[0]?.nach, vorname: v3State.txt.vor || v3State.borrowers[0]?.vor }
      : first?.isJuristic
        ? { firma: first.lastName }
        : { nachname: first?.lastName === 'Unknown' ? '' : first?.lastName, vorname: first?.firstName };
    caseData['Case_Name__c'] = funnelCaseName({ ...who, plz, ort, submitter: partnerEmail || flatData.email || '' });
  }

  // Clean up: Remove non-Case fields
  for (const key of Object.keys(caseData)) {
    if (!SALESFORCE_CASE_FIELDS[key] && key !== "AccountId") {
      console.warn(`🧹 Removing non-case field from Case: ${key}`);
      delete caseData[key];
    }
  }

  // Validate field types
  for (const [field, type] of Object.entries(SALESFORCE_CASE_FIELDS)) {
    const value = caseData[field];
    if (value == null) continue;
    
    if (type === "currency" && typeof value !== "number") {
      console.error(`❌ Currency field got non-number`, field, value);
      caseData[field] = null;
    }
    if (type === "percent" && typeof value !== "number") {
      const n = Number(value);
      caseData[field] = Number.isFinite(n) ? n : null;
    }
    if (type === "boolean" && typeof value !== "boolean") {
      console.error(`❌ Boolean field got non-boolean`, field, value);
      caseData[field] = false;
    }
    if (type === "date" && typeof value !== "string") {
      caseData[field] = null;
    }
  }

  // Convert empty strings to null
  Object.keys(caseData).forEach(
    k => caseData[k] === "" && (caseData[k] = null)
  );

  // Apply bank data AFTER cleanup to prevent it being removed
  console.log('[Salesforce Sync] Applying bank data after cleanup:', JSON.stringify(bankData, null, 2));
  Object.assign(caseData, bankData);

  // Funnel v3 documents (spec 6.9 / 6.11, DECISIONS S3) — only for a v3 payload; the legacy
  // completeness block above is skipped for it. Applied after the cleanup like the bank data,
  // because SharePoint_Doc__c is not in SALESFORCE_CASE_FIELDS (a field the org lacks is
  // dropped by writeWithFieldFallback). Dok_*__c and Documents_completed__c come from the
  // requirement status; Dokumenten_Check_State__c is merged onto what a Case we update holds.
  if (stepData.v3) {
    const { v3DocumentCaseFields } = await import('@/lib/funnel-v3/completion');
    const previous = await readRecentCaseCheckState(salesforceApi, caseData.AccountId);
    const v3Fields = v3DocumentCaseFields(stepData, previous);
    if (v3Fields) {
      // Handover 8 / DECISIONS V5: what the existing mapping keeps elsewhere or has no field
      // for travels in the JSON as well — the funnel's calculation and the contact.
      if (v3State && v3Calc && typeof v3Fields.Dokumenten_Check_State__c === 'string') {
        v3Fields.Dokumenten_Check_State__c = withV5CheckStateBlocks(v3Fields.Dokumenten_Check_State__c, v5CheckStateBlocks(v3State, v3Calc));
      }
      Object.assign(caseData, v3Fields);
      // HYPOTEQ 19.10. E.4: «die AI-Einschätzung nur als Hinweis am Case vermerken» — beside the
      // JSON, where someone opening the Case reads it.
      const sigNote = signatureCaseNote(v3Fields.Dokumenten_Check_State__c);
      if (sigNote) prependComment(caseData, sigNote);
      console.log(`[Salesforce Sync] v3 documents: complete=${v3Fields.Documents_completed__c}, folder=${v3Fields.SharePoint_Doc__c ? 'yes' : 'no'}`);
    }
  }

  // Link Client lookup fields AFTER all cleanup to prevent them being overwritten. A company:
  // AccountId and Client__c are its Business Account, ContactId its signatory (HYPOTEQ 19.10. B16).
  if (mainAccountId) {
    caseData['Client__c'] = mainAccountId;
    console.log(`[Salesforce Sync] Linked Client Account: ${mainAccountId}`);
  }
  const mainContactId = contacts[0]?.id || contacts[0]?.Id;
  if (mainContactId) {
    caseData['ContactId'] = mainContactId;
    console.log(`[Salesforce Sync] Linked Contact: ${mainContactId}`);
  }
  console.log(`[Salesforce Sync] Number of clients: ${persons.length}`);

  // Add Erwerbsstatus to Case (only for natural persons)
  const firstPerson = persons[0];
  const isJuristicPerson = (firstPerson as any)?.isJuristic === true;
  if (firstPerson && !isJuristicPerson && firstPerson.erwerbsstatus) {
    caseData['If_nat_rliche_person__c'] = transformErwerbsstatus(firstPerson.erwerbsstatus);
    console.log(`[Salesforce Sync] Adding Erwerbsstatus to Case: ${firstPerson.erwerbsstatus} -> ${caseData['If_nat_rliche_person__c']}`);
  }
  
  if (persons.length >= 2 && accounts[1]) {
    const account2Id = accounts[1].id || accounts[1].Id;
    caseData['Client_2__c'] = account2Id;
    console.log(`[Salesforce Sync] Linked Client 2 Account: ${account2Id}`);
  } else {
    caseData['Client_2__c'] = null;
  }

  if (persons.length >= 3 && accounts[2]) {
    const account3Id = accounts[2].id || accounts[2].Id;
    caseData['Client_3__c'] = account3Id;
    console.log(`[Salesforce Sync] Linked Client 3 Account: ${account3Id}`);
  } else {
    caseData['Client_3__c'] = null;
  }

  // HYPOTEQ 19.10. B17: how many borrowers the Case links (1 / 2 / 3; a company is one).
  const linkedClients = accounts.filter(Boolean).length;
  if (linkedClients > 0) caseData['Wie_viele_Kunden__c'] = String(Math.min(linkedClients, 3));

  // Two distinct roles, two distinct Case fields — they were previously conflated:
  //   - Kundenberater / customer advisor = Partner_Consultant__c, a *Contact* lookup.
  //     Only a partner submission has one (the submitting partner's own Contact).
  //   - Sales Partner = SALES_PARTNER_FIELD, an *Account* lookup (the partner company).
  //     Direct-customer leads belong to HYPOTEQ AG itself.
  // A direct lead must NOT put HYPOTEQ into Partner_Consultant__c — HYPOTEQ AG is the
  // sales partner, not the customer's advisor.
  if (partnerEmail) {
    // Spec 6.3 / DECISIONS D13. Fresh lookup: the Case is what HYPOTEQ works from, so it
    // must not rest on a recognition cached minutes ago in the browser's session.
    await applyPartnerToCase(caseData, partnerEmail, stepData.partner);
  } else {
    // Direktkundenfunnel → HYPOTEQ AG is the sales partner. Resolve its Account by name.
    // Deliberately lookup-only: silently creating a second "HYPOTEQ AG" Account would
    // split the org's own pipeline across duplicates, so a miss is logged loudly instead.
    try {
      // salesforceApi is `any` and callers pass its *default export* object, so a
      // function absent from that object is silently undefined. Assert rather than
      // let the TypeError disappear into the catch below.
      if (typeof salesforceApi.findAccountByName !== 'function') {
        throw new Error(
          'salesforceApi.findAccountByName is not a function — it is likely missing from the ' +
          'default export in components/salesforceApi.ts'
        );
      }
      const hypoteqAccount = await salesforceApi.findAccountByName(HYPOTEQ_ACCOUNT_NAME);
      const hypoteqAccountId = hypoteqAccount?.Id || hypoteqAccount?.id;
      if (hypoteqAccountId) {
        caseData[SALES_PARTNER_FIELD] = hypoteqAccountId;
        console.log(`[Salesforce Sync] Direct client → sales partner ${HYPOTEQ_ACCOUNT_NAME}: ${hypoteqAccountId}`);
      } else {
        console.error(
          `[Salesforce Sync] Sales partner Account "${HYPOTEQ_ACCOUNT_NAME}" not found — Case will have no sales partner. ` +
          `Create the Account or set HYPOTEQ_ACCOUNT_NAME to its exact name.`
        );
      }
    } catch (err) {
      console.error(`[Salesforce Sync] Error resolving HYPOTEQ sales partner Account:`, err);
    }
  }

  await applyFunnelOwner(caseData, salesforceApi);
  await applyFunnelRecordType(caseData, salesforceApi);

  console.log('[Salesforce Sync] Full caseData before sending:', JSON.stringify(caseData, null, 2));

  // Create the Case
  const createdCase = await salesforceApi.createOrUpdateCase(caseData);
  console.log(`[Salesforce Sync] Case created: ${createdCase.id || createdCase.Id}`);

  console.log('[Salesforce Sync] ✅ Sync completed successfully');
  
  // Fields the API had to drop or truncate on the way (components/salesforceApi.ts). The
  // route reports them; a fake API in tests has no collector.
  const droppedFields: string[] = typeof (salesforceApi as any).takeDroppedFields === 'function' ? (salesforceApi as any).takeDroppedFields() : [];
  if (droppedFields.length) console.warn(`[Salesforce Sync] fields not written: ${droppedFields.join(', ')}`);

  return {
    accounts,
    contacts,
    case: createdCase,
    droppedFields,
  };
}