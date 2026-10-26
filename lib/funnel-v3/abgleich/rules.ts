/**
 * The Prüfmatrix as configuration (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich 4 and 4.3;
 * answers of 26.10.2026): HYPOTEQ keeps the rules in Salesforce (`Pruefregel__c`, one row per
 * rule); the funnel reads them (lib/funnel-v3/abgleich/config.ts, cached) and falls back to the
 * start values below — the 16 rows HYPOTEQ created, as read from the org on 26.10.2026 — when
 * Salesforce cannot be reached. Pure.
 *
 * A rule names its sources by HYPOTEQ's document keys (`lohnausweis`, `pass_id` …);
 * `SOURCE_TYPES` maps them onto the recognition catalogue's types. A key the funnel does not
 * know is ignored, so a new source in Salesforce never breaks the comparison.
 */

export type Severity = "conflict" | "identity_conflict" | "hint";

export interface PruefRegel {
  /** `Feld_Key__c` — the field the rule checks («jahreseinkommen»). */
  key: string;
  /** `Primaerquelle__c`: a deviation from it is a conflict (of `severity`). */
  primary: string[];
  /** `Sekundaerquellen__c`: a deviation from them is a hint for the analyst only. */
  secondary: string[];
  /** `Toleranz_Prozent__c`; 0 = equal after normalisation. */
  tolerancePct: number;
  /** `Schwelle_Gruen__c`: from this confidence on a value is compared. */
  green: number;
  /** `Schwelle_Gelb__c`: from this confidence on a value is «zu prüfen»; below it is not used. */
  yellow: number;
  /** `Nur_Unterschreitung__c`: only a document value below the funnel's is a deviation. */
  onlyBelow: boolean;
  severity: Severity;
  active: boolean;
}

/** Spezifikation 4.2, confirmed 26.10.2026 (the 0.8 of chapter 4 is gone). */
export const DEFAULT_GREEN = 0.9;
export const DEFAULT_YELLOW = 0.6;

const rule = (key: string, primary: string, secondary: string, tolerancePct: number, extra: Partial<PruefRegel> = {}): PruefRegel => ({
  key,
  primary: list(primary),
  secondary: list(secondary),
  tolerancePct,
  green: DEFAULT_GREEN,
  yellow: DEFAULT_YELLOW,
  onlyBelow: false,
  severity: "conflict",
  active: true,
  ...extra,
});

/** `Pruefregel__c` as HYPOTEQ filled it (PR-0000 … PR-0015). */
export const FALLBACK_RULES: readonly PruefRegel[] = [
  rule("name_kreditnehmer", "pass_id", "lohnausweis,steuererklaerung,betreibungsauszug", 0, { severity: "identity_conflict" }),
  rule("geburtsdatum", "pass_id", "pensionskassenausweis", 0),
  rule("nationalitaet_bewilligung", "pass_id", "", 0),
  rule("jahreseinkommen", "lohnausweis", "monatslohnabrechnungen,steuererklaerung", 5),
  rule("einkommen_selbstaendig", "erfolgsrechnung", "steuererklaerung", 10),
  rule("renteneinkommen", "rentenbescheinigung", "steuererklaerung", 5),
  rule("eigenmittel_total", "kontoauszug,saeule3a_auszug,pk_ausweis", "steuererklaerung", 10, { onlyBelow: true }),
  rule("eigenmittel_3a", "saeule3a_auszug", "", 5),
  rule("eigenmittel_pk_vorbezug", "pk_ausweis", "", 0, { onlyBelow: true }),
  rule("eigenmittel_schenkung_darlehen_erbe", "schenkungsvertrag,darlehensvertrag,erbvertrag", "", 5),
  rule("kaufpreis", "kaufvertrag", "reservationsvertrag,verkaufsdokumentation", 0),
  rule("objekt_adresse", "grundbuchauszug", "kaufvertrag,gebaeudeversicherung,verkaufsdokumentation", 0),
  rule("bestehende_hypothek_betrag", "produktvereinbarung", "steuererklaerung", 2),
  rule("mietzins_rendite", "mieterspiegel", "steuererklaerung", 5),
  rule("verpflichtungen", "leasingvertrag,darlehensvertrag,unterhaltsvereinbarung", "steuererklaerung,betreibungsauszug", 5, { severity: "hint" }),
  rule("baujahr_kubatur", "gebaeudeversicherung", "verkaufsdokumentation", 10),
];

/**
 * Spezifikation 4: «Sekundär ±15 % ⇒ Hinweis» for the income — `Pruefregel__c` has one
 * tolerance per rule, so the secondary one of the matrix stays here.
 */
export const SECONDARY_TOLERANCE_PCT: Readonly<Record<string, number>> = { jahreseinkommen: 15 };

