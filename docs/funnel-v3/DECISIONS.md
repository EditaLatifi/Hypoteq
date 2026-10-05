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
| D16 | Tragbarkeit Fall Gerber | Die Formel aus Spec 3 ergibt 37.6 % (Verdikt «Prüfung nötig»), das Beispiel-Dossier zeigt 32.3 %. Gebaut wird nach der Formel der Spezifikation; HYPOTEQ bestätigt, welche gilt. | Spec 3 / Fall-Dossier |
| D17 | Bestätigungsmail bei Berater-Anfragen | geht an den Kunden aus Schritt 1 (Spec 3 Schritt 6: «{name} erhält eine Bestätigung an {email}»); der Berater erhält eine Kopie. Bisher ging sie an den Partner. | Spec 3 |
| D18 | Mitkreditnehmer 2 und 3 in Salesforce | v3 fragt pro Person keine E-Mail mehr; der Sync legt Mitkreditnehmer heute nur mit E-Mail als Account an. Neu: Person Account ohne E-Mail anlegen, Daten aus den Dokumenten ergänzen. | Spec 3 Schritt 3 |
| D19 | Dateiname von Hand ändern | Nur der Berater kann den gespeicherten Namen ändern (Spec 5.1: Kunden sehen ihn nur). Der Server übernimmt `storedName` aus dem Payload nur bei `role = berater`, bereinigt ihn wie die automatischen Namen (D10; die Endung der Datei bleibt) und löst Kollisionen mit `_2`. Die interne Rolle (`?intern=1`) ist nur im Browser bekannt und zählt serverseitig nicht. | Spec 5.1 |
| D20 | Bestätigungsmail v3 | nennt die Fallnummer (Betreff und Text) und enthält einen Link zurück zur Anfrage (Nachreich-Seite: Stand des Dossiers, Unterlagen nachreichen). Dafür wird das Nachreich-Token bei v3 immer erzeugt, nicht nur bei unvollständigem Dossier. FR «vous», IT «Lei» (D9). | Spec 3 Schritt 6, Spec 7 |
| D21 | P6 Pensionskassenausweis bei offener Beschäftigung | Spec 4.1 verlangt P6 nur bei «angestellt». Ist die Beschäftigung noch nicht beantwortet, wird sie wie bei P3–P5 als angestellt behandelt, P6 steht also auch dann auf der Liste (so der Prototyp; der Gerber-Zähler beginnt nur so bei 13). Mit der Antwort «Selbständig» oder «Pensioniert» verschwindet P6 wieder. | Spec 4.1 P3–P6, Prototyp |
| D22 | P16 Solidarbürge · Lohnausweise 3 Jahre | erwartet 3 Dateien wie P3 (Spec 4.1 nennt die Anzahl nur bei P3); Dateien anderer Jahre werden wie bei P3 als «Überzählig» geführt. Bisher galt P16 mit einer Datei als vollständig. | Spec 4.1 P3 / P16 |
| D23 | Interne Ansicht (`?intern=`) | Die interne Prüfansicht (Prozentwerte, Audit-Trail) öffnet mit `?intern=<Schlüssel>`; der Schlüssel ist `NEXT_PUBLIC_V3_INTERN_KEY`. Bis HYPOTEQ einen Schlüssel setzt, gilt `?intern=1`. Reine Ansicht im Browser — serverseitig zählt sie nicht (D19). | Spec 5 |
| D24 | «Veraltet» zum Zeitpunkt der Anzeige | Die Frist (z.B. Grundbuchauszug max. 6 Monate) wird bei jeder Statusberechnung gegen das aktuelle Datum geprüft, nicht nur bei der Analyse: ein in der Anfrage noch frischer Auszug kann bei der Nachreichung bereits veraltet sein. | Spec 4.2 |
| D25 | Partner-Prüfung nicht erreichbar | Antwortet Salesforce nicht (Ausfall, Rate-Limit), sagt der Funnel «Prüfung gerade nicht möglich» statt «kennen wir noch nicht»; die Anfrage läuft weiter, der Sync prüft die Adresse beim Eingang erneut. Während der Prüfung steht «Adresse wird geprüft …». | Spec 2.2 |
| D26 | Vollständiges Dossier, Link aus der Mail | Die Nachreich-Seite eines vollständigen v3-Dossiers zeigt den Stand («vollständig») und nimmt weitere Unterlagen an; sie werden als «Weitere Dateien» geführt (Spec 4.3, `_ZUSATZ_`), das Fall-Dossier und der Case werden aktualisiert. Nur v3; abgelaufene Links bleiben abgelehnt. | Spec 3 Schritt 6, 4.3 |

