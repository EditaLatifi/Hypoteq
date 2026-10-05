/**
 * Texts of the Fall-Dossier that the funnel messages do not have (DECISIONS D11: the dossier
 * is written in the funnel language). German is the reference; the funnel's own texts
 * (requirement labels, options, states, «weil: …») come from messages/funnel-v3 instead.
 */

import type { Lang } from "../i18n";
import type { QuestionKey } from "../requirements";

export interface DossierTexts {
  title: string;
  draft: string;
  confidential: string;
  site: string;
  page: string;
  eyebrow: string;
  withIncrease: string;
  descAbl: string;
  descAblBank: string;
  descIncrease: string;
  descKauf: string;
  dateLine: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  antrag: string;
  kreditnehmer: string;
  natBorrowers: string;
  existingBank: string;
  existingMortgage: string;
  increase: string;
  price: string;
  total: string;
  term: string;
  offers: string;
  offersNone: string;
  language: string;
  purpose: string;
  comment: string;
  place: string;
  immo: string;
  lieg: string;
  nutz: string;
  heating: string;
  buildingRight: string;
  value: string;
  borrower: string;
  job: string;
  pkSe: string;
  income: string;
  children: string;
  maintenance: string;
  loans: string;
  leasing: string;
  guarantor: string;
  guarantorNone: string;
  ab50: string;
  company: string;
  signatory: string;
  objectValue: string;
  newMortgage: string;
  costs: string;
  amount: string;
  interest: string;
  amortisation: string;
  amortisationNone: string;
  maintenanceCost: string;
  totalBurden: string;
  shareOfIncome: string;
  affNotApplicable: string;
  maintNote: string;
  verdict: string;
  equity: string;
  equityNone: string;
  equity3a: string;
  equityPk: string;
  equityGift: string;
  equityInheritance: string;
  equityLoan: string;
  hintsTitle: string;
  historySubmitted: string;
  historyDraft: string;
  historyFiles: string;
  historyHints: string;
  annex: string;
  annexIntro: string;
  annexExtras: string;
  colNo: string;
  colReq: string;
  colFile: string;
  colFacts: string;
  colKind: string;
  grpE: string;
  grpD: string;
  kept: string;
  notStored: string;
  duplicateOf: string;
  noFile: string;
  completeness: string;
  noHints: string;
  hintsCount: string;
  used: string;
  questions: Record<QuestionKey, string>;
}

const QUESTIONS_DE: Record<QuestionKey, string> = {
  antrag: "Kreditantrag",
  kn: "Kreditnehmer",
  anrede: "Anrede",
  immo: "Art der Immobilie",
  nbDocs: "Grundbuch und GVZ vorhanden",
  lieg: "Liegenschaft",
  nutz: "Nutzung",
  heizung: "Heizung",
  baurecht: "Baurecht",
  aufstockung: "Erhöhung",
  reno: "Renovation",
  reserviert: "reserviert",
  angebote: "Angebote",
  job: "Beschäftigung",
  pkSe: "Pensionskasse vorhanden",
  ab50: "ab 50",
  kinder: "Kinder",
  unterhalt: "Unterhaltszahlungen",
  kredite: "Privatkredite",
  leasing: "Leasings",
  buerge: "Solidarbürgschaft",
  laufzeit: "Laufzeit",
  s3a: "Säule 3a",
  schenkung: "Schenkung",
  erbe: "Erbschaft",
  darlehen: "Darlehen",
  pk: "Pensionskasse",
};

