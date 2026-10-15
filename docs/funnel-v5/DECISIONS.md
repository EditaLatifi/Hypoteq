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
| V13 | Kreditnehmer 2 im Modell | `borrowers[1]` (Vorname, Nachname), Einkommen in `fin.inc2`; höchstens 2 Kreditnehmer (`MAX_BORROWERS`). Ohne Beschäftigungsfrage gilt Kreditnehmer 2 als angestellt (D21) – das ist genau die P17-Liste; keine Steuererklärung, keine 4.2-Dokumente für ihn. Vorname und Nachname sind Pflicht, das Einkommen nicht. Gespeicherte v3-Anfragen mit 3 Kreditnehmern bleiben lesbar. | Handover 2 Schritt 3, 4.1 P17 |
| V14 | 13. Monatslohn nicht erkennbar | Bonus wird mit × 13, Lohnerhöhung mit × 12 geprüft – jeweils die Lesart, die kein Dokument hinzufügt («Es wird nichts geraten»). | Handover 4.2 |
| V15 | Felder der Extraktion | Generisch statt jahresgebunden: Lohnausweis «Jahr» + «Bruttolohn» (statt «Bruttolohn 2025/2024/2023»), Verkaufsdokumentation «Verkaufspreis», 3a-Police «Rückkaufswert». Analysen von vor v5 werden weiter gelesen. Neu u.a. «13. Monatslohn», «Geschlecht» (ID → Anrede), «Eigenmietwert», «Eigentumsübertragung», «PLZ», «Ort», «Baurecht». | Handover 3.1, 4.2 |
| V16 | Widersprüchliche Dokumente | Geben zwei Dokumente demselben Feld verschiedene Werte (Zinsabrechnung → Ablösung, Kaufvertrag → Neue Hypothek; zwei Personen auf IDs ohne erfassten Namen), bleibt das Feld leer. Von mehreren Dateien desselben Typs zählt die neueste. | Handover 3 |
| V17 | Handelsregisterauszug | setzt Kreditnehmer = juristische Person und die erste zeichnungsberechtigte Person, beides «bitte prüfen»; die ID füllt dann keinen Namen (sie gehört der zeichnungsberechtigten Person). | Handover 3.1 |
| V18 | Pflichtfelder v5 (ersetzt D5) | Anfrage: Berater-E-Mail (Berater), Antrag, Kreditnehmer, Anrede/Vorname/Nachname bzw. Firma/zeichnungsberechtigte Person, E-Mail, Telefon (beide Rollen). Kontakt (schnell): Berater-E-Mail, E-Mail, Telefon. Objekt: PLZ, Ort, Immobilie, Liegenschaft, Nutzung; Ablösung: bestehende Hypothek, Erhöhung, Objektwert; Kauf: Kaufpreis, Renovationsbetrag bei Renovation = Ja. Personen: Einkommen und Beschäftigung KN 1, Name KN 2, Name Bürge. Laufzeit, Kaufdatum, Netto-Mietertrag und Eigenmittel sind optional. | Handover 2, 3 |
| V19 | O11 Renovationen bei Bauprojekt | Regel des Handovers «Neue Hypothek + Renovation» ohne die Ausnahme des Prototyps für Bauprojekt. | Handover 4.1 |
| V20 | Rechnung: zwei Abweichungen vom Prototyp | Harte Eigenmittel ≥ 10 % des **Kaufpreises** (Prototyp: der Gesamtkosten). Leerer Objektwert = Kaufpreis, auch mit Renovation (Prototyp: Gesamtkosten) – die Renovation erhöht die Basis nur mit einem geschätzten Objektwert. | Handover 2, 5 |
| V21 | Auskunftsermächtigung P0 | bleibt eine Anforderung (zählt für `Documents_completed__c`, JSON, Dossier) und ist im UI ein eigener Block (`block: "signature"`). Erfüllt durch eine Datei auf P0 (eigener Button oder im Ordner erkannt); «Unterschrift fehlt», wenn die Felder «Unterschrift» oder «Vollmachtgeber» nicht passen; ein von Hand hochgeladenes, nicht lesbares Exemplar gilt als erhalten. | Handover 6 |
| V22 | Nicht mehr verlangte Unterlagen | Rahmenvertrag und Schuldbrief sind «nicht benötigt»-Typen unter ihren alten Ids; Anstellungsvertrag ohne Lohnerhöhung und Eigenmittelnachweis bei Ablösung «nicht benötigt» mit Begründung (Prototyp NN); ältere Lohnausweise ohne Bonus «überzählig». Dateien, die eine vor v5 gespeicherte Anfrage solchen Anforderungen zugeordnet hatte, bleiben als «überzählig» im Ordner und werden nie gelöscht. | Handover 4.1–4.3 |
| V23 | Nachreichung von Anfragen vor v5 | werden nach den v5-Regeln beurteilt (`lib/funnel-v3/legacy.ts`): Kinder + Unterhalt → Chip Unterhalt, ab 50 → Fakt aus der ID, Heizungsart → Fakt, Eigenmittel-Ja/Nein → `legacyEquity` (fordert das Dokument wie ein Betrag), Ferienobjekt → keine Liegenschaft. Dadurch kann z.B. neu die Produktvereinbarung statt des Rahmenvertrags gefordert sein. | Handover 9 |
| V24 | Moduswechsel | Schnell → Begleitet: gleiches Thema; Kontakt und Unterlagen → Anfrage. Begleitet → Schnell: mit hochgeladenen Dateien gleiches Thema, sonst «Kontakt» (Prototyp). | Handover 1, 3 |
| V25 | `Dokumenten_Check_State__c` v5 | zusätzlich `entry`, `sources`, `signature`, `info`; `answers` mit Chips, `eigenmittel` (nur erfasste), `renovationsBetrag`, `nettoMietertrag`, `einkommenKn2`, `kaufdatum`, ggf. `legacyEquity`. `version` bleibt 1 (Erweiterung). | Handover 8 |
| V26 | Payload und bestehendes Mapping | v5-Werte gehen zusätzlich in die Felder, die das bestehende Mapping schon liest: `eigenmittel_*`, `kaufdatum` (Kauf), `abloesedatum` aus der Zinsabrechnung (Ablösung), `netto_mietertrag`, `steueroptimierung`, `pkVorbezug` = PK-Verpfändung > 0, `brutto` = KN 1 + KN 2, Geburtsdatum und Zivilstand von KN 1 aus den Dokumenten. `renovationsBetrag` bleibt leer (V4). | V5, Handover 8 |
| V27 | Sitzung im Browser | sessionStorage-Version 2; eine v3-Sitzung wird verworfen, der Funnel startet leer. | – |
| V28 | Abhängige Antworten | Kreditnehmer wechseln setzt die Nutzung zurück (nur bei geändertem Wert). Der Store lehnt Bauprojekt bei Ablösung, Gewerbe bei natürlicher, Selbstbewohnt/Zweitwohnsitz bei juristischer Person und den Chip Unterhalt bei juristischer Person ab. Vom System geleerte Felder verlieren «aus Dokument» und «touched». | Handover 2, Prototyp setAns |
| V29 | Vermerk «aus Dokument» | entfällt, wenn das Dokument entfernt wird; der Wert bleibt. Säule 3a aus Dokumenten: Rückkaufswert der Police vor Guthaben der Bescheinigung, nicht addiert. | Handover 3 |
| V30 | «Nichts wird gelöscht» (offen) | Handover 4.3 sagt, nichts werde gelöscht; der Abschluss entfernt wie bisher Duplikate und nicht benötigte, nicht behaltene Dateien aus dem Fall-Ordner (v1 5.1, Zeile bleibt mit Audit). Unverändert gelassen, bis HYPOTEQ entscheidet. | Handover 4.3 / v1 5.1 |

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