## Salesforce

| # | Thema | Default |
|---|---|---|
| S1 | Bestehendes Mapping | bleibt. Abweichungen der Spezifikation sind in `HYPOTEQ_Salesforce_Mapping_Abgleich.csv` dokumentiert. |
| S2 | Neue Felder (NEU in Spec 6.5/6.8, Vorschläge 6.10) | werden erst geschrieben, wenn HYPOTEQ sie angelegt hat; bis dahin stehen die Antworten im Block `answers` von `Dokumenten_Check_State__c`. |
| S3 | `Dokumenten_Check_State__c` | Die Struktur aus Spec 6.11 wird **zusätzlich** geschrieben. `checked`, `filters` und `savedAt` bleiben, weil der Salesforce-Tab und das Partnerportal sie lesen. |
| S4 | `Bank__c`, `Zins__c`, `Laufzeit__c` | bleiben bei den Finanzierungsangeboten (bestehendes Mapping). Die Werte der bestehenden Hypothek stehen im JSON, bis HYPOTEQ ein Ziel festlegt. |
| S5 | `Origin`, `Status` | `Origin = Web` und `Status = New` erst nach Bestätigung durch HYPOTEQ, dass keine Web-to-Case-Regeln ausgelöst werden; `Stage__c` bleibt. |
| S6 | Gesamtfinanzierung bei v3 | Für v3-Payloads übernimmt der Sync `financing.hypoBetrag` (die im Funnel gezeigte Gesamtfinanzierung: Kauf Objektwert × 80 %, Ablösung bestehend + Erhöhung) als `Gesch_tzter_Hypothekenbedarf__c` und `Hypothekarvolumen__c`; `EigenmittelProzent__c` = (Objektwert − Gesamtfinanzierung) / Objektwert, `Eigenmittel__c` bleibt leer (kein eingegebener Betrag). Die Tragbarkeitsformel bleibt (S1), nur ihre Basis ändert. Der alte Funnel rechnet unverändert Kaufpreis − Eigenmittel. |
| S7 | Anrede → `Salutation` | `ans.anrede` wird als `anrede` des ersten Kreditnehmers mitgeschickt; der Sync schreibt `Salutation = Mr.`/`Mrs.` nur beim Anlegen eines neuen Person Accounts, nie auf einen bestehenden. Fehlen die Feldrechte, verwirft `writeWithFieldFallback` das Feld und der Account wird ohne Anrede angelegt. |
| S8 | `Verpf_ndung_PK__c` | `ans.pk` wird als `financing.pkVorbezug` («Ja»/«Nein») gesendet; der Picklist-Sanitizer normalisiert zusätzlich `oui`/`sì`/`si` → Ja und `non`/`no` → Nein. |
| S9 | Ferienobjekt (D8) | wird explizit leer gesendet (`artLiegenschaft = ""`), damit `Art_der_Liegenschaft__c` leer bleibt, statt auf die Ablehnung eines unbekannten Picklist-Werts zu vertrauen; `stockwerkeigentum` und Nutzung/Zweitwohnsitz unverändert. |
| S10 | Abgelehnte Felder | Verwirft Salesforce beim Schreiben ein Feld (unbekannte Spalte, fehlendes Feldrecht, ungültiger Picklist-Wert, gekürzter Text), geht nach dem Sync eine Notiz mit Fallnummer, Case-ID und Feldliste an info@hypoteq.ch; der Case selbst wird trotzdem angelegt. |

## Offene Fragen an HYPOTEQ

Siehe Kapitel «Entscheide» im Bericht. Jede Antwort ändert nur den entsprechenden Default oben.