export const DOSSIER_TEXTS: Record<Lang, DossierTexts> = {
  de: {
    title: "Fall-Dossier",
    draft: "Entwurf",
    confidential: "Vertraulich · für Kreditgeber",
    site: "hypoteq.com",
    page: "Seite {n} von {total}",
    eyebrow: "Finanzierungsanfrage · {antrag}",
    withIncrease: "{antrag} und Erhöhung",
    descAbl: "Ablösung der bestehenden Hypothek von {old}",
    descAblBank: "Ablösung der bestehenden Hypothek der {bank} von {old}",
    descIncrease: " und Erhöhung um {up}",
    descKauf: "Kauf zum Preis von {price}",
    dateLine: "{case} · {date}",
    s1: "01 · Antrag",
    s2: "02 · Objekt",
    s3: "03 · Kreditnehmer",
    s4: "04 · Finanzierung und Tragbarkeit",
    s5: "05 · Verlauf",
    antrag: "Kreditantrag",
    kreditnehmer: "Kreditnehmer",
    natBorrowers: "{kn}, {n} Kreditnehmer",
    existingBank: "Bestehende Bank",
    existingMortgage: "Bestehende Hypothek",
    increase: "Gewünschte Erhöhung",
    price: "Kaufpreis",
    total: "Gesamtfinanzierung",
    term: "Gewünschte Laufzeit",
    offers: "Finanzierungsangebote",
    offersNone: "keine",
    language: "Korrespondenzsprache",
    purpose: "Verwendungszweck der Erhöhung",
    comment: "Kommentar",
    place: "Ort",
    immo: "Art der Immobilie",
    lieg: "Art der Liegenschaft",
    nutz: "Nutzung",
    heating: "Heizung",
    buildingRight: "Baurecht",
    value: "Geschätzter Objektwert",
    borrower: "Kreditnehmer {n}",
    job: "Beschäftigung",
    pkSe: "Pensionskasse vorhanden",
    income: "Bruttoeinkommen Haushalt",
    children: "Kinder",
    maintenance: "Unterhaltszahlungen",
    loans: "Privatkredite",
    leasing: "Leasings",
    guarantor: "Solidarbürgschaft",
    guarantorNone: "keine",
    ab50: "Kreditnehmer ab 50",
    company: "Firma",
    signatory: "Zeichnungsberechtigte Person",
    objectValue: "Objektwert",
    newMortgage: "Hypothek neu",
    costs: "Kalkulatorische Kosten pro Jahr",
    amount: "Betrag",
    interest: "Zins 5 % auf {need}",
    amortisation: "Amortisation über 15 Jahre auf 2/3 des Objektwerts",
    amortisationNone: "Amortisation (1. Hypothek nicht überschritten)",
    maintenanceCost: "Nebenkosten 1 % des Objektwerts",
    totalBurden: "Total Belastung",
    shareOfIncome: "Anteil am Bruttoeinkommen {inc}",
    affNotApplicable: "Juristische Person: Tragbarkeit wird nicht über ein Einkommen berechnet.",
    maintNote: "Unterhaltszahlungen sind in der Tragbarkeit nicht enthalten; die Unterhaltsvereinbarung liegt im Annex.",
    verdict: "Erstbeurteilung",
    equity: "Eigenmittel: {sources}",
    equityNone: "Eigenmittel: keine besonderen Quellen angegeben.",
    equity3a: "Säule 3a",
    equityPk: "Pensionskasse (Vorbezug oder Verpfändung)",
    equityGift: "Schenkung",
    equityInheritance: "Erbschaft / Erbvorbezug",
    equityLoan: "Darlehen",
    hintsTitle: "Hinweise an die Bank",
    historySubmitted: "Anfrage über den Funnel abgeschlossen{case}",
    historyDraft: "Entwurf aus dem Funnel – noch nicht abgeschlossen",
    historyFiles: "{n} Dateien hochgeladen · {ok} von {total} Anforderungen erfüllt",
    historyHints: "{n} Hinweis(e) an die Bank",
    annex: "Annex · Dokumentenverzeichnis",
    annexIntro: "{n} Dateien erkannt, zugeordnet und ausgelesen. Jede Anforderung zeigt ihre Herkunft (Trigger-Antwort) und die extrahierten Kernangaben.",
    annexExtras: "{kept} weitere Datei(en) mitgeführt, {removed} nicht benötigte Datei(en) bzw. Duplikat(e) nicht abgelegt.",
    colNo: "#",
    colReq: "Anforderung · Herkunft",
    colFile: "Datei",
    colFacts: "Kernangaben",
    colKind: "Einordnung",
    grpD: "Eigenmittel und Vorsorge",
    grpE: "Weitere Dateien · nicht gewertet",
    kept: "mitgeführt",
    notStored: "nicht abgelegt",
    duplicateOf: "nicht doppelt gespeichert",
    noFile: "–",
    completeness: "Vollständigkeit",
    noHints: "Keine Hinweise an die Bank.",
    hintsCount: "{n} Hinweis(e): {list}",
    used: "trotzdem verwendet",
    questions: QUESTIONS_DE,
  },
  en: {
    title: "Case dossier",
    draft: "Draft",
    confidential: "Confidential · for lenders",
    site: "hypoteq.com",
    page: "Page {n} of {total}",
    eyebrow: "Financing request · {antrag}",
    withIncrease: "{antrag} and increase",
    descAbl: "Refinancing of the existing mortgage of {old}",
    descAblBank: "Refinancing of the existing {bank} mortgage of {old}",
    descIncrease: " and increase by {up}",
    descKauf: "Purchase at a price of {price}",
    dateLine: "{case} · {date}",
    s1: "01 · Request",
    s2: "02 · Property",
    s3: "03 · Borrowers",
    s4: "04 · Financing and affordability",
    s5: "05 · History",
    antrag: "Type of request",
    kreditnehmer: "Borrower",
    natBorrowers: "{kn}, {n} borrower(s)",
    existingBank: "Existing bank",
    existingMortgage: "Existing mortgage",
    increase: "Requested increase",
    price: "Purchase price",
    total: "Total financing",
    term: "Preferred term",
    offers: "Financing offers",
    offersNone: "none",
    language: "Correspondence language",
    purpose: "Purpose of the increase",
    comment: "Comment",
    place: "Location",
    immo: "Type of property",
    lieg: "Type of ownership",
    nutz: "Use",
    heating: "Heating",
    buildingRight: "Building right",
    value: "Estimated property value",
    borrower: "Borrower {n}",
    job: "Employment",
    pkSe: "Pension fund in place",
    income: "Gross household income",
    children: "Children",
    maintenance: "Maintenance payments",
    loans: "Personal loans",
    leasing: "Leases",
    guarantor: "Joint and several guarantee",
    guarantorNone: "none",
    ab50: "Borrower 50 or older",
    company: "Company",
    signatory: "Authorised signatory",
    objectValue: "Property value",
    newMortgage: "New mortgage",
    costs: "Imputed costs per year",
    amount: "Amount",
    interest: "Interest 5 % on {need}",
    amortisation: "Amortisation over 15 years to 2/3 of the property value",
    amortisationNone: "Amortisation (first mortgage not exceeded)",
    maintenanceCost: "Running costs 1 % of the property value",
    totalBurden: "Total burden",
    shareOfIncome: "Share of gross income {inc}",
    affNotApplicable: "Legal entity: affordability is not calculated from an income.",
    maintNote: "Maintenance payments are not included in the affordability; the maintenance agreement is in the annex.",
    verdict: "Initial assessment",
    equity: "Equity: {sources}",
    equityNone: "Equity: no particular sources stated.",
    equity3a: "Pillar 3a",
    equityPk: "Pension fund (withdrawal or pledge)",
    equityGift: "Gift",
    equityInheritance: "Inheritance / advance on inheritance",
    equityLoan: "Loan",
    hintsTitle: "Notes for the bank",
    historySubmitted: "Request submitted through the funnel{case}",
    historyDraft: "Draft from the funnel – not yet submitted",
    historyFiles: "{n} files uploaded · {ok} of {total} requirements met",
    historyHints: "{n} note(s) for the bank",
    annex: "Annex · Document index",
    annexIntro: "{n} files recognised, assigned and read. Each requirement shows its origin (triggering answer) and the key extracted details.",
    annexExtras: "{kept} further file(s) included, {removed} file(s) not needed or duplicate not stored.",
    colNo: "#",
    colReq: "Requirement · origin",
    colFile: "File",
    colFacts: "Key details",
    colKind: "Classification",
    grpD: "Equity and pension provision",
    grpE: "Further files · not counted",
    kept: "included",
    notStored: "not stored",
    duplicateOf: "not stored twice",
    noFile: "–",
    completeness: "Completeness",
    noHints: "No notes for the bank.",
    hintsCount: "{n} note(s): {list}",
    used: "used anyway",
    questions: {
      antrag: "Request", kn: "Borrower", anrede: "Salutation", immo: "Type of property", nbDocs: "Land register and insurance available",
      lieg: "Ownership", nutz: "Use", heizung: "Heating", baurecht: "Building right", aufstockung: "Increase", reno: "Renovation",
      reserviert: "reserved", angebote: "Offers", job: "Employment", pkSe: "Pension fund in place", ab50: "50 or older", kinder: "Children",
      unterhalt: "Maintenance payments", kredite: "Personal loans", leasing: "Leases", buerge: "Joint guarantee", laufzeit: "Term",
      s3a: "Pillar 3a", schenkung: "Gift", erbe: "Inheritance", darlehen: "Loan", pk: "Pension fund",
    },
  },
  fr: {
    title: "Dossier",
    draft: "Brouillon",
    confidential: "Confidentiel · pour les prêteurs",
    site: "hypoteq.com",
    page: "Page {n} sur {total}",
    eyebrow: "Demande de financement · {antrag}",
    withIncrease: "{antrag} et augmentation",
    descAbl: "Reprise de l’hypothèque existante de {old}",
    descAblBank: "Reprise de l’hypothèque existante auprès de {bank} de {old}",
    descIncrease: " et augmentation de {up}",
    descKauf: "Achat au prix de {price}",
    dateLine: "{case} · {date}",
    s1: "01 · Demande",
    s2: "02 · Bien immobilier",
    s3: "03 · Emprunteurs",
    s4: "04 · Financement et capacité financière",
    s5: "05 · Historique",
    antrag: "Type de demande",
    kreditnehmer: "Emprunteur",
    natBorrowers: "{kn}, {n} emprunteur(s)",
    existingBank: "Banque actuelle",
    existingMortgage: "Hypothèque existante",
    increase: "Augmentation souhaitée",
    price: "Prix d’achat",
    total: "Financement total",
    term: "Durée souhaitée",
    offers: "Offres de financement",
    offersNone: "aucune",
    language: "Langue de correspondance",
    purpose: "Affectation de l’augmentation",
    comment: "Commentaire",
    place: "Lieu",
    immo: "Type de bien",
    lieg: "Type de propriété",
    nutz: "Utilisation",
    heating: "Chauffage",
    buildingRight: "Droit de superficie",
    value: "Valeur estimée du bien",
    borrower: "Emprunteur {n}",
    job: "Activité professionnelle",
    pkSe: "Caisse de pension existante",
    income: "Revenu brut du ménage",
    children: "Enfants",
    maintenance: "Pensions alimentaires",
    loans: "Crédits privés",
    leasing: "Leasings",
    guarantor: "Cautionnement solidaire",
    guarantorNone: "aucun",
    ab50: "Emprunteur de 50 ans ou plus",
    company: "Société",
    signatory: "Personne autorisée à signer",
    objectValue: "Valeur du bien",
    newMortgage: "Nouvelle hypothèque",
    costs: "Coûts théoriques par an",
    amount: "Montant",
    interest: "Intérêt de 5 % sur {need}",
    amortisation: "Amortissement sur 15 ans jusqu’à 2/3 de la valeur du bien",
    amortisationNone: "Amortissement (1er rang non dépassé)",
    maintenanceCost: "Frais accessoires 1 % de la valeur du bien",
    totalBurden: "Charge totale",
    shareOfIncome: "Part du revenu brut de {inc}",
    affNotApplicable: "Personne morale : la capacité financière n’est pas calculée à partir d’un revenu.",
    maintNote: "Les pensions alimentaires ne sont pas incluses dans la capacité financière ; la convention figure en annexe.",
    verdict: "Première évaluation",
    equity: "Fonds propres : {sources}",
    equityNone: "Fonds propres : aucune source particulière indiquée.",
    equity3a: "Pilier 3a",
    equityPk: "Caisse de pension (versement anticipé ou mise en gage)",
    equityGift: "Donation",
    equityInheritance: "Héritage / avancement d’hoirie",
    equityLoan: "Prêt",
    hintsTitle: "Remarques pour la banque",
    historySubmitted: "Demande finalisée via le funnel{case}",
    historyDraft: "Brouillon du funnel – pas encore finalisé",
    historyFiles: "{n} fichiers téléversés · {ok} sur {total} exigences remplies",
    historyHints: "{n} remarque(s) pour la banque",
    annex: "Annexe · Liste des documents",
    annexIntro: "{n} fichiers reconnus, attribués et lus. Chaque exigence indique son origine (réponse déclenchante) et les informations clés extraites.",
    annexExtras: "{kept} autre(s) fichier(s) joint(s), {removed} fichier(s) non requis ou doublon(s) non enregistré(s).",
    colNo: "#",
    colReq: "Exigence · origine",
    colFile: "Fichier",
    colFacts: "Informations clés",
    colKind: "Classement",
    grpD: "Fonds propres et prévoyance",
    grpE: "Autres fichiers · non comptés",
    kept: "joint",
    notStored: "non enregistré",
    duplicateOf: "non enregistré deux fois",
    noFile: "–",
    completeness: "Exhaustivité",
    noHints: "Aucune remarque pour la banque.",
    hintsCount: "{n} remarque(s) : {list}",
    used: "utilisé malgré tout",
    questions: {
      antrag: "Demande", kn: "Emprunteur", anrede: "Civilité", immo: "Type de bien", nbDocs: "Registre foncier et assurance disponibles",
      lieg: "Propriété", nutz: "Utilisation", heizung: "Chauffage", baurecht: "Droit de superficie", aufstockung: "Augmentation", reno: "Rénovation",
      reserviert: "réservé", angebote: "Offres", job: "Activité", pkSe: "Caisse de pension existante", ab50: "50 ans ou plus", kinder: "Enfants",
      unterhalt: "Pensions alimentaires", kredite: "Crédits privés", leasing: "Leasings", buerge: "Cautionnement solidaire", laufzeit: "Durée",
      s3a: "Pilier 3a", schenkung: "Donation", erbe: "Héritage", darlehen: "Prêt", pk: "Caisse de pension",
    },
  },
  it: {
    title: "Dossier",
    draft: "Bozza",
    confidential: "Confidenziale · per i creditori",
    site: "hypoteq.com",
    page: "Pagina {n} di {total}",
    eyebrow: "Richiesta di finanziamento · {antrag}",
    withIncrease: "{antrag} e aumento",
    descAbl: "Rinnovo dell’ipoteca esistente di {old}",
    descAblBank: "Rinnovo dell’ipoteca esistente presso {bank} di {old}",
    descIncrease: " e aumento di {up}",
    descKauf: "Acquisto al prezzo di {price}",
    dateLine: "{case} · {date}",
    s1: "01 · Richiesta",
    s2: "02 · Immobile",
    s3: "03 · Mutuatari",
    s4: "04 · Finanziamento e sostenibilità",
    s5: "05 · Cronologia",
    antrag: "Tipo di richiesta",
    kreditnehmer: "Mutuatario",
    natBorrowers: "{kn}, {n} mutuatario/i",
    existingBank: "Banca attuale",
    existingMortgage: "Ipoteca esistente",
    increase: "Aumento desiderato",
    price: "Prezzo d’acquisto",
    total: "Finanziamento totale",
    term: "Durata desiderata",
    offers: "Offerte di finanziamento",
    offersNone: "nessuna",
    language: "Lingua di corrispondenza",
    purpose: "Scopo dell’aumento",
    comment: "Commento",
    place: "Luogo",
    immo: "Tipo di immobile",
    lieg: "Tipo di proprietà",
    nutz: "Utilizzo",
    heating: "Riscaldamento",
    buildingRight: "Diritto di superficie",
    value: "Valore stimato dell’immobile",
    borrower: "Mutuatario {n}",
    job: "Attività lavorativa",
    pkSe: "Cassa pensione presente",
    income: "Reddito lordo dell’economia domestica",
    children: "Figli",
    maintenance: "Alimenti",
    loans: "Crediti privati",
    leasing: "Leasing",
    guarantor: "Fideiussione solidale",
    guarantorNone: "nessuna",
    ab50: "Mutuatario di 50 anni o più",
    company: "Società",
    signatory: "Persona con diritto di firma",
    objectValue: "Valore dell’immobile",
    newMortgage: "Nuova ipoteca",
    costs: "Costi teorici annui",
    amount: "Importo",
    interest: "Interesse 5 % su {need}",
    amortisation: "Ammortamento in 15 anni fino a 2/3 del valore dell’immobile",
    amortisationNone: "Ammortamento (1° grado non superato)",
    maintenanceCost: "Spese accessorie 1 % del valore dell’immobile",
    totalBurden: "Onere totale",
    shareOfIncome: "Quota del reddito lordo di {inc}",
    affNotApplicable: "Persona giuridica: la sostenibilità non viene calcolata su un reddito.",
    maintNote: "Gli alimenti non sono inclusi nella sostenibilità; la convenzione si trova nell’allegato.",
    verdict: "Prima valutazione",
    equity: "Fondi propri: {sources}",
    equityNone: "Fondi propri: nessuna fonte particolare indicata.",
    equity3a: "Pilastro 3a",
    equityPk: "Cassa pensione (prelievo anticipato o costituzione in pegno)",
    equityGift: "Donazione",
    equityInheritance: "Eredità / anticipo ereditario",
    equityLoan: "Prestito",
    hintsTitle: "Note per la banca",
    historySubmitted: "Richiesta conclusa tramite il funnel{case}",
    historyDraft: "Bozza dal funnel – non ancora conclusa",
    historyFiles: "{n} file caricati · {ok} di {total} requisiti soddisfatti",
    historyHints: "{n} nota/e per la banca",
    annex: "Allegato · Elenco dei documenti",
    annexIntro: "{n} file riconosciuti, assegnati e letti. Ogni requisito indica la sua origine (risposta che lo attiva) e i dati principali estratti.",
    annexExtras: "{kept} ulteriore/i file allegato/i, {removed} file non necessario/i o duplicato/i non archiviato/i.",
    colNo: "#",
    colReq: "Requisito · origine",
    colFile: "File",
    colFacts: "Dati principali",
    colKind: "Classificazione",
    grpD: "Fondi propri e previdenza",
    grpE: "Altri file · non conteggiati",
    kept: "allegato",
    notStored: "non archiviato",
    duplicateOf: "non archiviato due volte",
    noFile: "–",
    completeness: "Completezza",
    noHints: "Nessuna nota per la banca.",
    hintsCount: "{n} nota/e: {list}",
    used: "usato comunque",
    questions: {
      antrag: "Richiesta", kn: "Mutuatario", anrede: "Appellativo", immo: "Tipo di immobile", nbDocs: "Registro fondiario e assicurazione disponibili",
      lieg: "Proprietà", nutz: "Utilizzo", heizung: "Riscaldamento", baurecht: "Diritto di superficie", aufstockung: "Aumento", reno: "Ristrutturazione",
      reserviert: "riservato", angebote: "Offerte", job: "Attività", pkSe: "Cassa pensione presente", ab50: "50 anni o più", kinder: "Figli",
      unterhalt: "Alimenti", kredite: "Crediti privati", leasing: "Leasing", buerge: "Fideiussione solidale", laufzeit: "Durata",
      s3a: "Pilastro 3a", schenkung: "Donazione", erbe: "Eredità", darlehen: "Prestito", pk: "Cassa pensione",
    },
  },
};
