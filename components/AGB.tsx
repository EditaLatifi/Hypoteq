"use client";

import { usePathname } from "next/navigation";

/**
 * Allgemeine Geschäftsbedingungen (AGB) / General Terms and Conditions for
 * HYPOTEQ AG. Drafted for a Swiss mortgage advisory / brokerage business and
 * referencing the applicable Swiss federal law (OR/CO, DSG/FADP).
 *
 * The German version is the legally authoritative one; the EN/FR/IT versions
 * are translations for convenience. The content is shown per URL locale.
 */

type Locale = "de" | "en" | "fr" | "it";

type Section = {
  title: string;
  /** Each entry is rendered as its own paragraph; "\n" is preserved. */
  paragraphs: string[];
};

type Content = {
  pageTitle: string;
  lead: string;
  stand: string;
  sections: Section[];
};

const content: Record<Locale, Content> = {
  de: {
    pageTitle: "Allgemeine Geschäftsbedingungen",
    lead:
      "Diese Allgemeinen Geschäftsbedingungen regeln die Nutzung der Website hypoteq.ch sowie die Dienstleistungen der HYPOTEQ AG im Bereich der Hypothekarberatung und -vermittlung. Es gilt schweizerisches Recht.",
    stand: "Stand: Juli 2026",
    sections: [
      {
        title: "1. Geltungsbereich",
        paragraphs: [
          "1.1 Diese Allgemeinen Geschäftsbedingungen (nachfolgend «AGB») regeln das Vertragsverhältnis zwischen der HYPOTEQ AG, Löwenstrasse 29, 8001 Zürich (nachfolgend «HYPOTEQ», «wir» oder «uns») und ihren Kundinnen und Kunden (nachfolgend «Kunde») im Zusammenhang mit der Nutzung der Website hypoteq.ch sowie den von HYPOTEQ erbrachten Dienstleistungen im Bereich der Hypothekarberatung und -vermittlung.",
          "1.2 Abweichende, entgegenstehende oder ergänzende Bedingungen des Kunden werden nicht Vertragsbestandteil, es sei denn, HYPOTEQ hat ihrer Geltung ausdrücklich und schriftlich zugestimmt.",
          "1.3 Massgebend ist jeweils die zum Zeitpunkt des Vertragsschlusses gültige Fassung dieser AGB.",
        ],
      },
      {
        title: "2. Dienstleistungen von HYPOTEQ",
        paragraphs: [
          "2.1 HYPOTEQ berät Kundinnen und Kunden bei der Finanzierung von Wohn- und Renditeliegenschaften und vermittelt Hypothekarprodukte von Banken, Versicherungen und weiteren Finanzierungspartnern.",
          "2.2 HYPOTEQ handelt als Vermittlerin und ist nicht selbst Kreditgeberin. Ein Hypothekar- oder Finanzierungsvertrag kommt ausschliesslich zwischen dem Kunden und dem jeweiligen Finanzierungspartner zustande. HYPOTEQ ist an einem solchen Vertrag nicht Partei.",
          "2.3 Hypothekenrechner, Simulationen, Tragbarkeits- und Eignungsprüfungen sowie sonstige Berechnungen auf der Website dienen ausschliesslich der unverbindlichen Orientierung. Sie stellen weder eine Beratung im Einzelfall noch eine verbindliche Finanzierungszusage dar.",
        ],
      },
      {
        title: "3. Zustandekommen des Vertrags",
        paragraphs: [
          "3.1 Die auf der Website dargestellten Informationen und Angebote sind unverbindlich und stellen keine Offerte im Rechtssinne dar.",
          "3.2 Ein Beratungs- bzw. Vermittlungsvertrag zwischen dem Kunden und HYPOTEQ kommt zustande, sobald HYPOTEQ eine Anfrage des Kunden annimmt und mit der Erbringung der Dienstleistung beginnt.",
          "3.3 Das Vertragsverhältnis untersteht je nach Ausgestaltung den Regeln über den einfachen Auftrag (Art. 394 ff. OR) und/oder den Mäklervertrag (Art. 412 ff. OR).",
        ],
      },
      {
        title: "4. Mitwirkungspflichten des Kunden",
        paragraphs: [
          "4.1 Der Kunde ist verpflichtet, HYPOTEQ alle für die Beratung und Vermittlung erforderlichen Angaben und Unterlagen vollständig, wahrheitsgetreu und rechtzeitig zur Verfügung zu stellen.",
          "4.2 Der Kunde trägt die Verantwortung für die Richtigkeit und Vollständigkeit der von ihm gemachten Angaben. Beruhen Berechnungen, Empfehlungen oder Finanzierungsanträge auf unrichtigen oder unvollständigen Angaben des Kunden, übernimmt HYPOTEQ hierfür keine Haftung.",
          "4.3 Änderungen der persönlichen oder finanziellen Verhältnisse, die für die Finanzierung wesentlich sind, hat der Kunde HYPOTEQ unverzüglich mitzuteilen.",
        ],
      },
      {
        title: "5. Unabhängigkeit und kein Abschlusserfolg",
        paragraphs: [
          "5.1 HYPOTEQ bemüht sich, dem Kunden eine seinen Bedürfnissen entsprechende Finanzierungslösung zu vermitteln, schuldet jedoch keinen bestimmten Erfolg. Insbesondere besteht kein Anspruch darauf, dass ein Finanzierungspartner eine Finanzierung gewährt.",
          "5.2 Der Entscheid über die Gewährung einer Finanzierung sowie über deren Konditionen liegt ausschliesslich beim jeweiligen Finanzierungspartner.",
        ],
      },
      {
        title: "6. Haftung",
        paragraphs: [
          "6.1 HYPOTEQ übernimmt keine Gewähr für die inhaltliche Richtigkeit, Genauigkeit, Aktualität und Vollständigkeit der auf der Website bereitgestellten Informationen und Berechnungen.",
          "6.2 Die Haftung von HYPOTEQ für leichte Fahrlässigkeit wird im gesetzlich zulässigen Umfang wegbedungen. Für Vorsatz und grobe Fahrlässigkeit haftet HYPOTEQ nach Massgabe der gesetzlichen Bestimmungen (Art. 100 OR). Eine Haftung für indirekte Schäden, Folgeschäden oder entgangenen Gewinn ist – soweit gesetzlich zulässig – ausgeschlossen.",
          "6.3 Für Inhalte, Produkte und Dienstleistungen der Finanzierungspartner sowie für über Links erreichbare Webseiten Dritter übernimmt HYPOTEQ keine Verantwortung.",
        ],
      },
      {
        title: "7. Datenschutz und Datenbearbeitung",
        paragraphs: [
          "7.1 HYPOTEQ bearbeitet Personendaten im Einklang mit dem schweizerischen Bundesgesetz über den Datenschutz (DSG) und – soweit anwendbar – der europäischen Datenschutz-Grundverordnung (DSGVO).",
          "7.2 Grundsatz der Datensparsamkeit: HYPOTEQ erhebt und bearbeitet ausschliesslich jene Personendaten, die für die Bearbeitung der Anfrage und die Kontaktaufnahme erforderlich sind. Es werden keine Daten erhoben, die für diesen Zweck nicht benötigt werden.",
          "7.3 Über die Kontakt- und Anfrageformulare werden insbesondere folgende Daten erhoben: Vorname, Nachname, E-Mail-Adresse und Telefonnummer sowie die vom Nutzer eingegebenen Finanzierungsangaben (z.B. Kaufpreis bzw. Immobilienwert, Eigenmittel, Einkommen, bestehende Hypothek, gewünschte Zins-Laufzeit).",
          "7.4 Zweckbindung: Diese Daten werden ausschliesslich zum Zweck der Beratung, der Prüfung der Finanzierungsmöglichkeiten sowie der Kontaktaufnahme mit dem Kunden bearbeitet. Eine Bearbeitung zu anderen Zwecken erfolgt nur mit vorgängiger Einwilligung des Kunden oder soweit gesetzlich zulässig.",
          "7.5 Rechtsgrundlage der Bearbeitung ist die Einwilligung des Kunden (Absenden des Formulars und Akzeptieren dieser AGB) sowie die Anbahnung und Erfüllung des vorvertraglichen bzw. vertraglichen Verhältnisses.",
          "7.6 Weitergabe an Dritte: Die erhobenen Daten werden nicht verkauft und nicht zu Werbezwecken an Dritte weitergegeben. Sie werden von HYPOTEQ gespeichert und ausschliesslich zur Kontaktaufnahme und Bearbeitung der Anfrage verwendet. Eine Weitergabe an Finanzierungspartner (Banken, Versicherungen) erfolgt nicht automatisch, sondern nur dann, wenn der Kunde eine konkrete Finanzierung wünscht und hierzu gesondert einwilligt. Zur Speicherung und zum Betrieb setzt HYPOTEQ technische Dienstleister (Hosting-/Datenbankanbieter) als Auftragsbearbeiter ein, die vertraglich zur Vertraulichkeit und zur Einhaltung des Datenschutzes verpflichtet sind. Eine Bekanntgabe an Behörden erfolgt nur, soweit eine gesetzliche Verpflichtung besteht.",
          "7.7 Aufbewahrung: Die Personendaten werden nur so lange aufbewahrt, wie dies für die genannten Zwecke oder aufgrund gesetzlicher Aufbewahrungspflichten erforderlich ist, und danach gelöscht oder anonymisiert.",
          "7.8 Datensicherheit: HYPOTEQ trifft angemessene technische und organisatorische Massnahmen, um die Personendaten vor unbefugtem Zugriff, Verlust oder Missbrauch zu schützen. Die Datenübertragung über die Formulare erfolgt verschlüsselt.",
          "7.9 Rechte der betroffenen Person: Der Kunde hat im Rahmen des anwendbaren Rechts das Recht auf Auskunft über die bearbeiteten Personendaten sowie auf deren Berichtigung, Löschung oder Einschränkung der Bearbeitung und kann eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen. Anfragen sind an info@hypoteq.ch zu richten.",
        ],
      },
      {
        title: "8. Dauer und Beendigung",
        paragraphs: [
          "8.1 Das Auftrags- bzw. Vermittlungsverhältnis kann von beiden Parteien jederzeit beendet werden. Vorbehalten bleibt Art. 404 OR, wonach ein Auftrag jederzeit widerrufen oder gekündigt werden kann.",
          "8.2 Bereits erbrachte Leistungen bleiben von einer Beendigung unberührt.",
        ],
      },
      {
        title: "9. Geistiges Eigentum",
        paragraphs: [
          "9.1 Sämtliche Rechte an Inhalten, Texten, Bildern, Grafiken, Logos und der Software der Website stehen ausschliesslich HYPOTEQ oder den jeweils berechtigten Dritten zu.",
          "9.2 Jede Nutzung, Vervielfältigung oder Weiterverbreitung – ganz oder teilweise – bedarf der vorgängigen schriftlichen Zustimmung von HYPOTEQ.",
        ],
      },
      {
        title: "10. Änderungen der AGB",
        paragraphs: [
          "HYPOTEQ behält sich vor, diese AGB jederzeit anzupassen. Massgebend ist die im Zeitpunkt der Inanspruchnahme der Dienstleistung publizierte Fassung. Die jeweils aktuelle Fassung ist auf der Website abrufbar.",
        ],
      },
      {
        title: "11. Salvatorische Klausel",
        paragraphs: [
          "Sollten einzelne Bestimmungen dieser AGB ganz oder teilweise unwirksam oder undurchführbar sein oder werden, so wird die Wirksamkeit der übrigen Bestimmungen davon nicht berührt. An die Stelle der unwirksamen Bestimmung tritt eine Regelung, die dem wirtschaftlich Gewollten am nächsten kommt.",
        ],
      },
      {
        title: "12. Anwendbares Recht und Gerichtsstand",
        paragraphs: [
          "12.1 Diese AGB sowie sämtliche Rechtsbeziehungen zwischen dem Kunden und HYPOTEQ unterstehen ausschliesslich dem schweizerischen materiellen Recht, unter Ausschluss der Kollisionsnormen und internationaler Übereinkommen (insbesondere des Wiener Kaufrechts, CISG).",
          "12.2 Ausschliesslicher Gerichtsstand für sämtliche Streitigkeiten ist Zürich (Schweiz), unter Vorbehalt zwingender gesetzlicher Gerichtsstände, namentlich zugunsten von Konsumentinnen und Konsumenten.",
        ],
      },
    ],
  },

  en: {
    pageTitle: "General Terms and Conditions",
    lead:
      "These General Terms and Conditions govern the use of the hypoteq.ch website and the services provided by HYPOTEQ AG in the field of mortgage advisory and brokerage. Swiss law applies. The German version is legally authoritative.",
    stand: "As of: July 2026",
    sections: [
      {
        title: "1. Scope",
        paragraphs: [
          "1.1 These General Terms and Conditions (hereinafter “GTC”) govern the contractual relationship between HYPOTEQ AG, Löwenstrasse 29, 8001 Zurich (hereinafter “HYPOTEQ”, “we” or “us”) and its customers (hereinafter “Customer”) in connection with the use of the hypoteq.ch website and the services provided by HYPOTEQ in the field of mortgage advisory and brokerage.",
          "1.2 Any deviating, conflicting or supplementary terms of the Customer shall not become part of the contract unless HYPOTEQ has expressly agreed to their validity in writing.",
          "1.3 The version of these GTC valid at the time the contract is concluded shall apply.",
        ],
      },
      {
        title: "2. Services provided by HYPOTEQ",
        paragraphs: [
          "2.1 HYPOTEQ advises customers on financing residential and investment properties and brokers mortgage products from banks, insurers and other financing partners.",
          "2.2 HYPOTEQ acts as an intermediary and is not itself a lender. A mortgage or financing agreement is concluded exclusively between the Customer and the respective financing partner. HYPOTEQ is not a party to such an agreement.",
          "2.3 Mortgage calculators, simulations, affordability and eligibility checks and other calculations on the website are for non-binding guidance only. They constitute neither individual advice nor a binding financing commitment.",
        ],
      },
      {
        title: "3. Formation of the contract",
        paragraphs: [
          "3.1 The information and offers presented on the website are non-binding and do not constitute an offer in the legal sense.",
          "3.2 An advisory or brokerage contract between the Customer and HYPOTEQ is formed as soon as HYPOTEQ accepts a Customer request and begins providing the service.",
          "3.3 Depending on its structure, the contractual relationship is governed by the rules on the simple mandate (Art. 394 et seq. CO) and/or the brokerage contract (Art. 412 et seq. CO).",
        ],
      },
      {
        title: "4. Customer's duty to cooperate",
        paragraphs: [
          "4.1 The Customer is obliged to provide HYPOTEQ with all information and documents required for advice and brokerage completely, truthfully and in good time.",
          "4.2 The Customer is responsible for the accuracy and completeness of the information provided. If calculations, recommendations or financing applications are based on incorrect or incomplete information provided by the Customer, HYPOTEQ accepts no liability for this.",
          "4.3 The Customer must inform HYPOTEQ without delay of any changes in personal or financial circumstances that are material to the financing.",
        ],
      },
      {
        title: "5. Independence and no guarantee of success",
        paragraphs: [
          "5.1 HYPOTEQ endeavours to broker a financing solution suited to the Customer's needs but does not owe any specific result. In particular, there is no entitlement to a financing partner granting financing.",
          "5.2 The decision on whether to grant financing and on its terms lies exclusively with the respective financing partner.",
        ],
      },
      {
        title: "6. Liability",
        paragraphs: [
          "6.1 HYPOTEQ accepts no warranty for the accuracy, correctness, timeliness and completeness of the information and calculations provided on the website.",
          "6.2 HYPOTEQ's liability for slight negligence is excluded to the extent permitted by law. HYPOTEQ is liable for intent and gross negligence in accordance with the statutory provisions (Art. 100 CO). Liability for indirect damage, consequential damage or lost profit is excluded to the extent permitted by law.",
          "6.3 HYPOTEQ accepts no responsibility for the content, products and services of financing partners or for third-party websites accessible via links.",
        ],
      },
      {
        title: "7. Data protection and data processing",
        paragraphs: [
          "7.1 HYPOTEQ processes personal data in accordance with the Swiss Federal Act on Data Protection (FADP) and, where applicable, the European General Data Protection Regulation (GDPR).",
          "7.2 Principle of data minimisation: HYPOTEQ collects and processes only the personal data required to process the request and to make contact. No data is collected that is not needed for this purpose.",
          "7.3 The following data in particular is collected via the contact and request forms: first name, last name, e-mail address and telephone number, as well as the financing details entered by the user (e.g. purchase price or property value, own funds, income, existing mortgage, desired interest term).",
          "7.4 Purpose limitation: This data is processed exclusively for the purpose of advice, examining financing options and contacting the Customer. Processing for other purposes takes place only with the Customer's prior consent or where legally permitted.",
          "7.5 The legal basis for processing is the Customer's consent (submitting the form and accepting these GTC) as well as the initiation and performance of the pre-contractual or contractual relationship.",
          "7.6 Disclosure to third parties: The data collected is not sold and is not passed on to third parties for advertising purposes. It is stored by HYPOTEQ and used exclusively to make contact and process the request. Disclosure to financing partners (banks, insurers) does not occur automatically, but only if the Customer wishes to pursue specific financing and separately consents to this. For storage and operation, HYPOTEQ uses technical service providers (hosting/database providers) as processors, who are contractually obliged to maintain confidentiality and comply with data protection. Disclosure to authorities occurs only where a legal obligation exists.",
          "7.7 Retention: Personal data is retained only for as long as necessary for the stated purposes or due to statutory retention obligations, and is then deleted or anonymised.",
          "7.8 Data security: HYPOTEQ takes appropriate technical and organisational measures to protect personal data against unauthorised access, loss or misuse. Data transmission via the forms is encrypted.",
          "7.9 Rights of the data subject: Within the scope of applicable law, the Customer has the right to information about the personal data processed and to its rectification, erasure or restriction of processing, and may withdraw consent given at any time with effect for the future. Requests should be addressed to info@hypoteq.ch.",
        ],
      },
      {
        title: "8. Duration and termination",
        paragraphs: [
          "8.1 The mandate or brokerage relationship may be terminated by either party at any time. Art. 404 CO remains reserved, according to which a mandate may be revoked or terminated at any time.",
          "8.2 Services already rendered remain unaffected by termination.",
        ],
      },
      {
        title: "9. Intellectual property",
        paragraphs: [
          "9.1 All rights to the content, texts, images, graphics, logos and software of the website belong exclusively to HYPOTEQ or the respective authorised third parties.",
          "9.2 Any use, reproduction or redistribution — in whole or in part — requires the prior written consent of HYPOTEQ.",
        ],
      },
      {
        title: "10. Amendments to the GTC",
        paragraphs: [
          "HYPOTEQ reserves the right to amend these GTC at any time. The version published at the time the service is used shall apply. The current version is available on the website.",
        ],
      },
      {
        title: "11. Severability",
        paragraphs: [
          "Should individual provisions of these GTC be or become wholly or partially invalid or unenforceable, the validity of the remaining provisions shall not be affected. The invalid provision shall be replaced by a rule that comes closest to the intended economic purpose.",
        ],
      },
      {
        title: "12. Applicable law and place of jurisdiction",
        paragraphs: [
          "12.1 These GTC and all legal relationships between the Customer and HYPOTEQ are governed exclusively by Swiss substantive law, excluding conflict-of-law rules and international conventions (in particular the Vienna Sales Convention, CISG).",
          "12.2 The exclusive place of jurisdiction for all disputes is Zurich (Switzerland), subject to mandatory statutory places of jurisdiction, in particular in favour of consumers.",
        ],
      },
    ],
  },

  fr: {
    pageTitle: "Conditions générales",
    lead:
      "Les présentes conditions générales régissent l'utilisation du site web hypoteq.ch ainsi que les services fournis par HYPOTEQ AG dans le domaine du conseil et du courtage hypothécaires. Le droit suisse est applicable. La version allemande fait juridiquement foi.",
    stand: "État : juillet 2026",
    sections: [
      {
        title: "1. Champ d'application",
        paragraphs: [
          "1.1 Les présentes conditions générales (ci-après « CG ») régissent la relation contractuelle entre HYPOTEQ AG, Löwenstrasse 29, 8001 Zurich (ci-après « HYPOTEQ », « nous ») et ses clientes et clients (ci-après « Client ») dans le cadre de l'utilisation du site web hypoteq.ch ainsi que des services fournis par HYPOTEQ dans le domaine du conseil et du courtage hypothécaires.",
          "1.2 Des conditions divergentes, contraires ou complémentaires du Client ne font pas partie du contrat, sauf si HYPOTEQ a expressément accepté leur validité par écrit.",
          "1.3 La version des présentes CG en vigueur au moment de la conclusion du contrat est déterminante.",
        ],
      },
      {
        title: "2. Services de HYPOTEQ",
        paragraphs: [
          "2.1 HYPOTEQ conseille les clients dans le financement de biens immobiliers d'habitation et de rendement et intermédie des produits hypothécaires de banques, d'assurances et d'autres partenaires de financement.",
          "2.2 HYPOTEQ agit en qualité d'intermédiaire et n'est pas elle-même prêteuse. Un contrat hypothécaire ou de financement est conclu exclusivement entre le Client et le partenaire de financement concerné. HYPOTEQ n'est pas partie à un tel contrat.",
          "2.3 Les calculateurs hypothécaires, simulations, examens de la capacité financière et de l'éligibilité ainsi que les autres calculs figurant sur le site web servent uniquement à une orientation sans engagement. Ils ne constituent ni un conseil individualisé ni une promesse de financement contraignante.",
        ],
      },
      {
        title: "3. Conclusion du contrat",
        paragraphs: [
          "3.1 Les informations et offres présentées sur le site web sont sans engagement et ne constituent pas une offre au sens juridique.",
          "3.2 Un contrat de conseil ou de courtage entre le Client et HYPOTEQ est conclu dès que HYPOTEQ accepte une demande du Client et commence à fournir la prestation.",
          "3.3 Selon sa configuration, la relation contractuelle est régie par les règles du mandat simple (art. 394 ss CO) et/ou du contrat de courtage (art. 412 ss CO).",
        ],
      },
      {
        title: "4. Obligations de collaboration du Client",
        paragraphs: [
          "4.1 Le Client est tenu de fournir à HYPOTEQ, de manière complète, véridique et en temps utile, toutes les informations et tous les documents nécessaires au conseil et au courtage.",
          "4.2 Le Client est responsable de l'exactitude et de l'exhaustivité des informations qu'il fournit. Si des calculs, recommandations ou demandes de financement reposent sur des informations inexactes ou incomplètes du Client, HYPOTEQ décline toute responsabilité à cet égard.",
          "4.3 Le Client doit informer HYPOTEQ sans délai de toute modification de sa situation personnelle ou financière essentielle au financement.",
        ],
      },
      {
        title: "5. Indépendance et absence de garantie de résultat",
        paragraphs: [
          "5.1 HYPOTEQ s'efforce d'intermédier une solution de financement adaptée aux besoins du Client, mais ne doit aucun résultat déterminé. En particulier, il n'existe aucun droit à ce qu'un partenaire de financement accorde un financement.",
          "5.2 La décision d'accorder un financement ainsi que ses conditions relèvent exclusivement du partenaire de financement concerné.",
        ],
      },
      {
        title: "6. Responsabilité",
        paragraphs: [
          "6.1 HYPOTEQ ne garantit pas l'exactitude, la précision, l'actualité et l'exhaustivité des informations et calculs mis à disposition sur le site web.",
          "6.2 La responsabilité de HYPOTEQ pour négligence légère est exclue dans la mesure permise par la loi. HYPOTEQ répond du dol et de la négligence grave conformément aux dispositions légales (art. 100 CO). Toute responsabilité pour dommages indirects, dommages consécutifs ou perte de gain est exclue dans la mesure permise par la loi.",
          "6.3 HYPOTEQ décline toute responsabilité pour le contenu, les produits et les services des partenaires de financement ainsi que pour les sites web de tiers accessibles par des liens.",
        ],
      },
      {
        title: "7. Protection et traitement des données",
        paragraphs: [
          "7.1 HYPOTEQ traite les données personnelles conformément à la loi fédérale suisse sur la protection des données (LPD) et, dans la mesure applicable, au Règlement général sur la protection des données européen (RGPD).",
          "7.2 Principe de minimisation des données : HYPOTEQ ne collecte et ne traite que les données personnelles nécessaires au traitement de la demande et à la prise de contact. Aucune donnée non nécessaire à cette fin n'est collectée.",
          "7.3 Les données suivantes en particulier sont collectées via les formulaires de contact et de demande : prénom, nom, adresse e-mail et numéro de téléphone, ainsi que les données de financement saisies par l'utilisateur (p. ex. prix d'achat ou valeur du bien, fonds propres, revenu, hypothèque existante, durée d'intérêt souhaitée).",
          "7.4 Limitation des finalités : ces données sont traitées exclusivement aux fins du conseil, de l'examen des possibilités de financement et de la prise de contact avec le Client. Un traitement à d'autres fins n'a lieu qu'avec le consentement préalable du Client ou dans la mesure permise par la loi.",
          "7.5 La base juridique du traitement est le consentement du Client (envoi du formulaire et acceptation des présentes CG) ainsi que l'établissement et l'exécution de la relation précontractuelle ou contractuelle.",
          "7.6 Communication à des tiers : les données collectées ne sont pas vendues ni transmises à des tiers à des fins publicitaires. Elles sont conservées par HYPOTEQ et utilisées exclusivement pour la prise de contact et le traitement de la demande. Une transmission à des partenaires de financement (banques, assurances) n'a pas lieu automatiquement, mais uniquement lorsque le Client souhaite un financement concret et y consent séparément. Pour le stockage et l'exploitation, HYPOTEQ recourt à des prestataires techniques (hébergeurs/fournisseurs de bases de données) en qualité de sous-traitants, contractuellement tenus à la confidentialité et au respect de la protection des données. Une communication aux autorités n'a lieu que dans la mesure où une obligation légale existe.",
          "7.7 Conservation : les données personnelles ne sont conservées que le temps nécessaire aux finalités indiquées ou en raison d'obligations légales de conservation, puis sont supprimées ou anonymisées.",
          "7.8 Sécurité des données : HYPOTEQ prend des mesures techniques et organisationnelles appropriées pour protéger les données personnelles contre tout accès non autorisé, perte ou usage abusif. La transmission des données via les formulaires est chiffrée.",
          "7.9 Droits de la personne concernée : dans le cadre du droit applicable, le Client dispose du droit d'accès aux données personnelles traitées ainsi que du droit à leur rectification, à leur effacement ou à la limitation de leur traitement, et peut révoquer à tout moment un consentement donné avec effet pour l'avenir. Les demandes doivent être adressées à info@hypoteq.ch.",
        ],
      },
      {
        title: "8. Durée et fin",
        paragraphs: [
          "8.1 La relation de mandat ou de courtage peut être résiliée à tout moment par chacune des parties. L'art. 404 CO demeure réservé, selon lequel un mandat peut être révoqué ou résilié en tout temps.",
          "8.2 Les prestations déjà fournies ne sont pas affectées par la fin de la relation.",
        ],
      },
      {
        title: "9. Propriété intellectuelle",
        paragraphs: [
          "9.1 Tous les droits sur les contenus, textes, images, graphiques, logos et logiciels du site web appartiennent exclusivement à HYPOTEQ ou aux tiers autorisés concernés.",
          "9.2 Toute utilisation, reproduction ou rediffusion — totale ou partielle — requiert le consentement écrit préalable de HYPOTEQ.",
        ],
      },
      {
        title: "10. Modifications des CG",
        paragraphs: [
          "HYPOTEQ se réserve le droit de modifier les présentes CG à tout moment. La version publiée au moment du recours à la prestation est déterminante. La version actuelle est disponible sur le site web.",
        ],
      },
      {
        title: "11. Clause de sauvegarde",
        paragraphs: [
          "Si certaines dispositions des présentes CG sont ou deviennent totalement ou partiellement nulles ou inapplicables, la validité des autres dispositions n'en est pas affectée. La disposition nulle est remplacée par une règle se rapprochant le plus du but économique recherché.",
        ],
      },
      {
        title: "12. Droit applicable et for",
        paragraphs: [
          "12.1 Les présentes CG ainsi que l'ensemble des relations juridiques entre le Client et HYPOTEQ sont soumises exclusivement au droit matériel suisse, à l'exclusion des règles de conflit de lois et des conventions internationales (en particulier la Convention de Vienne sur les ventes, CVIM).",
          "12.2 Le for exclusif pour tout litige est Zurich (Suisse), sous réserve des fors légaux impératifs, notamment en faveur des consommateurs.",
        ],
      },
    ],
  },

  it: {
    pageTitle: "Condizioni generali",
    lead:
      "Le presenti condizioni generali disciplinano l'utilizzo del sito web hypoteq.ch nonché i servizi forniti da HYPOTEQ AG nell'ambito della consulenza e della mediazione ipotecaria. Si applica il diritto svizzero. La versione tedesca fa fede sul piano giuridico.",
    stand: "Stato: luglio 2026",
    sections: [
      {
        title: "1. Campo d'applicazione",
        paragraphs: [
          "1.1 Le presenti condizioni generali (di seguito «CG») disciplinano il rapporto contrattuale tra HYPOTEQ AG, Löwenstrasse 29, 8001 Zurigo (di seguito «HYPOTEQ», «noi») e le sue clienti e i suoi clienti (di seguito «Cliente») in relazione all'utilizzo del sito web hypoteq.ch nonché ai servizi forniti da HYPOTEQ nell'ambito della consulenza e della mediazione ipotecaria.",
          "1.2 Condizioni divergenti, contrarie o integrative del Cliente non diventano parte del contratto, salvo che HYPOTEQ ne abbia espressamente accettato la validità per iscritto.",
          "1.3 È determinante la versione delle presenti CG in vigore al momento della conclusione del contratto.",
        ],
      },
      {
        title: "2. Servizi di HYPOTEQ",
        paragraphs: [
          "2.1 HYPOTEQ fornisce consulenza ai clienti per il finanziamento di immobili residenziali e di reddito e media prodotti ipotecari di banche, assicurazioni e altri partner di finanziamento.",
          "2.2 HYPOTEQ agisce in qualità di mediatrice e non è essa stessa mutuante. Un contratto ipotecario o di finanziamento è concluso esclusivamente tra il Cliente e il rispettivo partner di finanziamento. HYPOTEQ non è parte di tale contratto.",
          "2.3 Calcolatori ipotecari, simulazioni, verifiche di sostenibilità e di idoneità nonché altri calcoli presenti sul sito web servono esclusivamente a un orientamento non vincolante. Non costituiscono né una consulenza nel singolo caso né una promessa di finanziamento vincolante.",
        ],
      },
      {
        title: "3. Conclusione del contratto",
        paragraphs: [
          "3.1 Le informazioni e le offerte presentate sul sito web sono non vincolanti e non costituiscono un'offerta in senso giuridico.",
          "3.2 Un contratto di consulenza o di mediazione tra il Cliente e HYPOTEQ si conclude non appena HYPOTEQ accetta una richiesta del Cliente e inizia a fornire la prestazione.",
          "3.3 A seconda della sua configurazione, il rapporto contrattuale è disciplinato dalle norme sul mandato semplice (art. 394 segg. CO) e/o sul contratto di mediazione (art. 412 segg. CO).",
        ],
      },
      {
        title: "4. Obblighi di collaborazione del Cliente",
        paragraphs: [
          "4.1 Il Cliente è tenuto a fornire a HYPOTEQ in modo completo, veritiero e tempestivo tutte le informazioni e i documenti necessari per la consulenza e la mediazione.",
          "4.2 Il Cliente è responsabile della correttezza e della completezza delle informazioni fornite. Se calcoli, raccomandazioni o richieste di finanziamento si basano su informazioni inesatte o incomplete del Cliente, HYPOTEQ non si assume alcuna responsabilità al riguardo.",
          "4.3 Il Cliente deve comunicare senza indugio a HYPOTEQ ogni variazione delle circostanze personali o finanziarie rilevanti per il finanziamento.",
        ],
      },
      {
        title: "5. Indipendenza e nessuna garanzia di esito",
        paragraphs: [
          "5.1 HYPOTEQ si adopera per mediare una soluzione di finanziamento adeguata alle esigenze del Cliente, ma non deve alcun risultato determinato. In particolare, non sussiste alcun diritto a che un partner di finanziamento conceda un finanziamento.",
          "5.2 La decisione sulla concessione di un finanziamento e sulle relative condizioni spetta esclusivamente al rispettivo partner di finanziamento.",
        ],
      },
      {
        title: "6. Responsabilità",
        paragraphs: [
          "6.1 HYPOTEQ non fornisce alcuna garanzia in merito alla correttezza, precisione, attualità e completezza delle informazioni e dei calcoli messi a disposizione sul sito web.",
          "6.2 La responsabilità di HYPOTEQ per colpa lieve è esclusa nella misura consentita dalla legge. Per dolo e colpa grave HYPOTEQ risponde secondo le disposizioni di legge (art. 100 CO). È esclusa, nella misura consentita dalla legge, ogni responsabilità per danni indiretti, danni conseguenti o mancato guadagno.",
          "6.3 HYPOTEQ non si assume alcuna responsabilità per i contenuti, i prodotti e i servizi dei partner di finanziamento né per i siti web di terzi accessibili tramite link.",
        ],
      },
      {
        title: "7. Protezione e trattamento dei dati",
        paragraphs: [
          "7.1 HYPOTEQ tratta i dati personali in conformità con la legge federale svizzera sulla protezione dei dati (LPD) e, nella misura applicabile, con il Regolamento generale europeo sulla protezione dei dati (GDPR).",
          "7.2 Principio di minimizzazione dei dati: HYPOTEQ raccoglie e tratta esclusivamente i dati personali necessari per l'elaborazione della richiesta e per la presa di contatto. Non vengono raccolti dati non necessari a tale scopo.",
          "7.3 Tramite i moduli di contatto e di richiesta vengono raccolti in particolare i seguenti dati: nome, cognome, indirizzo e-mail e numero di telefono, nonché i dati di finanziamento inseriti dall'utente (ad es. prezzo d'acquisto o valore dell'immobile, mezzi propri, reddito, ipoteca esistente, durata del tasso desiderata).",
          "7.4 Vincolo di scopo: questi dati sono trattati esclusivamente ai fini della consulenza, dell'esame delle possibilità di finanziamento e della presa di contatto con il Cliente. Un trattamento per altri scopi avviene solo con il previo consenso del Cliente o nella misura consentita dalla legge.",
          "7.5 La base giuridica del trattamento è il consenso del Cliente (invio del modulo e accettazione delle presenti CG) nonché l'avvio e l'esecuzione del rapporto precontrattuale o contrattuale.",
          "7.6 Comunicazione a terzi: i dati raccolti non vengono venduti né trasmessi a terzi per scopi pubblicitari. Sono conservati da HYPOTEQ e utilizzati esclusivamente per la presa di contatto e l'elaborazione della richiesta. Una trasmissione a partner di finanziamento (banche, assicurazioni) non avviene automaticamente, ma solo quando il Cliente desidera un finanziamento concreto e vi acconsente separatamente. Per la conservazione e il funzionamento HYPOTEQ ricorre a fornitori di servizi tecnici (fornitori di hosting/banche dati) in qualità di responsabili del trattamento, contrattualmente obbligati alla riservatezza e al rispetto della protezione dei dati. Una comunicazione alle autorità avviene solo nella misura in cui sussista un obbligo legale.",
          "7.7 Conservazione: i dati personali sono conservati solo per il tempo necessario agli scopi indicati o in base a obblighi legali di conservazione, e successivamente vengono cancellati o anonimizzati.",
          "7.8 Sicurezza dei dati: HYPOTEQ adotta misure tecniche e organizzative adeguate per proteggere i dati personali da accessi non autorizzati, perdita o uso improprio. La trasmissione dei dati tramite i moduli è cifrata.",
          "7.9 Diritti dell'interessato: nell'ambito del diritto applicabile, il Cliente ha il diritto di accedere ai dati personali trattati nonché di ottenerne la rettifica, la cancellazione o la limitazione del trattamento e può revocare in qualsiasi momento un consenso prestato con effetto per il futuro. Le richieste vanno indirizzate a info@hypoteq.ch.",
        ],
      },
      {
        title: "8. Durata e cessazione",
        paragraphs: [
          "8.1 Il rapporto di mandato o di mediazione può essere sciolto in qualsiasi momento da entrambe le parti. È fatto salvo l'art. 404 CO, secondo cui un mandato può essere revocato o disdetto in ogni tempo.",
          "8.2 Le prestazioni già fornite non sono pregiudicate dalla cessazione.",
        ],
      },
      {
        title: "9. Proprietà intellettuale",
        paragraphs: [
          "9.1 Tutti i diritti sui contenuti, testi, immagini, grafiche, loghi e software del sito web spettano esclusivamente a HYPOTEQ o ai rispettivi terzi autorizzati.",
          "9.2 Ogni utilizzo, riproduzione o ridistribuzione — totale o parziale — richiede il previo consenso scritto di HYPOTEQ.",
        ],
      },
      {
        title: "10. Modifiche delle CG",
        paragraphs: [
          "HYPOTEQ si riserva il diritto di modificare le presenti CG in qualsiasi momento. È determinante la versione pubblicata al momento del ricorso alla prestazione. La versione attuale è disponibile sul sito web.",
        ],
      },
      {
        title: "11. Clausola salvatoria",
        paragraphs: [
          "Qualora singole disposizioni delle presenti CG siano o divengano in tutto o in parte nulle o inapplicabili, la validità delle restanti disposizioni non ne è pregiudicata. La disposizione nulla è sostituita da una regola che più si avvicina allo scopo economico perseguito.",
        ],
      },
      {
        title: "12. Diritto applicabile e foro competente",
        paragraphs: [
          "12.1 Le presenti CG e tutti i rapporti giuridici tra il Cliente e HYPOTEQ sono soggetti esclusivamente al diritto materiale svizzero, con esclusione delle norme sui conflitti di legge e delle convenzioni internazionali (in particolare la Convenzione di Vienna sulla vendita, CISG).",
          "12.2 Il foro esclusivo per ogni controversia è Zurigo (Svizzera), con riserva dei fori legali imperativi, segnatamente a favore dei consumatori.",
        ],
      },
    ],
  },
};

