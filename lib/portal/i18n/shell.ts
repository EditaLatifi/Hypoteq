/**
 * Partnerportal texts added with the handoff of 14.10.2026 for the shell, the dashboard
 * portfolio, document statuses, the e-mail preview and the admin portal fields. Merged into
 * each language of dict.ts right after its `nav` namespace; `de` defines the shape and the
 * other three are typed against it, as in dict.ts.
 */

const de = {
  shell: {
    search: {
      placeholder: "Antragsteller suchen – Vor- oder Nachname",
      label: "Antragsteller suchen",
      none: "Kein Antragsteller gefunden.",
      results: (n: number) => (n === 1 ? "1 Treffer. Mit den Pfeiltasten wählen, Enter öffnet." : `${n} Treffer. Mit den Pfeiltasten wählen, Enter öffnet.`),
    },
    newFinancing: {
      title: "Neue Finanzierung starten",
      standard: "Standardfinanzierung",
      standardText: "Kauf, Ablösung oder Aufstockung von Wohneigentum – über den HYPOTEQ Funnel mit Ihrer Partner-ID.",
      standardTag: "Funnel · Partnervereinbarung",
      special: "Spezialfinanzierung",
      specialText: "Mezzanine, Bauprojekt, Renditeobjekt oder Gewerbe – direkt hier im Portal erfassen.",
      specialTag: "Individuelle Prüfung",
    },
    tools: {
      title: "Tools",
      resources: "Tools & Ressourcen",
      valuation: "Immo-Bewertung",
      valuationShort: "Marktwert schätzen",
      valuationText: "Marktwert eines Objekts in wenigen Minuten schätzen.",
      academy: "HYPOTEQ Academy",
      academyShort: "Kurse & Praxisfälle",
      academyText: "Praxisfälle und kurze Module für Ihre Beratung.",
      support: "Support & Feedback",
      supportText: "Frage, Fehler oder Wunsch melden.",
      newTab: "(öffnet in neuem Tab)",
    },
    poweredBy: "Partnerportal · powered by HYPOTEQ",
    partnerLogo: (company: string | null) => (company ? `Logo ${company}` : "Firmenlogo"),
    mainNav: "Hauptnavigation",
    skipToContent: "Zum Inhalt springen",
    toProfile: "Profil öffnen",
    unread: (n: number) => (n === 1 ? "1 ungelesene Meldung" : `${n} ungelesene Meldungen`),
    unreadMark: "ungelesen",
  },
};

export type ShellDict = typeof de;

const en: ShellDict = {
  shell: {
    search: {
      placeholder: "Search applicants – first or last name",
      label: "Search applicants",
      none: "No applicant found.",
      results: (n) => (n === 1 ? "1 result. Use the arrow keys to choose, Enter opens." : `${n} results. Use the arrow keys to choose, Enter opens.`),
    },
    newFinancing: {
      title: "Start new financing",
      standard: "Standard financing",
      standardText: "Purchase, refinancing or increase of residential property – through the HYPOTEQ funnel with your partner ID.",
      standardTag: "Funnel · Partner agreement",
      special: "Special financing",
      specialText: "Mezzanine, construction project, investment property or commercial – entered right here in the portal.",
      specialTag: "Individual review",
    },
    tools: {
      title: "Tools",
      resources: "Tools & resources",
      valuation: "Property valuation",
      valuationShort: "Estimate market value",
      valuationText: "Estimate the market value of a property in a few minutes.",
      academy: "HYPOTEQ Academy",
      academyShort: "Courses & case studies",
      academyText: "Case studies and short modules for your advisory work.",
      support: "Support & feedback",
      supportText: "Report a question, a bug or a wish.",
      newTab: "(opens in a new tab)",
    },
    poweredBy: "Partner portal · powered by HYPOTEQ",
    partnerLogo: (company) => (company ? `${company} logo` : "Company logo"),
    mainNav: "Main navigation",
    skipToContent: "Skip to content",
    toProfile: "Open profile",
    unread: (n) => (n === 1 ? "1 unread notification" : `${n} unread notifications`),
    unreadMark: "unread",
  },
};

