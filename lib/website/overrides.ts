/**
 * Where the website deviates from HYPOTEQ's design package on purpose; content/website stays as
 * delivered, these changes apply on top of it (lib/website/site.ts).
 *
 * - Impressum and Datenschutz: the texts of the live site hypoteq.com/{lang}/impressum
 *   («Impressum & Datenschutz»: messages/{lang}.json «impressum», components/Impressium.tsx) in
 *   the design's layout, instead of the package's drafts full of placeholders. As on the live
 *   site, the three Impressum paragraphs are German in every language.
 * - Dokumente: the three PDF cards download the PDFs in public/documents (as the live site's
 *   documents page) instead of asking for them by e-mail.
 * - Footer: a link to the AGB (/{lang}/agb), as in the live site's footer (FOOTER_AGB).
 * - AGB: a page the package does not have, in the design's layout with the live AGB text
 *   (lib/agb-content.ts), at /{lang}/agb where the funnel, HYPO and the portal link to it
 *   (ADDED_PAGES; site.ts adds it to the structure, sitemap and navigation labels).
 */
import { AGB_CONTENT, type Locale as AgbLocale } from "@/lib/agb-content";
import de from "@/messages/de.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";
import en from "@/messages/en.json";

const MESSAGES: Record<string, any> = { de, fr, it, en };
const LIVE: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(MESSAGES).map(([l, m]) => [l, m.impressum]));

/** The AGB link of the footer, labelled as in the live site's footer (messages «footer.agb»). */
export const FOOTER_AGB: Record<string, { href: string; label: string }> = Object.fromEntries(
  Object.entries(MESSAGES).map(([l, m]) => [l, { href: `/${l}/agb`, label: m.footer.agb }]),
);

/* components/Impressium.tsx, German on the live site in every language */
const DISCLAIMER =
  "Der Autor übernimmt keinerlei Gewähr hinsichtlich der inhaltlichen Richtigkeit, Genauigkeit, Aktualität, Zuverlässigkeit und Vollständigkeit der Informationen. Haftungsansprüche gegen den Autor wegen Schäden materieller oder immaterieller Art, welche aus dem Zugriff oder der Nutzung bzw. Nichtnutzung der veröffentlichten Informationen, durch Missbrauch der Verbindung oder durch technische Störungen entstanden sind, werden ausgeschlossen. Alle Angebote sind unverbindlich. Der Autor behält es sich ausdrücklich vor, Teile der Seiten oder das gesamte Angebot ohne gesonderte Ankündigung zu verändern, zu ergänzen, zu löschen oder die Veröffentlichung zeitweise oder endgültig einzustellen.";
const LINKS_LIABILITY =
  "Verweise und Links auf Webseiten Dritter liegen ausserhalb unseres Verantwortungsbereichs. Es wird jegliche Verantwortung für solche Webseiten abgelehnt. Der Zugriff und die Nutzung solcher Webseiten erfolgen auf eigene Gefahr des Nutzers oder der Nutzerin.";
const COPYRIGHT =
  "Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien auf der Website gehören ausschliesslich der Firma HYPOTEQ AG oder den speziell genannten Rechtsinhabern. Für die Reproduktion jeglicher Elemente ist die schriftliche Zustimmung der Urheberrechtsträger im Voraus einzuholen.";
const AUTHORIZED = "Marco Circelli, Davide Iuorno, Fisnik Salihu";

/** The package's hero lead without its «this is a draft» sentence. */
const DRAFT = /\s+(Dieser Text|Ce texte|Questo testo|This text) .*$/;

const PRIVACY_LEAD: Record<string, string> = {
  de: "Hier erfährst du, wie die **HYPOTEQ AG** deine Personendaten bearbeitet und welche Rechte du hast.",
  fr: "Découvrez comment **HYPOTEQ AG** traite vos données personnelles et quels sont vos droits.",
  it: "Scopri come **HYPOTEQ AG** tratta i tuoi dati personali e quali sono i tuoi diritti.",
  en: "Find out how **HYPOTEQ AG** processes your personal data and what rights you have.",
};
const PRIVACY_DESCRIPTION: Record<string, string> = {
  de: "Datenschutzerklärung der HYPOTEQ AG: Erhebung von Personendaten, Cookies, Server-Log-Dateien, Google Analytics und deine Rechte.",
  fr: "Politique de confidentialité de HYPOTEQ AG : données personnelles, cookies, fichiers journaux, Google Analytics et vos droits.",
  it: "Informativa sulla privacy di HYPOTEQ AG: dati personali, cookie, file di log del server, Google Analytics e i tuoi diritti.",
  en: "Privacy policy of HYPOTEQ AG: collection of personal data, cookies, server log files, Google Analytics and your rights.",
};

const PDFS: Record<string, [string, string, string]> = {
  // Auskunftsermächtigung, checklist owner-occupied home, checklist buy-to-let
  de: ["/documents/HYPOTEQ_Auskunftsermaechtigung_DE.pdf", "/documents/checkliste_selbst_bewohntes_wohneigentum.pdf", "/documents/Checkliste-fuer-Renditeobjekte.pdf"],
  fr: ["/documents/HYPOTEQ_Auskunftsermaechtigung_FR.pdf", "/documents/Liste-de-controle-pour-les-logements-en-propriete-occupes-par-leur-proprietaire.pdf", "/documents/Liste-de-controle-pour-les-immeubles-a-rendement.pdf"],
  it: ["/documents/HYPOTEQ_Auskunftsermaechtigung_IT.pdf", "/documents/Lista-di-controllo-per-immobili-residenziali-occupati-dal-proprietario.pdf", "/documents/Lista-di-controllo-per-immobili-a-reddito.pdf"],
  en: ["/documents/HYPOTEQ_Auskunftsermaechtigung_EN.pdf", "/documents/Checklist-for-owner-occupied-property.pdf", "/documents/Checklist-for-investment-properties.pdf"],
};
const DOWNLOAD: Record<string, string> = { de: "PDF herunterladen", fr: "Télécharger le PDF", it: "Scarica il PDF", en: "Download PDF" };

