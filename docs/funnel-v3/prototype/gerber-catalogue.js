// Fall Gerber / Wädenswil – Dokumentkatalog mit Extrakten (aus den Original-PDFs gelesen, Scans ergänzt aus dem Case-Dossier)
window.HQ_GERBER = (function () {
  var f = function (k, v, c) { return { k: k, v: v, c: c }; };
  // Anforderungen: id, Gruppe, Label, Herkunft (Trigger), Anzahl erwarteter Dateien, Erkennungs-Regex, Extrakt
  var REQ = [
    // Person – Identität
    { id: 'vollmacht', grp: 'person', label: 'HYPOTEQ Auskunftsermächtigung', why: 'Pflicht', pat: /Auskunftsermaecht/i, pages: 2, date: '02.06.2026',
      fields: [f('Vollmachtgeber', 'Gary Samuel Gerber', .98), f('Adresse', 'Etzelstrasse 52, 8820 Wädenswil', .97), f('Unterschrift', 'vorhanden', .96), f('Unterzeichnet am', '02.06.2026', .93)] },
    { id: 'id', grp: 'person', label: 'Pass / Identitätskarte', why: 'Pflicht · pro Kreditnehmer', pat: /^01_ID_/i, pages: 1, date: '04.01.1988',
      fields: [f('Name', 'Gerber', .99), f('Vornamen', 'Gary Samuel', .99), f('Geburtsdatum', '04.01.1988', .99), f('Nationalität', 'Schweiz', .99), f('Dokumentart', 'Identitätskarte', .97), f('Gültig bis', 'erkannt · gültig', .91)] },
    // Person – Einkommen
    { id: 'lohnausweise', grp: 'person', label: 'Lohnausweise der letzten 3 Jahre', why: 'Pflicht · pro Kreditnehmer', pat: /Lohnausweis/i, expect: 3, pages: 1, date: '2023 – 2025',
      fields: [f('Arbeitgeber', 'Etzel Liegenschaften AG, Feusisberg', .99), f('AHV-Nr.', '756.8399.3512.79', .98), f('Bruttolohn 2025', "CHF 125'385", .96), f('Bruttolohn 2024', "CHF 118'900", .95), f('Bruttolohn 2023', "CHF 112'400", .94), f('Beschäftigungsgrad', '100 %', .97)],
      check: { field: 'Bruttoeinkommen', funnel: "CHF 125'000", doc: "CHF 125'385", ok: true } },
    { id: 'lohnabrechnungen', grp: 'person', label: 'Letzte 3 Monatslohnabrechnungen', why: 'Pflicht · pro Kreditnehmer', pat: /Lohnabrechnung.*02_03_04_05/i, pages: 4, date: 'Feb – Mai 2026',
      fields: [f('Arbeitgeber', 'Etzel Liegenschaften AG', .99), f('Perioden', 'Februar – Mai 2026 (4 Abrechnungen)', .98), f('Monatslohn brutto', "CHF 9'615.00", .99), f('Familienzulagen', 'CHF 30.00', .95), f('Nettolohn', "CHF 8'532.65", .99), f('Pauschalspesen', 'CHF 400.00', .96), f('Auszahlung', "CHF 8'932.65 auf UBS CH48 0028 …9140 P", .97)],
      note: '9\u2019615 × 13 = CHF 125\u2019000 – konsistent mit Lohnausweis und Funnel-Angabe.' },
    { id: 'anstellung', grp: 'person', label: 'Anstellungsvertrag', why: 'Pflicht · angestellt', pat: /Anstellungsvertrag/i, pages: 3, date: 'unbefristet',
      fields: [f('Arbeitgeber', 'Etzel Liegenschaften AG', .98), f('Arbeitnehmer', 'Gary Gerber', .98), f('Anstellung', 'unbefristet, 100 %', .92), f('Jahreslohn', "CHF 125'000 (13 × 9'615)", .90)] },
    // Person – Steuern & Vermögen & Vorsorge
    { id: 'steuer', grp: 'person', label: 'Aktuelle Steuererklärung', why: 'Pflicht · pro Kreditnehmer', pat: /Steuererklaerung_Gary_Gerber_20\d\d\.pdf$/i, pages: 16, date: 'Steuerjahr 2025',
      fields: [f('Steuerjahr', '2025', .99), f('Kanton', 'Zürich', .99), f('Zivilstand', 'ledig', .97), f('Kinder', 'Elias und Thalia Gerber, geb. 07.09.2018', .96), f('Unterhaltsbeiträge', 'ja – geleistet', .93), f('Liegenschaft', 'Etzelstrasse 52, 8820 Wädenswil', .98), f('Hypothekarschuld', "CHF 449'000 (Zuger Kantonalbank)", .97)] },
    { id: 'vermoegen', grp: 'eigenmittel', label: 'Aufstellung und Nachweis der Eigenmittel', why: 'Pflicht', pat: /Vermoegen_UBS/i, pages: 1, date: 'Mai 2026',
      fields: [f('Bank', 'UBS Switzerland AG', .98), f('Kontoinhaber', 'Gary Gerber', .98), f('Privatkonto', 'CH48 0028 3283 8152 9140 P', .97), f('Saldo total', "CHF 18'420", .88)] },
    { id: 'pk', grp: 'person', label: 'Pensionskassenausweis', why: 'Pflicht · pro Kreditnehmer', pat: /Pensionskassenausweis/i, pages: 2, date: '01.01.2026',
      fields: [f('Versicherte Person', 'Gary Gerber', .97), f('Versicherter Lohn', "CHF 99'270", .90), f('Altersguthaben', "CHF 86'500", .87), f('Vorbezug für Wohneigentum möglich', "CHF 86'500", .85)] },
    { id: 's3a', grp: 'eigenmittel', label: 'Säule 3a Bescheinigung', why: 'weil: Säule 3a = Ja', pat: /Saeule3a_Bescheinigung/i, pages: 2, date: 'Steuerjahr 2025',
      fields: [f('Vorsorgeeinrichtung', 'AXA Leben AG', .97), f('Versicherte Person', 'Gary Samuel Gerber', .98), f('Beiträge 2025', "CHF 4'800", .95), f('Beginn Vorsorgeverhältnis', '01.01.2023', .96)] },
    { id: 'police', grp: 'eigenmittel', label: 'Vorsorgepolice 3a inkl. Wertmitteilung', why: 'weil: Säule 3a = Ja', pat: /Versicherung_Saeule3a/i, expect: 2, pages: 3, date: '09.01.2026',
      fields: [f('Versicherer', 'AXA Leben AG, Winterthur', .99), f('Police-Nr.', 'L50 1583886', .99), f('Vorsorgeplan', 'SmartFlex, gebundene Vorsorge 3a', .98), f('Versicherungsbeginn', '01.01.2023 – 31.12.2051', .98), f('Monatsprämie', 'CHF 400.00', .99), f('Rückkaufswert per 09.01.2026', "CHF 10'340.49", .97), f('Begünstigte Bank', 'Zuger Kantonalbank (bestehende Verpfändung)', .92)],
      note: 'Police ist an die ZKB verpfändet – bei Ablösung an die neue Bank zu übertragen.' },
    // Person – Trigger
    { id: 'unterhalt', grp: 'person', label: 'Unterhaltsvereinbarung', why: 'weil: Unterhaltszahlungen = Ja', pat: /Unterhalt_Elternvereinbarung/i, pages: 4, date: '2025',
      fields: [f('Parteien', 'Gary Gerber und Kindsmutter', .94), f('Kinder', 'Elias Gerber, Thalia Gerber (07.09.2018)', .97), f('Unterhaltsbeitrag', "CHF 1'400 pro Monat (2 × 700)", .86), f('Gültig ab', '2025', .90)] },
    { id: 'kredit', grp: 'person', label: 'Kreditverträge (Privatkredite)', why: 'weil: Privatkredite = Ja', pat: /Privatkredit/i, pages: 4, date: 'laufend',
      fields: [f('Kreditgeber', 'BANK-now AG', .99), f('Vertragsnummer', '21768324', .98), f('Restschuld', "CHF 24'360", .96), f('Monatsrate', 'CHF 507.50', .97), f('ZEK-relevant', 'ja', .95)],
      note: 'Wird mit der Erhöhung abgelöst – Tragbarkeit verbessert sich um CHF 6\u2019090 pro Jahr.' },
    { id: 'leasing', grp: 'person', label: 'Leasingverträge', why: 'weil: Leasings = Ja', pat: /Leasingvertrag_Cembra/i, pages: 2, date: 'laufend',
      fields: [f('Leasinggeber', 'Cembra Money Bank AG', .99), f('Leasingnehmer', 'Gary Gerber', .98), f('Leasingrate', 'CHF 389.00 pro Monat', .91), f('Restlaufzeit', '14 Monate', .88)],
      note: 'Wird mit der Erhöhung abgelöst.' },
    // Objekt
    { id: 'fotos', grp: 'objekt', label: 'Fotos der Immobilie (innen und aussen)', why: 'Pflicht', pat: /Foto_Liegenschaft/i, pages: 7, date: '2026',
      fields: [f('Objekt', 'Etzelstrasse 52, 8820 Wädenswil', .96), f('Aufnahmen', '7 Seiten – Aussen, Wohnbereich, Garten, Keller', .93), f('Zustand', 'gepflegt, teilsaniert', .81)] },
    { id: 'grundbuch', grp: 'objekt', label: 'Aktueller Grundbuchauszug (max. 6 Monate)', why: 'Pflicht', pat: /Grundbuchauszug/i, pages: 7, date: '15.01.2026',
      fields: [f('Grundbuch', 'Wädenswil, Blatt 7357 und 7361', .96), f('Eigentümer', 'Gary Samuel Gerber', .97), f('Objekt', '4-Zimmerwohnung Nr. 1 EG, Werkraum, Keller, Estrich Nr. 5', .94), f('Grundpfandrechte', "Register-Schuldbrief CHF 449'000, ZKB", .95), f('Ausstellungsdatum', '15.01.2026', .99)],
      outdated: 'Auszug ist älter als 6 Monate (15.01.2026). Für die Bankanfrage braucht es einen aktuellen Auszug.' },
    { id: 'gvz', grp: 'objekt', label: 'Aktuelle Gebäudeversicherungspolice (inkl. Kubatur)', why: 'Pflicht', pat: /Gebaeudeversicherung/i, pages: 1, date: '10.01.2026',
      fields: [f('Versicherung', 'GVZ Gebäudeversicherung Kanton Zürich', .99), f('Policen-Nr.', "167'371", .99), f('Eigentümerschaft', 'Stockwerkeigentümergemeinschaft Etzelstrasse 52', .98), f('Versicherungssumme', "CHF 1'509'314 (Neuwert)", .99), f('Erstellungsjahr', '1921', .99), f('Volumen', "1'497 m³", .97)],
      check: { field: 'Baujahr', funnel: '1921', doc: '1921', ok: true } },
    { id: 'verkaufsdoku', grp: 'objekt', label: 'Verkaufsdokumentation', why: 'Pflicht', pat: /Verkaufsdokumentation/i, pages: 23, date: '26.01.2024', optionalHint: 'Falls vorhanden',
      fields: [f('Anbieter', 'Gespo Immobilien GmbH, Zürich', .98), f('Objekt', '4.5-Zimmer-Wohnung EG, Etzelstrasse 52', .98), f('Baujahr', '1921 (Jugendstil, teilsaniert)', .97), f('Verkaufspreis 2024', "CHF 1'450'000", .97), f('Garten', 'ca. 50 m² mit Gartenhaus', .92), f('Heizung', 'Holzofen im Wohnzimmer erwähnt – Hauptheizung nicht angegeben', .71)],
      note: 'Heizungsart im Funnel «unbekannt» – Dokument liefert keine eindeutige Angabe.' },
    { id: 'stwe_regl', grp: 'objekt', label: 'Begründungsakt mit Wertquoten · Nutzungs- und Verwaltungsreglement', why: 'weil: Stockwerkeigentum', pat: /STWE_Reglement/i, pages: 20, date: 'angepasst',
      fields: [f('Gemeinschaft', 'STWEG Etzelstrasse 52, Wädenswil', .96), f('Umfang', '20 Seiten, angepasste Fassung', .95), f('Wertquote Einheit Nr. 1', 'erkannt', .82)] },
    { id: 'stwe_plan', grp: 'objekt', label: 'Bau- / Grundrisspläne inkl. Nettowohnfläche', why: 'Pflicht', pat: /Aufteilungsplaene/i, pages: 11, date: '',
      fields: [f('Objekt', 'Etzelstrasse 52, Wädenswil', .95), f('Pläne', '11 Seiten – EG, OG, DG, Keller', .94), f('Einheit Nr. 1', 'EG mit Gartenanteil', .89)] },
    { id: 'ef', grp: 'objekt', label: 'Angaben zum Erneuerungsfonds', why: 'weil: Stockwerkeigentum', pat: /Erneuerungsfonds/i, pages: 2, date: '15.03.2026',
      fields: [f('Kontoinhaber', 'STWEG Etzelstrasse 52', .99), f('IBAN', 'CH64 0021 4214 1297 88M1 F (UBS)', .98), f('Saldo per 31.12.2025', "CHF 10'047.65", .99), f('Erstellt am', '15.03.2026', .99)] },
    // Bestehende Hypothek
    { id: 'hyp_rahmen', grp: 'hypothek', label: 'Aktueller Hypothekarvertrag (Rahmenvertrag)', why: 'weil: Ablösung', pat: /Hypothek_Rahmenvertrag/i, pages: 7, date: '20.01.2023',
      fields: [f('Bank', 'Zuger Kantonalbank', .99), f('Kunden-Nr.', '78.596.237', .98), f('Rahmenkredit', "CHF 449'000", .98), f('Vertragsbeginn', '20.01.2023', .95)] },
    { id: 'hyp_sicher', grp: 'hypothek', label: 'Sicherungsvereinbarung / Schuldbrief', why: 'weil: Ablösung', pat: /Sicherungsvereinbarung/i, pages: 3, date: '2023',
      fields: [f('Bank', 'Zuger Kantonalbank, Zug', .99), f('Schuldner', 'Gary Gerber, geb. 04.01.1988', .98), f('Grundpfandtitel', "Register-Schuldbrief CHF 449'000", .98), f('Lastend auf', '4-Zimmerwohnung Nr. 1 EG, Werkraum Nr. 1, Keller Nr. 1, Estrich Nr. 5 – GB Wädenswil Blatt 7357 / 7361', .94)] },
    { id: 'hyp_zins', grp: 'hypothek', label: 'Letzte Zinsabrechnung', why: 'weil: Ablösung', pat: /Zinsabrechnung/i, pages: 1, date: '30.03.2026',
      fields: [f('Produkt', 'SARON-Hypothek', .99), f('Kapital', "CHF 449'000.00", .99), f('Zinssatz', '0.65 % p.a.', .99), f('Laufzeit', '20.01.2023 – 30.01.2028', .99), f('Zins Q1 2026', 'CHF 729.65', .98)],
      check: { field: 'Bestehende Hypothek', funnel: "CHF 449'000", doc: "CHF 449'000", ok: true },
      check2: { field: 'Ablösedatum', funnel: '30.01.2028', doc: '30.01.2028', ok: true } }
  ];

  // Dateien ausserhalb der Anforderungen
  var EXTRA = [
    { pat: /Lohnausweis_Gary_Gerber_2022/i, kind: 'surplus', label: 'Lohnausweis 2022', text: 'Vierter Lohnausweis – die Anforderung umfasst drei Jahre. Wird im Dossier mitgeführt.' },
    { pat: /Steuererklaerung_Gary_Gerber_2024\.pdf$/i, kind: 'surplus', label: 'Steuererklärung 2024', text: 'Vorjahr – die aktuelle Steuererklärung 2025 liegt bereits vor. Wird im Dossier mitgeführt.' },
    { pat: /Leasingvertrag_Cembra_Gary_Gerbe\.pdf$/i, kind: 'duplicate', label: 'Leasingvertrag (Duplikat)', text: 'Identischer Inhalt wie 01_Leasingvertrag_Cembra_Gary_Gerber.pdf – wird nicht doppelt gespeichert.' },
    { pat: /Lohnabrechnung_Gary_Gerber_2026_04\.pdf$/i, kind: 'notneeded', label: 'Lohnabrechnung April 2026 (einzeln)', text: 'Bereits in der Sammel-Abrechnung Feb–Mai enthalten.' },
    { pat: /Steuererklaerung.*Entwurf/i, kind: 'notneeded', label: 'Steuererklärung 2024 – Entwurf', text: 'Entwurf, nicht eingereichte Fassung. Nicht erforderlich.' },
    { pat: /Steuerrechnung.*2023/i, kind: 'notneeded', label: 'Steuerrechnung 2023 Schlussrechnung', text: 'Steuerrechnungen werden für die Prüfung nicht benötigt.' },
    { pat: /Steuerrechnung.*2024/i, kind: 'notneeded', label: 'Steuerrechnung 2024 provisorisch', text: 'Steuerrechnungen werden für die Prüfung nicht benötigt.' },
    { pat: /Unterhalt_Bestaetigung/i, kind: 'notneeded', label: 'Unterhalt – Bestätigung', text: 'Die Elternvereinbarung deckt die Anforderung bereits ab.' },
    { pat: /Verpfaendung_Vorsorge/i, kind: 'notneeded', label: 'Verpfändung Vorsorge', text: 'Verpfändung an die ZKB – wird mit der Ablösung hinfällig.' },
    { pat: /Betriebskostenabrechnung/i, kind: 'notneeded', label: 'Betriebskostenabrechnung', text: 'Für die Finanzierungsprüfung nicht erforderlich.' },
    { pat: /Nebenkostenabrechnung/i, kind: 'notneeded', label: 'Nebenkostenabrechnung 2025', text: 'Für die Finanzierungsprüfung nicht erforderlich.' }
  ];

  var GROUPS = { objekt: 'Zum Objekt', hypothek: 'Bestehende Hypothek', person: 'Zur Person · Gary Gerber', eigenmittel: 'Eigenmittel & Vorsorge', extra: 'Weitere Dateien' };

  // Alle Demo-Dateinamen (für die Simulation ohne echten Drop)
  var FILES = ['01_Anstellungsvertrag_Etzel.pdf', '01_Auskunftsermaechtigung_Gary_Gerber_unterzeichnet.pdf', '01_ID_Gary_Gerber.pdf', '01_Leasingvertrag_Cembra_Gary_Gerbe.pdf', '01_Leasingvertrag_Cembra_Gary_Gerber.pdf', '01_Lohnabrechnung_Gary_Gerber_2026_02_03_04_05.pdf', '01_Lohnausweis_Gary_Gerber_2022.pdf', '01_Lohnausweis_Gary_Gerber_2023.pdf', '01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf', '01_Lohnausweis_Gary_Gerber_2025.pdf', '01_Pensionskassenausweis_Gary_Gerber_2026.pdf', '01_Privatkredit_BANKnow_Gary_Gerber_21768324.pdf', '01_Saeule3a_Bescheinigung_Gary_Gerber.pdf', '01_Steuererklaerung_Gary_Gerber_2024.pdf', '01_Steuererklaerung_Gary_Gerber_2025.pdf', '01_Unterhalt_Elternvereinbarung_Gary_Gerber_2025.pdf', '01_Vermoegen_UBS_Konten_Gary_Gerber.pdf', '01_Versicherung_Saeule3a_Police_Gary_Gerber_1583886.pdf', '01_Versicherung_Saeule3a_Wertmitteilung_Gary_Gerber_1583886.pdf', '03_Erneuerungsfonds_Auszug_Liegenschaft.pdf', '03_Foto_Liegenschaft_Etzelstrasse_52.pdf', '03_Gebaeudeversicherung_GVZ_Liegenschaft_2026.pdf', '03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf', '03_Hypothek_Rahmenvertrag_ZKB_Gary_Gerber.pdf', '03_Hypothek_Sicherungsvereinbarung_ZKB_Gary_Gerber.pdf', '03_Hypothek_Zinsabrechnung_ZKB_Gary_Gerber.pdf', '03_STWE_Aufteilungsplaene_Liegenschaft.pdf', '03_STWE_Reglement_Liegenschaft_angepasst.pdf', '03_Verkaufsdokumentation_Etzelstrasse_52_8820_Waedenswil.pdf'];
  var FILES_NN = ['01_Lohnabrechnung_Gary_Gerber_2026_04.pdf', '01_Steuererklaerung_Gary_Gerber_2024_Entwurf.PDF', '01_Steuerrechnung_Gary_Gerber_2023_Schlussrechnung.pdf', '01_Steuerrechnung_Gary_Gerber_2024_provisorisch.pdf', '01_Unterhalt_Bestaetigung_Gary_Gerber.pdf', '01_Verpfaendung_Vorsorge_Gary_Gerber.pdf', '03_Betriebskostenabrechnung_Liegenschaft_Gary_Gerber.pdf', '03_Nebenkostenabrechnung_Etzelstrasse_52_Waedenswil_2025.pdf'];

  function classify(name) {
    for (var i = 0; i < EXTRA.length; i++) if (EXTRA[i].pat.test(name)) return { kind: EXTRA[i].kind, extra: EXTRA[i] };
    for (var j = 0; j < REQ.length; j++) if (REQ[j].pat.test(name)) return { kind: 'req', req: REQ[j] };
    return { kind: 'unknown' };
  }

  return { REQ: REQ, EXTRA: EXTRA, GROUPS: GROUPS, FILES: FILES, FILES_NN: FILES_NN, classify: classify };
})();