export default function AGB() {
  const pathname = usePathname() || "/de";
  const pathLocale = (pathname.split("/")[1] || "de") as Locale;
  const c = content[pathLocale] ?? content.de;

  return (
    <div className="w-full flex justify-center bg-[#F4F4F4] px-[20px] md:px-[40px] lg:px-6 py-[60px] md:py-[80px] lg:py-20">
      <div className="max-w-[1272px] w-full flex flex-col gap-[50px] md:gap-[70px] lg:gap-[90px]">

        {/* Main Title */}
        <div className="flex flex-col gap-[16px] md:gap-[20px]">
          <h1
            className="text-[#132219] font-[600] mt-[20px] md:mt-[20px] font-sfpro
            text-[32px] md:text-[48px] lg:text-[62px]
            leading-[40px] md:leading-[58px] lg:leading-[75px]"
          >
            {c.pageTitle}
          </h1>

          <p className="text-[#132219] font-sfpro
          text-[16px] md:text-[18px] lg:text-[20px]
          leading-[26px] md:leading-[30px] lg:leading-[32px]">
            {c.lead}
          </p>

          <p className="text-[#132219] font-sfpro opacity-70
          text-[14px] md:text-[15px] lg:text-[16px]
          leading-[22px] md:leading-[24px] lg:leading-[26px]">
            {c.stand}
          </p>
        </div>

        {c.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-[20px] md:gap-[24px]">
            <h2
              className="text-[#132219] font-[600] font-sfpro
              text-[24px] md:text-[32px] lg:text-[40px]
              leading-[32px] md:leading-[40px] lg:leading-[50px]"
            >
              {section.title}
            </h2>

            {section.paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className="text-[#132219] whitespace-pre-line font-sfpro
                text-[16px] md:text-[18px] lg:text-[20px]
                leading-[26px] md:leading-[30px] lg:leading-[32px]"
              >
                {paragraph}
              </p>
            ))}
          </div>
        ))}

      </div>
    </div>
  );
}