/** Paragraph blocks of a live text: blank lines separate paragraphs. */
const paragraphs = (text: string) =>
  String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => ({ p }));

function impressum(d: any, lang: string) {
  const t = LIVE[lang];
  const [hero, cards] = d.sections;
  const cta = d.sections[d.sections.length - 1];
  const [provider, contact, register, management] = cards.items;
  return {
    ...d,
    sections: [
      { ...hero, eyebrow: "HYPOTEQ AG", lead: String(hero.lead).replace(DRAFT, ""), badges: undefined },
      {
        type: "cards",
        eyebrow: t.contactAddress,
        title: cards.title,
        cols: 3,
        items: [
          { kicker: provider.kicker, title: "HYPOTEQ AG", text: `Löwenstrasse 29\n8001 Zürich – Schweiz\n${register.title}` },
          contact,
          { kicker: management.kicker, title: t.authorizedPersons, text: AUTHORIZED },
        ],
      },
      {
        type: "article",
        meta: false,
        blocks: [
          { h2: t.disclaimerTitle }, { p: DISCLAIMER },
          { h2: t.linksTitle }, { p: LINKS_LIABILITY },
          { h2: t.copyrightTitle }, { p: COPYRIGHT },
        ],
      },
      cta,
    ],
  };
}

function datenschutz(d: any, lang: string) {
  const t = LIVE[lang];
  const hero = d.sections[0];
  const cta = d.sections[d.sections.length - 1];
  const blocks = [1, 2, 3, 4, 5].flatMap((n) => [{ h2: t[`privacy${n}Title`] }, ...paragraphs(t[`privacy${n}Text`])]);
  return {
    ...d,
    description: PRIVACY_DESCRIPTION[lang],
    sections: [
      { ...hero, eyebrow: "HYPOTEQ AG", lead: PRIVACY_LEAD[lang], badges: undefined },
      { type: "article", meta: false, blocks },
      cta,
    ],
  };
}

function dokumente(d: any, lang: string) {
  return {
    ...d,
    sections: d.sections.map((s: any, i: number) => {
      if (i !== 1 || s.type !== "cards") return s;
      return { ...s, items: s.items.map((c: any, k: number) => (k < 3 && PDFS[lang][k] ? { ...c, to: PDFS[lang][k], cta: DOWNLOAD[lang] } : c)) };
    }),
  };
}

const OVERRIDES: Record<string, (d: any, lang: string) => any> = { impressum, datenschutz, dokumente };

/** Pages the package does not have; their content is built after the package's pages. */
export type AddedPage = {
  id: string;
  parent: string;
  slug: Record<string, string>;
  /** [label, short description] per language, as NAV in site.ts */
  nav: Record<string, [string, string]>;
  content: (lang: string, pages: Record<string, any>, nav: Record<string, Record<string, [string, string]>>) => any;
};

const AGB_META: Record<string, { title: string; description: string }> = {
  de: { title: "Allgemeine Geschäftsbedingungen (AGB) | HYPOTEQ", description: "Allgemeine Geschäftsbedingungen der HYPOTEQ AG für die Nutzung der Website sowie die Hypothekarberatung und -vermittlung. Es gilt schweizerisches Recht." },
  en: { title: "General Terms and Conditions | HYPOTEQ", description: "General terms and conditions of HYPOTEQ AG for the use of the website and for mortgage advice and brokerage. Swiss law applies." },
  fr: { title: "Conditions générales | HYPOTEQ", description: "Conditions générales de HYPOTEQ AG pour l'utilisation du site web ainsi que le conseil et le courtage hypothécaires. Le droit suisse s'applique." },
  it: { title: "Condizioni generali | HYPOTEQ", description: "Condizioni generali di HYPOTEQ AG per l'uso del sito web e per la consulenza e l'intermediazione ipotecaria. Si applica il diritto svizzero." },
};

export const ADDED_PAGES: AddedPage[] = [
  {
    id: "agb",
    parent: "home",
    slug: { de: "agb", fr: "agb", it: "agb", en: "agb" },
    nav: Object.fromEntries(Object.keys(MESSAGES).map((l) => [l, [FOOTER_AGB[l].label, ""]])),
    content: (lang, pages, nav) => {
      const c = AGB_CONTENT[lang as AgbLocale] ?? AGB_CONTENT.de;
      const legal = (pages.impressum || {})[lang] || {};
      const cta = (legal.sections || [])[(legal.sections || []).length - 1];
      return {
        ...AGB_META[lang],
        h1: c.pageTitle,
        sections: [
          {
            type: "hero", eyebrow: "HYPOTEQ AG", h1: c.pageTitle, lead: c.lead, badges: [c.stand], image: "keys", alt: "",
            ctas: [{ label: nav[lang].kontakt[0], to: "page:kontakt" }, { label: nav[lang].datenschutz[0], to: "page:datenschutz" }],
          },
          { type: "article", meta: false, blocks: c.sections.flatMap((s) => [{ h2: s.title }, ...s.paragraphs.map((p) => ({ p }))]) },
          ...(cta ? [cta] : []),
        ],
      };
    },
  },
];

/** Applies the deviations to the page contents (pid → lang → page). */
export function applyOverrides(pages: Record<string, any>) {
  for (const [pid, fn] of Object.entries(OVERRIDES)) {
    const page = pages[pid];
    if (!page) continue;
    for (const lang of Object.keys(page)) if (page[lang]) page[lang] = fn(page[lang], lang);
  }
}