const fr: ShellDict = {
  shell: {
    search: {
      placeholder: "Rechercher un demandeur – prénom ou nom",
      label: "Rechercher un demandeur",
      none: "Aucun demandeur trouvé.",
      results: (n) => (n === 1 ? "1 résultat. Choisissez avec les flèches, Entrée ouvre." : `${n} résultats. Choisissez avec les flèches, Entrée ouvre.`),
    },
    newFinancing: {
      title: "Nouveau financement",
      standard: "Financement standard",
      standardText: "Achat, refinancement ou augmentation pour un logement en propriété – via le funnel HYPOTEQ avec votre ID partenaire.",
      standardTag: "Funnel · Convention de partenariat",
      special: "Financement spécial",
      specialText: "Mezzanine, projet de construction, immeuble de rendement ou commercial – saisi directement ici dans le portail.",
      specialTag: "Examen individuel",
    },
    tools: {
      title: "Outils",
      resources: "Outils & ressources",
      valuation: "Évaluation immobilière",
      valuationShort: "Estimer la valeur",
      valuationText: "Estimer la valeur vénale d'un bien en quelques minutes.",
      academy: "HYPOTEQ Academy",
      academyShort: "Cours & cas pratiques",
      academyText: "Cas pratiques et modules courts pour votre conseil.",
      support: "Support & feedback",
      supportText: "Signaler une question, une erreur ou un souhait.",
      newTab: "(s'ouvre dans un nouvel onglet)",
    },
    poweredBy: "Portail partenaires · powered by HYPOTEQ",
    partnerLogo: (company) => (company ? `Logo ${company}` : "Logo de l'entreprise"),
    mainNav: "Navigation principale",
    skipToContent: "Aller au contenu",
    toProfile: "Ouvrir le profil",
    unread: (n) => (n === 1 ? "1 notification non lue" : `${n} notifications non lues`),
    unreadMark: "non lue",
  },
};

const it: ShellDict = {
  shell: {
    search: {
      placeholder: "Cerca richiedente – nome o cognome",
      label: "Cerca richiedente",
      none: "Nessun richiedente trovato.",
      results: (n) => (n === 1 ? "1 risultato. Scelga con le frecce, Invio apre." : `${n} risultati. Scelga con le frecce, Invio apre.`),
    },
    newFinancing: {
      title: "Nuovo finanziamento",
      standard: "Finanziamento standard",
      standardText: "Acquisto, rifinanziamento o aumento per un'abitazione di proprietà – tramite il funnel HYPOTEQ con il suo ID partner.",
      standardTag: "Funnel · Accordo di partenariato",
      special: "Finanziamento speciale",
      specialText: "Mezzanine, progetto edilizio, immobile a reddito o commerciale – inserito direttamente qui nel portale.",
      specialTag: "Verifica individuale",
    },
    tools: {
      title: "Strumenti",
      resources: "Strumenti & risorse",
      valuation: "Valutazione immobiliare",
      valuationShort: "Stimare il valore",
      valuationText: "Stimare il valore di mercato di un immobile in pochi minuti.",
      academy: "HYPOTEQ Academy",
      academyShort: "Corsi & casi pratici",
      academyText: "Casi pratici e brevi moduli per la sua consulenza.",
      support: "Supporto & feedback",
      supportText: "Segnalare una domanda, un errore o un desiderio.",
      newTab: "(si apre in una nuova scheda)",
    },
    poweredBy: "Portale partner · powered by HYPOTEQ",
    partnerLogo: (company) => (company ? `Logo ${company}` : "Logo aziendale"),
    mainNav: "Navigazione principale",
    skipToContent: "Vai al contenuto",
    toProfile: "Apri il profilo",
    unread: (n) => (n === 1 ? "1 notifica non letta" : `${n} notifiche non lette`),
    unreadMark: "non letta",
  },
};

export const SHELL: Record<"de" | "en" | "fr" | "it", ShellDict> = { de, en, fr, it };
