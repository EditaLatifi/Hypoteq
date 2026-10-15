# Funnel v5 und Partnerportal (Handoff 14.10.2026) – Umsetzungsentscheide

Grundlage: `HYPOTEQ_Handover_Edita.md` (Funnel v5, 14.10.2026) und
`docs/partner-portal/handoff-2026-10-14/README.md`. Der v5-Funnel wird im bestehenden
v3-Code umgesetzt (`lib/funnel-v3`, `components/funnel-v3`): gleiche Pipeline, gleiches
Datenmodell, gleiche Nachreichung. Die v3-Entscheide in `docs/funnel-v3/DECISIONS.md` gelten
weiter, soweit unten nichts anderes steht.

Wo das Handover offen lässt oder einen Vorschlag macht, gilt bis zum Entscheid von HYPOTEQ
der Default unten. Jeder Default ist an **einer** Stelle im Code änderbar.

Prototyp (Referenz für Verhalten): `Downloads/HYPOTEQ UI Mockups  Funnel 1/Entwicklung/04_Prototyp/`.
Er ist bewusst nicht im Repository, weil er echte Kundendaten enthält (README des Pakets).

## Funnel

| # | Thema | Default | Quelle |
|---|---|---|---|
| V1 | Formel | Gebaut wird die Formel aus Handover Kap. 5 (Hypothek aus Kaufpreis + Renovation − Eigenmittel, ohne Eigenmittel 80 %; Basis = tieferer Wert von Gesamtkosten und Objektwert; Tragbarkeit 5 % Zins, Amortisation auf ⅔, 1 % Nebenkosten, max. 33 %). Sie erfüllt den Pflicht-Testfall Rosanna (400'000 · 80 % · 19.6 %). Der Homepage-Rechner rechnet anders (17.8 %, Grenze 35 %); er wird nicht verändert. Alle Parameter stehen in `lib/funnel-v3/calc.ts`. | Handover 5, offen für Marco (10.3) |
| V2 | Schwelle Bonus / Lohnerhöhung | 5 %, eine Konstante | Handover 4.2, offen (10.2) |
| V3 | Zinsabrechnung bei Ablösung | bleibt Pflicht (wie im Prototyp); liefert Bank, Zins, Ablösedatum | Handover 4.1 H2, offen (10.1) |
| V4 | Renovationsbetrag in Salesforce | kein Feld: nur im JSON `Dokumenten_Check_State__c`, nicht in `Betrag__c` | Handover 8, offen (10.5) |
| V5 | Salesforce-Konflikte | Das bestehende Mapping gewinnt (README des Pakets, v3 S1). Wo ein v5-Vorschlag ein Feld nennt, das schon anders belegt ist, wird nur das bestehende geschrieben; der Wert steht zusätzlich im JSON. | README, Handover 8 |
| V6 | Nutzung «Vermietet & teilweise selbstbewohnt» | nicht angeboten | offen (10.6) |
| V7 | Konfidenz-Schwelle «aus Dokument · bitte prüfen» | 90 % | Handover 3 |
| V8 | Kreditnehmer 2 | ein zweiter Kreditnehmer (Vorname, Nachname, Einkommen), nur nach «+ Kreditnehmer hinzufügen». Seine Unterlagen nach P17. | Handover 2 Schritt 3 |
| V9 | Nicht mehr gefragt | Kinder, ab 50, Heizungsart, Ferienobjekt, Eigenmittel-Ja/Nein. «ab 50» kommt aus dem Geburtsdatum der ID, Heizungsart aus den Dokumenten. Alte Inquiries mit diesen Antworten bleiben lesbar. | Handover 0, 2 |
| V10 | Mail-Texte | Betreff und Abschnitte aus `HYPOTEQ_Funnel_i18n.json` (`mail.*`); Fliesstext, wo das Paket keinen liefert, aus den bestehenden v3-Mails übernommen. | Handover 7 |
| V11 | Auskunftsermächtigung «später nachreichen» | Status «Unterschrift ausstehend»; Erinnerung nach 2 und 5 Tagen über den täglichen Cron; keine Anfrage an die Bank ohne Unterschrift (in der internen Mail und im Case vermerkt). | Handover 6 |
| V12 | Vorlage Auskunftsermächtigung | `public/documents/Auskunftsermaechtigung-1.pdf`; die Belegung der Felder `Text1` … `Text12` steht in einer Tabelle im Code und wird aus Lage und Beschriftung im PDF abgeleitet, bis HYPOTEQ sie bestätigt. | Handover 6 |

## Partnerportal

| # | Thema | Default | Quelle |
|---|---|---|---|
| P1 | Architektur | Eigenes Login, SharePoint für Dateien, Salesforce für Cases bleiben. Kein Supabase Auth / Storage: sonst müssten alle Partner ihr Passwort neu setzen und Dokumente lägen in zwei Systemen. Bilder (Foto, Logo) liegen in der Tabelle `PortalImage`. | Handoff 1 «Annahme MVP» |
| P2 | Case-Status | Die 12 Status des Handoffs werden aus `Stage__c` / `Status` abgeleitet. Gibt es `Portal_Status__c` am Case, gewinnt es. | Handoff 5 |
| P3 | Dokument-Status | Vorhanden, Fehlt, Hochgeladen wie bisher; «In Prüfung» für Portal-Uploads, die noch nicht geprüft sind; «Ungültig» und «Neu erforderlich» nur, wo `Dokumenten_Check_State__c` sie liefert (z.B. veraltet → Neu erforderlich). | Handoff 5 |
| P4 | E-Mail-Domain | Es gilt die konfigurierte Adresse (heute `info@hypoteq.ch`); das UI zeigt die konfigurierte Adresse, nicht fest `info@hypoteq.com`. | Handoff 4, offen |
| P5 | Spezialfinanzierung in Salesforce | Case mit RecordType «Spezialfinanzierung», falls vorhanden, sonst Standard-RecordType mit Betreff «Spezialfinanzierung · <Typ>»; Mail ans Team. | Handoff 4, offen (10) |
| P6 | Logo und Foto | Logo pro Partner-Firma (Salesforce Account, gilt für alle User), Foto pro User. «powered by HYPOTEQ» bleibt unter dem Partnerlogo. | Handoff 10, offen |
| P7 | Ableitung Case-Status | Reihenfolge (`lib/portal/status.ts`): `Portal_Status__c`, wenn er einen der 12 Status enthält (Schreibweise egal) → `PORTAL_STAGE_MAP` → Stage «Verloren» = **Storniert** → Status Closed = Abgeschlossen → `Angebot_Datum__c` = Rückmeldung erhalten, `Welche_Banken_wurden_angefragt__c` = Bei Kreditgeber; je mit einem Dokument «Neu erforderlich»/«Ungültig» = Nachbearbeitung notwendig → fehlende Dokumente = Dokumente ausstehend → Stage Proposal = Bereit für Kreditgeber → In Bearbeitung / Qualifiziert / Escalated / On Hold = In Prüfung (On Hold zusätzlich mit Hinweis «pausiert») → Dokumente-Haken bzw. Funnel-Verdikt = Dokumente vollständig → sonst Neue Anfrage. «Finanzierung bestätigt» und «Abgelehnt» kommen nur aus `Portal_Status__c` (oder `PORTAL_STAGE_MAP`): die Org führt keinen Verlustgrund, darum ist «Verloren» Storniert. «Pausiert» und «Nicht weiterverfolgt» entfallen; der Wechsel auf die neuen Namen löst keine Meldung aus (`isRelabel`). | Handoff 5, P2 |
| P8 | Navigation «Dokumente» | Nicht mehr in der Navigation: die Handoff-Reihenfolge hat sechs Einträge (Mobile fünf), und Dokumente stehen jetzt pro Case nach Kategorie. Die Seite `/portal/dokumente` bleibt und ist im Dashboard-Block «Aktion erforderlich» als «Alle fehlenden Dokumente» verlinkt. | Handoff «Shell» |
| P11 | Dokument-Status im Portal | Ein Portal-Upload zu einem Listen-Dokument ist «In Prüfung», ein «Weiteres Dokument» «Hochgeladen»; beide werden «Vorhanden», sobald der Case ab «Bereit für Kreditgeber» steht. Bisher «Offen» (von HYPOTEQs Liste erwartet, nicht bestätigt) heisst jetzt «Fehlt» mit dem Vermerk «gemäss HYPOTEQ-Dokumentenliste» und zählt für «Aktion erforderlich» (wie das Dashboard schon bisher). Kategorien = Gruppen des Funnel v3 (Person & Einkommen, Objekt, Bestehende Hypothek, Eigenmittel & Vorsorge, Weitere). | Handoff 5, P3 |
| P13 | Portal-Felder in Salesforce | Jedes `Portal_*`-Feld wird per describe (einmal pro Server-Instanz) geprüft, nie angenommen. `Portal_Status__c` wird gelesen, sobald es existiert; `Portal_Visible__c` filtert nur, wenn `PORTAL_SF_VISIBLE_FIELD` gesetzt ist (ein neues, leeres Häkchenfeld würde sonst alle Cases verbergen). `Portal_Access__c` auf dem Contact, sonst dem Account. Die Admin-Partnerseite zeigt pro Feld den Wert bzw. «true/gesetzt bei x von y Cases» oder «Feld nicht vorhanden». | Handoff «Administration» |
| P14 | «Neue Finanzierung» auf dem Handy | Der Prototyp zeigt den Button nur am Desktop. Auf dem Handy bleibt er als runder «+»-Knopf im Header, sonst führte dort kein Weg in den Funnel. | Handoff «Shell» |
| P15 | Sitzung abgelaufen | Der Server beendet die Sitzung nach 30 Min. ohne Anfrage (bestand schon). Neu: kehrt man zu einem offenen Tab zurück und ist die Zeit um, erscheint «Sitzung abgelaufen» sofort statt erst beim nächsten Klick. | Handoff «Sicherheit» |
| P16 | Zugriff verweigert | Die Prüfung ist die Scope-Klausel jeder Salesforce-Abfrage (kein RLS, siehe P1): ein fremder oder geratener Case wird gar nicht gelesen; der Versuch steht im Audit Log («Zugriff verweigert», Pfad). Die Seite zeigt den 403-Screen. | Handoff «Zugriff verweigert» |

## Datenbank

Neue Tabellen in `prisma/sql/2026-10-15-v5-and-portal.sql` (von Hand ausführen, idempotent).
Keine neue Spalte an bestehenden Tabellen: ein Build mit dem neuen Prisma-Client läuft auch
gegen eine Datenbank, auf der das SQL noch nicht lief – nur die neuen Funktionen fehlen dann.