/** HYPOTEQ's document keys → the recognition catalogue's types (components/documentIntelligence/v3/catalogue.ts). */
export const SOURCE_TYPES: Readonly<Record<string, readonly string[]>> = {
  pass_id: ["id"],
  pensionskassenausweis: ["pk"],
  pk_ausweis: ["pk", "pkvorbezug"],
  lohnausweis: ["lohnausweise"],
  monatslohnabrechnungen: ["lohnabrechnungen"],
  steuererklaerung: ["steuer"],
  betreibungsauszug: ["betreibung"],
  erfolgsrechnung: ["abschluss_se"],
  rentenbescheinigung: ["rente"],
  kontoauszug: ["vermoegen"],
  saeule3a_auszug: ["s3a", "police"],
  schenkungsvertrag: ["schenkung"],
  darlehensvertrag: ["darlehen"],
  erbvertrag: ["erbe"],
  kaufvertrag: ["kaufvertrag"],
  reservationsvertrag: ["reservation"],
  verkaufsdokumentation: ["verkaufsdoku"],
  grundbuchauszug: ["grundbuch"],
  gebaeudeversicherung: ["gvz"],
  produktvereinbarung: ["produkt", "hyp_zins"],
  mieterspiegel: ["mieterspiegel"],
  leasingvertrag: ["leasing"],
  unterhaltsvereinbarung: ["unterhalt"],
};

/** Where a key means something else in one rule: the «Darlehensvertrag» of the Verpflichtungen is the Privatkredit. */
const RULE_SOURCE_TYPES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  verpflichtungen: { darlehensvertrag: ["kredit"] },
};

/** The catalogue types behind a rule's sources, in the order given. */
export function sourceTypes(ruleKey: string, sources: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of sources) for (const t of RULE_SOURCE_TYPES[ruleKey]?.[s] ?? SOURCE_TYPES[s] ?? []) if (!out.includes(t)) out.push(t);
  return out;
}

/** HYPOTEQ's key for a catalogue type in this rule (for `extracted[].docType`). */
export function sourceKeyOf(ruleKey: string, typeId: string, sources: readonly string[]): string {
  return sources.find((s) => (RULE_SOURCE_TYPES[ruleKey]?.[s] ?? SOURCE_TYPES[s] ?? []).includes(typeId)) ?? typeId;
}

function list(v: unknown): string[] {
  return String(v ?? "")
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
const SEVERITIES: readonly Severity[] = ["conflict", "identity_conflict", "hint"];

/**
 * Rows of `SELECT … FROM Pruefregel__c WHERE Aktiv__c = true` as rules. A row without
 * `Feld_Key__c` or without a primary source is skipped; a threshold out of range falls back to
 * 4.2. Returns null when no row is usable, so the caller keeps the fallback.
 */
export function rulesFromSalesforce(rows: readonly Record<string, unknown>[] | null | undefined): PruefRegel[] | null {
  const out: PruefRegel[] = [];
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    const key = String(r?.Feld_Key__c ?? "").trim().toLowerCase();
    const primary = list(r?.Primaerquelle__c);
    if (!key || !primary.length || seen.has(key)) continue;
    seen.add(key);
    const green = num(r.Schwelle_Gruen__c, DEFAULT_GREEN);
    const yellow = num(r.Schwelle_Gelb__c, DEFAULT_YELLOW);
    const severity = SEVERITIES.includes(r.Severity__c as Severity) ? (r.Severity__c as Severity) : "conflict";
    out.push({
      key,
      primary,
      secondary: list(r.Sekundaerquellen__c),
      tolerancePct: num(r.Toleranz_Prozent__c, 0),
      green: green <= 1 ? green : DEFAULT_GREEN,
      yellow: yellow <= 1 && yellow <= green ? yellow : DEFAULT_YELLOW,
      onlyBelow: r.Nur_Unterschreitung__c === true,
      severity,
      active: r.Aktiv__c !== false,
    });
  }
  return out.length ? out : null;
}

/** The SOQL the funnel reads the rules with (answer 5, 26.10.2026). */
export const PRUEFREGEL_SOQL =
  "SELECT Feld_Key__c, Primaerquelle__c, Sekundaerquellen__c, Toleranz_Prozent__c, Schwelle_Gruen__c, Schwelle_Gelb__c, " +
  "Nur_Unterschreitung__c, Severity__c, Aktiv__c FROM Pruefregel__c WHERE Aktiv__c = true";

export type Ampel = "green" | "yellow" | "red";

/** Spezifikation 4.2: green is compared, yellow is «zu prüfen» (never a conflict), red is not used. */
export function ampelOf(confidence: number | null | undefined, r: Pick<PruefRegel, "green" | "yellow"> = { green: DEFAULT_GREEN, yellow: DEFAULT_YELLOW }): Ampel {
  const c = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
  if (c >= r.green) return "green";
  if (c >= r.yellow) return "yellow";
  return "red";
}
