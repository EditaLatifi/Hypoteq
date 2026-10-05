# Funnel v3 – Umsetzungsentscheide

Grundlage: `HYPOTEQ_Funnel_Spezifikation.md` (Stand 05.10.2026) und der Prototyp in `prototype/`.
Wo die Spezifikation offen lässt oder einen Vorschlag macht, gilt bis zum Entscheid von HYPOTEQ der
Default unten. Jeder Default ist so gebaut, dass er an einer Stelle geändert werden kann.

Die Spezifikation hat Vorrang vor dem früheren Excel-Feedback (Dokumenten-Regeln, Stand 21.09.2026).
Beim Salesforce-Mapping gilt die Regel der Spezifikation: **das bestehende Mapping bleibt gültig**.

## Daten und Ablauf

| # | Thema | Default | Quelle |
|---|---|---|---|
| D1 | Fallnummer für Dateinamen und Dossier | `HQ-JJ-MM-NNNNNN` wird beim Abschluss erzeugt und auf der Inquiry gespeichert. Nicht von Salesforce abhängig, weil der Sync fehlschlagen darf. | Spec 5.1, Beispiel `HQ-26-06-156283` |
| D2 | Anzahl Kreditnehmer | höchstens 3 (Salesforce hat `Client__c` … `Client_3__c`) | Spec 8.5 |
| D3 | Beschäftigung, «Pensionskasse vorhanden» | pro Kreditnehmer (bestehendes Datenmodell, Salesforce-Feld pro Person) | Prototyp fragt einmal |
| D4 | «ab 50», Kinder, Unterhalt, Privatkredite, Leasings, Solidarbürgschaft | einmal pro Anfrage | Spec 3 |
| D5 | Pflichtfelder beim Klick auf «Weiter» | S1: Antrag, Kreditnehmer, Anrede, Vorname, Nachname, E-Mail; Berater-E-Mail (Berater); Telefon (Kunde). S2: PLZ, Ort, Art der Immobilie, Art der Liegenschaft, Nutzung; bestehende Hypothek (Ablösung); Erhöhungsbetrag (Erhöhung = Ja); Kaufpreis (Neue Hypothek). S3: Einkommen und Beschäftigung (natürliche Person); Firma und zeichnungsberechtigte Person (juristische Person); Name Solidarbürge (Bürgschaft = Ja). S4: Objektwert, Laufzeit. Alles andere hat einen Default. | Spec 1.6 «Validierung beim Klick auf Weiter» |
| D6 | Klick im Fragepfad | zurück immer, vorwärts nur zu schon besuchten Schritten | – |
| D7 | Berechnung | Formeln aus Spec 3 Schritt 4 (Kauf: Objektwert × 80 %). Juristische Person: Belehnung ja, Tragbarkeit «–» (kein Einkommen). Unterhalt zählt nicht in die Tragbarkeit, steht im Dossier als Hinweis. | Spec 3 |
| D8 | Ferienobjekt | bleibt als Option wie in Spec 3; in Salesforce wird `Art_der_Liegenschaft__c` leer gelassen | Spec 6.5 / 8.1 |
| D9 | Anrede FR / IT | «vous» / «Lei» (so in der gelieferten Sprachdatei) | Spec 7 / 8.9 |
| D10 | Umlaute im Dateinamen | ä → a, ö → o, ü → u, é → e (Regel aus Spec 5.1) | Spec 5.1 |
| D11 | Sprache von Bestätigungsmail und Dossier | Funnel-Sprache | Spec 8.10 |
| D12 | Dossier-PDF | serverseitig erzeugt, im SharePoint-Fall-Ordner abgelegt, Download im Abschluss | Spec 3 Schritt 6 |
| D13 | Partner-Erkennung | Live-Abfrage in Salesforce (exakter E-Mail-Abgleich auf Contact) mit Zwischenspeicher; `@hypoteq.ch` / `@hypoteq.com` → User. Das Kriterium «aktiver VP-Berater» ist konfigurierbar (`SF_PARTNER_CONTACT_FILTER`), bis HYPOTEQ es festlegt. Unbekannte Partner werden **nicht** mehr als Platzhalter-Kontakt angelegt. | Spec 2.2, 8.7 |
| D14 | Alter Funnel ohne Sprachpräfix (`/funnel`) | Weiterleitung auf `/{sprache}/funnel` | – |
| D15 | Zuordnung von Dokumenten | eine Drop-Zone, automatische Zuordnung; nur «Nicht erkannt» wird manuell zugeordnet | Spec 5 |

## Salesforce

| # | Thema | Default |
|---|---|---|
| S1 | Bestehendes Mapping | bleibt. Abweichungen der Spezifikation sind in `HYPOTEQ_Salesforce_Mapping_Abgleich.csv` dokumentiert. |
| S2 | Neue Felder (NEU in Spec 6.5/6.8, Vorschläge 6.10) | werden erst geschrieben, wenn HYPOTEQ sie angelegt hat; bis dahin stehen die Antworten im Block `answers` von `Dokumenten_Check_State__c`. |
| S3 | `Dokumenten_Check_State__c` | Die Struktur aus Spec 6.11 wird **zusätzlich** geschrieben. `checked`, `filters` und `savedAt` bleiben, weil der Salesforce-Tab und das Partnerportal sie lesen. |
| S4 | `Bank__c`, `Zins__c`, `Laufzeit__c` | bleiben bei den Finanzierungsangeboten (bestehendes Mapping). Die Werte der bestehenden Hypothek stehen im JSON, bis HYPOTEQ ein Ziel festlegt. |
| S5 | `Origin`, `Status` | `Origin = Web` und `Status = New` erst nach Bestätigung durch HYPOTEQ, dass keine Web-to-Case-Regeln ausgelöst werden; `Stage__c` bleibt. |

## Offene Fragen an HYPOTEQ

Siehe Kapitel «Entscheide» im Bericht. Jede Antwort ändert nur den entsprechenden Default oben.
