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

## Datenbank

Neue Tabellen in `prisma/sql/2026-10-15-v5-and-portal.sql` (von Hand ausführen, idempotent).
Keine neue Spalte an bestehenden Tabellen: ein Build mit dem neuen Prisma-Client läuft auch
gegen eine Datenbank, auf der das SQL noch nicht lief – nur die neuen Funktionen fehlen dann.
