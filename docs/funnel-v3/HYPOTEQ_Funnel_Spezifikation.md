# HYPOTEQ Finanzierungsfunnel – Spezifikation für die Umsetzung

Stand: 05.10.2026 · Referenz-Prototyp: `HYPOTEQ_Funnel_Prototyp.html` (= *HYPOTEQ Funnel v3*) · Demo-Fall: Gary Gerber, 8820 Wädenswil (Ablösung mit Erhöhung, STWE)

Beilagen in diesem Paket:

| Datei | Inhalt |
|---|---|
| `HYPOTEQ_Funnel_Prototyp.html` | Klickbarer Prototyp, offline lauffähig (Desktop + Mobile) |
| `HYPOTEQ_Fall-Dossier_Gerber.html` | Beispiel des PDF-Dossiers, das beim Abschluss erzeugt wird |
| `HYPOTEQ_Salesforce_Mapping_Vorschlag.csv` | Feld-Mapping Funnel → Salesforce als Tabelle (Excel, `;`-getrennt) |
| `HYPOTEQ_Funnel_i18n.json` | Alle Texte DE / EN / FR / IT als Sprachdatei (297 Keys) |
| `HYPOTEQ_Funnel_Uebersetzungen.csv` | Dieselben Texte als Tabelle zum Gegenlesen, mit Spalte «Review» |
| dieses Dokument | Funnel-Logik, Dokumentenlogik, Mapping-Vorschlag, offene Punkte |

---

## 1. Grundprinzipien

1. **Nur fragen, was nicht in einem Dokument steht.** Alles, was in einem Pflichtdokument steht (Geburtsdatum, Adresse, Arbeitgeber, Bank, Zinssatz, Baujahr …), wird nach dem Upload ausgelesen und zur Bestätigung angezeigt – nicht abgefragt.
2. **Jede Frage steuert entweder die Dokumentenliste oder die Erstbeurteilung** (Belehnung, Tragbarkeit). Sonst gehört sie nicht in den Funnel.
3. **Alle Ja/Nein-Zusatzfragen stehen standardmässig auf «Nein».** Die Dokumentenliste startet minimal und wächst nur durch Antworten.
4. **Jedes Dokument wird genau einmal verlangt** – ausgelöst von genau einer Regel. Jedes bedingte Dokument zeigt seine Herkunft («weil: Baurecht = Ja»).
5. **Widerspricht ein hochgeladenes Dokument einer Antwort**, schlägt das System die Korrektur der Antwort vor, statt das Dokument abzulehnen.
6. **Keine Pflichtfeld-Sternchen.** Validierung beim Klick auf «Weiter».
7. Anrede «du», Sprache Deutsch (CH-Schreibweise, `CHF 449'000`).

---

## 2. Einstieg und Rollen

### 2.1 Startscreen

Zwei Einstiege:

| Wahl | Folge |
|---|---|
| **HYPOTEQ Berater** (Berater / Vertriebspartner) | Schritt 1 fragt zuerst die Berater-E-Mail, dann den Kontakt des Kunden. Sidebar: «Erfasst von {Name}». |
| **Kunde selbst** | Schritt 1 fragt nur den eigenen Kontakt (inkl. Telefon). Sidebar: «Eigene Anfrage». |

Die Wahl ist nur über «Zurück» zum Startscreen änderbar.

### 2.2 Partner-Erkennung (nur Berater-Einstieg)

- Eingabe: **nur E-Mail**. Kein Namensfeld.
- Abgleich gegen die Whitelist der aktiven VP-Berater (Excel-Sheet *VP-Berater (E-Mails)*, 316 Kontakte mit E-Mail) **und** HYPOTEQ-User (`@hypoteq.ch`, `@hypoteq.com`).
- **Treffer:** Karte mit Initialen, Name, Firma, Badge «Erkannt». Name kommt aus Salesforce (Kontakt), nicht aus der Adresse.
- **Kein Treffer** bei gültiger E-Mail: Box «Noch kein Partner?» → Button «Als Partner erfassen» öffnet: Vorname, Nachname, E-Mail (vorbefüllt), Telefon für Rückfragen, Firma. Die Anfrage läuft ohne Unterbruch weiter; HYPOTEQ prüft den neuen Partner nachträglich.
- Im Prototyp ist die Erkennung über Domains simuliert (`hypoteq.ch`, `vzch.ch`, `moneypark.ch` = bekannt). In der Umsetzung: exakter E-Mail-Abgleich gegen die Kontakt-Liste.

---

## 3. Funnel-Schritte und Fragen

Navigation: Fragepfad links (6 Themen, je mit «warum wir fragen» bzw. Zusammenfassung der Antwort), Buttons unten, Pfeile oben rechts, Tastatur ← →. Rechts die live wachsende Liste «Deine Unterlagen».

Legende: **Key** = interner Schlüssel im Prototyp (`state.ans.*` bzw. `state.txt.*` / `state.fin.*`). **Default** = Startwert. **Bedingung** = wann die Frage sichtbar ist.

### Schritt 1 · Allgemeines

| Feld | Key | Typ / Optionen | Default | Bedingung |
|---|---|---|---|---|
| Berater-E-Mail | `txt.bmail` | E-Mail | leer | Einstieg Berater |
| Neuer Partner: Vorname, Nachname, Telefon, Firma | `txt.pvor`, `txt.pnach`, `txt.ptel`, `txt.pfirma` | Text | leer | E-Mail nicht erkannt + «Als Partner erfassen» |
| Kreditantrag | `ans.antrag` | Karte: Neue Hypothek · Ablösung | – | immer |
| Kreditnehmer | `ans.kn` | Karte: Natürliche Person · Juristische Person | Natürliche Person | immer |
| Anrede | `ans.anrede` | Herr · Frau | – | immer (Salesforce braucht sie für Rechnungen) |
| Vorname, Nachname, E-Mail | `txt.vor`, `txt.nach`, `txt.mail` | Text / E-Mail | leer | immer |
| Telefon | – | Text | leer | nur Einstieg «Kunde selbst» |

### Schritt 2 · Objekt («Was finanzieren wir?»)

| Feld | Key | Optionen | Default | Bedingung |
|---|---|---|---|---|
| PLZ, Ort | `txt.plz`, `txt.ort` | Text | leer | immer |
| Art der Immobilie | `ans.immo` | Karte: Bestehende Immobilie · Neubau · Bauprojekt | – | immer |
| Liegen Grundbuchauszug und Gebäudeversicherungspolice bereits vor? | `ans.nbDocs` | Ja · Nein | Nein | nur Neubau |
| Art der Liegenschaft | `ans.lieg` | Karte: Einfamilienhaus · Stockwerkeigentum · Mehrfamilienhaus · Ferienobjekt | – | immer |
| Nutzung | `ans.nutz` | Selbstbewohnt · Vermietet · Zweitwohnsitz | – | immer |
| Heizungsart | `ans.heizung` | Wärmepumpe · Fernwärme · Holz/Pellets · Gas · Öl · Unbekannt | – | immer (Öko-Konditionen) |
| Ist die Liegenschaft im Baurecht? | `ans.baurecht` | Ja · Nein | Nein | immer |
| Bestehende Hypothek (CHF) | `fin.old` | Betrag | 0 | nur Ablösung |
| Soll die Hypothek erhöht werden? | `ans.aufstockung` | Ja · Nein | Nein | nur Ablösung |
| Gewünschte Erhöhung (CHF), Verwendungszweck | `fin.up`, Freitext | Betrag / Text | 0 / leer | Ablösung + Erhöhung = Ja |
| Kaufpreis (CHF) | – | Betrag | 0 | nur Neue Hypothek |
| Renovationen oder Mehrausgaben zum Kaufpreis? | `ans.reno` | Ja · Nein | Nein | nur Neue Hypothek |
| Ist die Liegenschaft bereits reserviert? | `ans.reserviert` | Ja · Nein | Nein | nur Neue Hypothek |
| Bestehen bereits Finanzierungsangebote? | `ans.angebote` | Ja · Nein | Nein | immer |

Bewusst **nicht** gefragt (kommt aus Dokumenten): Strasse, Baujahr, Zimmer, Bank, Produkt, Zinssatz, Ablösedatum.

### Schritt 3 · Personen («Wer finanziert?»)

| Feld | Key | Optionen | Default | Bedingung |
|---|---|---|---|---|
| Kreditnehmer 1: Vorname(n), Nachname | `txt.vor`, `txt.nach` (mit Schritt 1 verknüpft) | Text | – | natürliche Person |
| Bruttoeinkommen pro Jahr | `fin.inc` | Betrag | 0 | natürliche Person |
| Beschäftigung | `ans.job` | Angestellt · Selbständig · Pensioniert | – | natürliche Person |
| Pensionskasse vorhanden? | `ans.pkSe` | Ja · Nein | Nein | nur Selbständig |
| Ist ein Kreditnehmer 50 Jahre oder älter? | `ans.ab50` | Ja · Nein | Nein | natürliche Person |
| Gibt es Kinder? | `ans.kinder` | Ja · Nein | Nein | natürliche Person |
| Werden Unterhaltszahlungen geleistet? | `ans.unterhalt` | Ja · Nein | Nein | Kinder = Ja |
| Firma, zeichnungsberechtigte Person | – | Text | – | juristische Person (ersetzt den Kreditnehmer-Block) |
| Gibt es laufende Privatkredite? | `ans.kredite` | Ja · Nein | Nein | immer |
| Gibt es Leasings? | `ans.leasing` | Ja · Nein | Nein | immer |
| Braucht es eine Solidarbürgschaft? | `ans.buerge` | Ja · Nein | Nein | immer |
| Solidarbürge: Vorname Name | – | Text | – | Bürgschaft = Ja (dient der Zuordnung seiner Dokumente) |
| Kreditnehmer hinzufügen | – | bis 6 Personen | – | – |

Bewusst **nicht** gefragt: Geburtsdatum, Nationalität, Adresse, Arbeitgeber, Zivilstand, Namen der Kinder.

### Schritt 4 · Finanzierung

| Feld | Key | Optionen | Default | Bedingung |
|---|---|---|---|---|
| Geschätzter Objektwert (CHF) | `fin.val` | Betrag | 0 | immer |
| Bruttoeinkommen Haushalt | `fin.inc` | aus Schritt 3 übernommen | – | immer |
| Gewünschte Laufzeit | `ans.laufzeit` | SARON · 2 · 3 · 5 · 10 Jahre · Mix | – | immer |
| Vorsorgeguthaben Säule 3a vorhanden? | `ans.s3a` | Ja · Nein | Nein | immer |
| Eigenmittel über … Schenkung | `ans.schenkung` | Ja · Nein | Nein | immer |
| … Erbschaft / Erbvorbezug | `ans.erbe` | Ja · Nein | Nein | immer |
| … Darlehen | `ans.darlehen` | Ja · Nein | Nein | immer |
| … Pensionskasse (Vorbezug oder Verpfändung) | `ans.pk` | Ja · Nein | Nein | immer |
| Kommentare | Freitext | – | leer | immer |

Live-Berechnung (dunkle Karte):

- **Gesamtfinanzierung** = Ablösung: `old + (Erhöhung ? up : 0)` · Kauf: `Objektwert × 80 %`
- **Belehnung** = Gesamtfinanzierung / Objektwert · Grenze 80 %
- **Tragbarkeit** = (Gesamtfinanzierung × 5 % + max(Gesamtfinanzierung − ⅔ Objektwert, 0) / 15 + Objektwert × 1 %) / Einkommen · Grenze 33 %
- Urteil: «Finanzierung möglich» (beide Grenzen eingehalten) · «Prüfung nötig» · «Angaben ergänzen» (Werte fehlen)

### Schritt 5 · Unterlagen

Siehe Kapitel 4 und 5.

### Schritt 6 · Abschluss

- Kennzahlen: Gesamtfinanzierung, Belehnung, Tragbarkeit, Unterlagen (erfüllt / total).
- **Hinweise an die Bank:** automatisch aus den Dokumenten (veralteter Grundbuchauszug, Privatkredit, Leasing, verpfändete 3a-Police – jeweils mit der Notiz aus der Extraktion).
- Prüfliste: Antrag, Objekt, Kreditnehmer, Tragbarkeit/Belehnung, Unterlagen, «Aus Dokumenten übernommen: N Angaben».
- Aktionen: **Finanzierungsanfrage abschliessen** und **Fall-Dossier als PDF**. Es gibt kein separates «Absenden».
- Nach dem Abschluss: **Neuen Antrag stellen** (Funnel leer) oder **Abschliessen** (Redirect auf hypoteq.ch).

---

## 4. Dokumentenlogik

Die Liste wird bei jeder Antwort neu berechnet (`reqList()` im Prototyp). Gruppen: **Zum Objekt · Bestehende Hypothek · Zur Person · Eigenmittel & Vorsorge**. Juristische und natürliche Personen teilen sich denselben Objekt-Block.

### 4.1 Regeln

| # | Dokument | Gruppe | Regel |
|---|---|---|---|
| O1 | Fotos der Immobilie (innen und aussen) | Objekt | immer, ausser Bauprojekt |
| O2 | Verkaufsdokumentation | Objekt | immer, ausser Bauprojekt · «Habe ich nicht» erlaubt |
| O3 | Bau- / Grundrisspläne inkl. Nettowohnfläche | Objekt | immer, ausser Bauprojekt |
| O4 | Aktueller Grundbuchauszug (max. 6 Monate) | Objekt | immer · bei Neubau nur wenn `nbDocs = Ja` |
| O5 | Aktuelle Gebäudeversicherungspolice (inkl. Kubatur) | Objekt | immer, ausser Bauprojekt · bei Neubau nur wenn `nbDocs = Ja` |
| O6 | Kaufvertrag (Entwurf oder Original) | Objekt | Neue Hypothek, ausser Bauprojekt |
| O7 | Reservationsvertrag | Objekt | Neue Hypothek + reserviert = Ja |
| O8 | Nachweis Reservationszahlung (Bankauszug) | Objekt | Neue Hypothek + reserviert = Ja |
| O9 | Baubewilligung | Objekt | Bauprojekt **oder** (Neue Hypothek + Renovation = Ja) |
| O10 | Projektpläne, Baubeschrieb und Werkvertrag inkl. Kostenzusammenzug und Kubatur | Objekt | wie O9 |
| O11 | Begründungsakt mit Wertquoten · Nutzungs- und Verwaltungsreglement | Objekt | Liegenschaft = Stockwerkeigentum |
| O12 | Angaben zum Erneuerungsfonds | Objekt | Liegenschaft = Stockwerkeigentum |
| O13 | Aktueller Mieterspiegel inkl. Mietzinsaufstellung | Objekt | Nutzung = Vermietet |
| O14 | Baurechtsvertrag | Objekt | Baurecht = Ja |
| O15 | Bestehende Finanzierungsangebote | Objekt | Angebote = Ja |
| H1 | Aktueller Hypothekarvertrag (Rahmenvertrag) | Hypothek | Ablösung |
| H2 | Sicherungsvereinbarung / Schuldbrief | Hypothek | Ablösung |
| H3 | Letzte Zinsabrechnung | Hypothek | Ablösung |
| P1 | HYPOTEQ Auskunftsermächtigung | Person | immer |
| P2 | Pass / Identitätskarte | Person | natürliche Person · pro Kreditnehmer |
| P3 | Lohnausweise der letzten 3 Jahre | Person | angestellt (oder Beschäftigung offen) · erwartet 3 Dateien |
| P4 | Letzte 3 Monatslohnabrechnungen | Person | wie P3 |
| P5 | Anstellungsvertrag | Person | wie P3 |
| P6 | Pensionskassenausweis | Person | angestellt · oder selbständig + `pkSe = Ja` |
| P7 | Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre | Person | selbständig |
| P8 | Rentenbescheinigung (PK, AHV) | Person | pensioniert |
| P9 | Aktuelle Steuererklärung | Person | natürliche Person |
| P10 | Rentenvorausberechnung (AHV) | Person | ab 50 = Ja und nicht pensioniert |
| P11 | Unterhaltsvereinbarung | Person | Kinder = Ja + Unterhalt = Ja |
| P12 | Kreditverträge (Privatkredite) | Person | Privatkredite = Ja |
| P13 | Leasingverträge | Person | Leasings = Ja |
| P14–16 | Solidarbürge: Pass / ID · aktuelle Steuererklärung · Lohnausweise 3 Jahre | Person | Solidarbürgschaft = Ja |
| J1 | Aktueller Handelsregisterauszug | Person | juristische Person |
| J2 | Pass / ID der zeichnungsberechtigten Person | Person | juristische Person |
| J3 | Jahresabschlüsse (Bilanz und Erfolgsrechnung) der letzten 3 Jahre | Person | juristische Person |
| J4 | Aktuelle Zwischenbilanz | Person | juristische Person · **optional** («Falls vorhanden») |
| J5 | Aktueller Betreibungsauszug | Person | juristische Person |
| J6 | Aktuelle Steuererklärung der Gesellschaft | Person | juristische Person |
| E1 | Aufstellung und Nachweis der Eigenmittel | Eigenmittel | immer |
| E2 | Säule 3a Bescheinigung | Eigenmittel | 3a = Ja **oder** (ab 50 = Ja, natürliche Person) |
| E3 | Vorsorgepolice 3a inkl. Wertmitteilung | Eigenmittel | wie E2 · erwartet 2 Dateien |
| E4 | Bestätigung PK-Vorbezug / Verpfändung | Eigenmittel | Pensionskasse = Ja |
| E5 | Schenkungsvertrag | Eigenmittel | Schenkung = Ja |
| E6 | Erbschaftsbestätigung | Eigenmittel | Erbschaft = Ja |
| E7 | Darlehensvertrag | Eigenmittel | Darlehen = Ja |

Fall Gerber: Zähler 13 → 16 (Ablösung) → 18 (STWE) → 21 (Unterhalt, Privatkredit, Leasing) → 23 (Säule 3a).

### 4.2 Zustände pro Anforderung

| Zustand | Bedeutung | Aktionen |
|---|---|---|
| Fehlt | nichts hochgeladen | Hochladen · bei optionalen Dokumenten «Habe ich nicht» |
| Wird gelesen | Analyse läuft | – |
| Teilweise | weniger Dateien als erwartet (z.B. 2 von 3 Lohnausweisen) | Hochladen |
| Erkannt | vollständig | Details (erkannte Felder, Abgleich), Dokument ansehen |
| Veraltet | z.B. Grundbuchauszug älter als 6 Monate | Aktuelles hochladen · Trotzdem verwenden |
| Nicht vorhanden | vom Nutzer als «habe ich nicht» markiert | Doch hochladen |

### 4.3 Dateien ausserhalb der Liste («Weitere Dateien»)

| Art | Beispiel Gerber | Verhalten |
|---|---|---|
| Überzählig | 4. Lohnausweis (2022), Steuererklärung Vorjahr | wird im Dossier mitgeführt, zählt nicht |
| Duplikat | Leasingvertrag zweimal | wird nicht doppelt gespeichert |
| Nicht benötigt | Steuerrechnungen, Nebenkosten-, Betriebskostenabrechnung, Entwürfe | ausgeblendet, kann entfernt werden |
| Nicht erkannt | unbekanntes Dokument | manuell zuordnen |

### 4.4 Antwort-Korrektur (Regel 5)

Wird ein Dokument erkannt, das zu einer «Nein»-Antwort gehört, erscheint ein Vorschlag statt eines Fehlers:

| Erkannt | Antwort steht auf | Vorschlag |
|---|---|---|
| Kreditvertrag / Leasingvertrag | Privatkredite / Leasings = Nein | auf Ja setzen, Dokument zuordnen |
| Unterhaltsvereinbarung | Kinder / Unterhalt = Nein | beide auf Ja setzen |
| Säule-3a-Unterlagen | 3a = Nein | auf Ja setzen |
| STWE-Unterlagen | Liegenschaft ≠ STWE | Art der Liegenschaft anpassen |

---

## 5. Dokumenten-Erkennung und Extraktion

- Upload: eine Drop-Zone für Dateien und ganze Ordner (PDF, JPG, PNG). Keine manuelle Zuordnung durch den Nutzer.
- Pro Datei: Klassifikation → Zuordnung zur Anforderung → Extraktion der Felder mit Konfidenz → Abgleich mit Funnel-Angaben.
- Konfidenz: Kunde/Berater sehen «Erkannt / Prüfen»; die interne Rolle sieht Prozentwerte und den Audit Trail pro Dokument.
- Abgleich-Beispiele: Bruttoeinkommen (Funnel CHF 125'000 / Lohnausweis CHF 125'385 → ok), Bestehende Hypothek, Ablösedatum, Baujahr.
- Der Prototyp verwendet für den Fall Gerber vorbereitete Extrakte (`data/gerber.js`), damit die Demo deterministisch läuft. Für die Umsetzung definiert `REQ[].fields` pro Dokumenttyp die zu extrahierenden Felder.

### 5.1 Automatische Umbenennung

Jede erkannte Datei bekommt einen einheitlichen Namen. Die AI schlägt ihn vor, er steht in den Dokumentdetails unter «Wird gespeichert als» neben dem Originalnamen. Umbenannt wird beim Abschluss, bevor die Datei im Fall-Ordner (`SharePoint_Doc__c`) abgelegt wird.

**Schema:** `{Fallnummer}_{Gruppe}_{Dokumenttyp}_{Person}_{Datum}_{Nr}.{Endung}`

| Teil | Regel |
|---|---|
| Fallnummer | z.B. `HQ-26-06-156283` |
| Gruppe | `01` Person · `02` Hypothek · `03` Objekt · `04` Eigenmittel – damit sortiert sich der Ordner von selbst |
| Dokumenttyp | fester deutscher Kurzname pro Anforderung (z.B. `Grundbuchauszug`, `Lohnausweis`), unabhängig von der Funnel-Sprache |
| Person | `Nachname-Vorname` bei Personendokumenten (Kreditnehmer, Solidarbürge); bei Hypothek-Dokumenten die Bank; bei Objekt-Dokumenten leer |
| Datum | Dokumentdatum aus der Extraktion (`JJJJ-MM-TT` oder `JJJJ`), nicht das Upload-Datum. Bei Ausweisen kein Datum (Geburtsdatum ist kein Dokumentdatum) |
| Nr | nur bei mehreren Dateien pro Anforderung (`1`, `2`, `3`) |
| Endung | unverändert, klein geschrieben |

Weitere Regeln:

- Umlaute und Sonderzeichen werden ersetzt (ä → a, é → e), Leerzeichen entfallen.
- Überzählige Dateien bekommen `_ZUSATZ_`, Duplikate `_DUPLIKAT_` nach der Gruppe. Nicht benötigte Dateien werden nicht abgelegt, ausser der Nutzer behält sie.
- Berater und interne Rolle können den Namen vor dem Abschluss ändern. Kunden sehen ihn nur.
- Der Originalname bleibt im Audit Trail und im JSON (`files[].originalName`) erhalten.
- Das Fall-Dossier und sein Annex verwenden die neuen Namen.

Beispiele Fall Gerber:

| Original | Gespeichert als |
|---|---|
| `03_Grundbuchauszug_Etzelstrasse_52_Waedenswil_2026_01_15.pdf` | `HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf` |
| `01_Lohnausweis_Gary_Gerber_2024_Etzel_Liegenschaften_AG.pdf` | `HQ-26-06-156283_01_Lohnausweis_Gerber-Gary_2024_2.pdf` |
| `03_Hypothek_Zinsabrechnung_ZKB_Gary_Gerber.pdf` | `HQ-26-06-156283_02_Zinsabrechnung_ZKB_2026-03-30.pdf` |
| `01_ID_Gary_Gerber.pdf` | `HQ-26-06-156283_01_ID_Gerber-Gary.pdf` (ohne Datum – Geburtsdatum ist kein Dokumentdatum) |


---

## 6. Salesforce-Mapping (Vorschlag)

> **Wichtig:** Das bestehende Mapping bleibt gültig. Dieser Vorschlag ersetzt es nicht. Er ist aus dem Feldkatalog vom 04.10.2026 abgeleitet und soll den Abgleich vereinfachen: Wo das bestehende Mapping etwas anderes vorsieht, gilt das bestehende. Die CSV-Datei hat dafür die Spalte **«Abgleich bestehendes Mapping»** zum Ausfüllen.

### 6.1 Rahmen (aus den Lesehinweisen des Feldkatalogs)

- Der Funnel schreibt primär auf den **Case**, `Origin = Web`.
- Die Opportunity entsteht automatisch bei `Case.Status = Qualifiziert` und übernimmt Name, Client, Hypothekarbetrag, Kaufpreis, Kundenberater, Sales Partner, Korrespondenzsprache. → **Keine Opportunity-Felder aus dem Funnel schreiben.**
- `Opportunity.Amount` und `Purchase price` nie direkt mappen.
- Endkunden sind **Person Accounts**; Personenfelder gehören auf den Kunden.
- Formel- und Systemfelder (Befüllbar = Nein) nicht mappen.

### 6.2 Pflichtfelder beim Erstellen des Case

| Feld | API | Vorschlag |
|---|---|---|
| Case Name | `Case_Name__c` (Text 50) | `{Nachname} {Vorname} – {PLZ} {Ort}` → «Gerber Gary – 8820 Wädenswil» |
| Owner | `OwnerId` | Default-Queue «Web-Anfragen»; bei Login mit HYPOTEQ-User dieser User |
| Status | `Status` | `New` (Qualifizierung macht HYPOTEQ manuell) |
| Origin | `Origin` | `Web` |

### 6.3 Einstieg und Partner

| Funnel | Salesforce | Logik |
|---|---|---|
| Berater-E-Mail erkannt (VP-Kontakt) | `Case.Partner_Consultant__c` (Lookup Contact) | Kontakt-ID aus Sheet *VP-Berater* |
| … zugehöriger Vertriebspartner | `Case.Account__c` (Sales Partner) | Account des Kontakts |
| Berater-E-Mail = HYPOTEQ-User | `Case.OwnerId` | User per E-Mail |
| Einreicher (Partner oder Kunde) | `Case.SuppliedName`, `SuppliedEmail`, `SuppliedPhone`, `SuppliedCompany` | Standard-Web-to-Case-Felder, kein neues Feld nötig |
| Neuer, unbekannter Partner | `Supplied*` + Vermerk in `Case.Comments`: «Neuer Partner – bitte prüfen und anlegen» | Partner-Lookups bleiben leer |

### 6.4 Antrag und Kunde

| Funnel | Salesforce | Werte-Mapping / Hinweis |
|---|---|---|
| Kreditantrag | `Case.Reason` | Neue Hypothek → `Neue Hypothek` · Ablösung → `Ablösung` |
| Kreditnehmer | `Case.Kreditnehmer__c` | Natürliche Person → `Natürliche Person` · Juristische Person → `Juristische Personen` (Plural in SF) |
| Anrede | `PersonAccount.Salutation` | Herr → `Mr.` · Frau → `Mrs.` |
| Vorname / Nachname | `PersonAccount.FirstName` / `LastName` | – |
| E-Mail Kunde | `PersonAccount.PersonEmail` | – |
| Telefon Kunde | `PersonAccount.PersonMobilePhone` | – |
| Rolle | `PersonAccount.Rolle__pc` | `Endkunde` |
| Kunde ↔ Case | `Case.Client__c` | Person Account (neu oder per E-Mail gefunden) |
| Weitere Kreditnehmer | `Case.Client_2__c`, `Client_3__c`, `Wie_viele_Kunden__c` | SF erlaubt 3, Funnel 6 → siehe offene Punkte |
| Korrespondenzsprache | `Case.Korrespondenzsprache__c`, `PersonAccount.Korrespondenzsprache__pc` | aus Browsersprache, Default `Deutsch` – keine Frage |
| Juristische Person: Firma | Business Account `Name` + `Case.Client__c` | – |

### 6.5 Objekt

| Funnel | Salesforce | Werte-Mapping / Hinweis |
|---|---|---|
| PLZ, Ort | `Case.PLZ_Ort__c` («8820 Wädenswil»), `Case.City__c` (Ort) | `PLZ_Ort__c` ist Text 30 |
| Kanton | `Case.Kantone__c` | aus PLZ ableiten (z.B. `Canton of Zurich`) |
| Art der Immobilie | `Case.Art_der_Immobilie__c` + `Case.If_Neubau__c` | Bestehende → `Bestehende Immobilie` · Neubau → `Neubau` + `Bereits erstellt` · Bauprojekt → `Neubau` + `Bauprojekt` |
| Art der Liegenschaft | `Case.Art_der_Liegenschaft__c` | EFH → `Einfamilienhaus` · STWE → `Wohnung` · MFH → `Mehrfamilienhaus` · Ferienobjekt → **kein Wert** (siehe offene Punkte) |
| Nutzung | `Case.Nutzung_der_Immobilie__c` | Selbstbewohnt → `Selbstbewohnt` · Vermietet → `Rendite-Immobilie` · Zweitwohnsitz → `Zweitwohnsitz` |
| Heizungsart | `Case.Waermeerzeugung__c` (NEU) | Wärmepumpe → `Wärmepumpe Luft-Wasser`* · Fernwärme → `Fernwärme` · Holz/Pellets → `Holz` · Gas → `Gas Erdgas` · Öl → `Öl` · Unbekannt → leer |
| Baurecht | `Case.Objekt_im_Baurecht__c` (NEU, Checkbox) | Ja → true |
| Bestehende Hypothek | `Case.Hypothekarvolumen__c` (Ablösebetrag) | – |
| Erhöhung Ja/Nein | `Case.Hypothekarbetrag__c` (Checkbox «Erhöhung der Hypothek?») | – |
| Erhöhung Betrag | `Case.Erh_hung_betrag__c` | `Erh_hung__c` existiert ebenfalls → klären, welches aktiv ist |
| Verwendungszweck | `Case.Kommentar__c` (Präfix «Verwendungszweck:») | – |
| Kaufpreis | `Case.Kaufpreis__c` | synchronisiert auf Opportunity |
| Renovationen | `Case.Gibt_es_Renovationen_oder_Zusatzkosten__c` | – |
| Reserviert | `Case.Ist_die_Liegenschaft_bereits_reserviert__c` | – |
| Finanzierungsangebote | `Case.Bestehen_bereits_Finanzierungsangebote__c` | – |
| Neubau: GB/GVZ vorhanden | kein Feld → `Case.Dokumenten_Check_State__c` (JSON) | nur für die Dokumentenlogik |

\* Für eine saubere Zuordnung die Funnel-Option «Wärmepumpe» in «Wärmepumpe Luft-Wasser» und «Wärmepumpe Wasser-Wasser» teilen – oder den genauen Typ aus dem Dokument lesen.

### 6.6 Person

| Funnel | Salesforce | Werte-Mapping / Hinweis |
|---|---|---|
| Bruttoeinkommen | `Case.Einkommen__c` | – |
| Beschäftigung | `Case.If_nat_rliche_person__c` (Erwerbsstatus) | Angestellt → `Angestellt` · Selbständig → `Selbständig` · Pensioniert → `Rentner` |
| Privatkredite / Leasings | `PersonAccount.Verbindlichkeiten_z_B_Leasing__c` (Text 30) | z.B. «Privatkredit; Leasing» – Beträge aus den Dokumenten in `Dokumenten_Check_State__c` |
| PK vorhanden (selbständig), ab 50, Kinder, Unterhalt, Solidarbürgschaft | kein Feld → `Case.Dokumenten_Check_State__c` (JSON, Block `answers`) | Vorschlag neue Felder siehe 6.10 |

### 6.7 Finanzierung und Eigenmittel

| Funnel | Salesforce | Werte-Mapping / Hinweis |
|---|---|---|
| Gesamtfinanzierung (berechnet) | `Case.Gesch_tzter_Hypothekenbedarf__c` | wird zum Opportunity-Hypothekarbetrag |
| Tragbarkeit (berechnet) | `Case.Tragbarkeit__c` (Prozent) | – |
| Belehnung (berechnet) | kein Feld | nur Anzeige · optional `EigenmittelProzent__c` = 100 − Belehnung |
| Geschätzter Objektwert | **kein passendes Feld** | siehe offene Punkte |
| Laufzeit | `Case.Hypothekarlaufzeiten__c` | SARON → `Saron` · 2/3/5/10 Jahre → `2 Jahre` … · Mix → `Mix` |
| Säule 3a | `Case.X3_Saeule__c` (Währung) | Betrag aus 3a-Bescheinigung (Extraktion) |
| Pensionskasse | `Case.PK_Betrag__c` + `Case.Verpf_ndung_PK__c` (Ja/Nein) | Betrag aus PK-Ausweis; Verpfändung aus Bestätigung |
| Schenkung / Erbschaft | `Case.Schenkung_usw__c` (Währung) | Betrag aus Vertrag/Bestätigung; beide teilen sich das Feld |
| Darlehen | kein Feld → `Dokumenten_Check_State__c` | Vorschlag siehe 6.10 |
| Eigenmittel total | `Case.Eigenmittel_Total__c` | aus «Aufstellung und Nachweis der Eigenmittel» |
| Kommentare | `Case.Kommentar__c` (1140 Zeichen) | Verwendungszweck voranstellen |

### 6.8 Aus Dokumenten (Extraktion → Salesforce)

| Dokument | Feld | Salesforce |
|---|---|---|
| ID | Geburtsdatum | `PersonAccount.PersonBirthdate` (Standard bevorzugt vor `Geburtsdatum__c`) |
| ID | Nationalität | `PersonAccount.Nationalitaet__c` |
| Steuererklärung | Zivilstand | `PersonAccount.Zivilstand__c` |
| Steuererklärung / ID | Wohnadresse | `PersonAccount.BillingStreet`, `BillingPostalCode`, `BillingCity` (erscheint auf Rechnungen) |
| Grundbuchauszug | Strasse Nr. des Objekts | `Case.Adresse__c` |
| Grundbuchauszug | Wertquote | `Case.Wertquote__c` (NEU) |
| GVZ-Police / Verkaufsdoku | Baujahr | `Case.Baujahr__c` |
| GVZ-Police | Kubatur | `Case.Kubatur__c` |
| Verkaufsdoku / Pläne | Zimmer, Wohnfläche, Stockwerk | `Anzahl_Zimmer__c`, `Wohnfl_che_m2__c`, `Stockwerk__c` |
| Verkaufsdoku | Energie-Zertifikat, Wärmeerzeugung | `Energie_Zertifizierung__c`, `Waermeerzeugung__c` (falls im Funnel «Unbekannt») |
| Zinsabrechnung | Bank, Zinssatz, Laufzeit, Ablösedatum | `Bank__c`, `Zins__c`, `Laufzeit__c`, `Abl_sedatum__c` |

### 6.9 Dokument-Status

| Anforderung | Checkbox auf dem Case |
|---|---|
| P2 Pass / ID | `Dok_Identitaetsdokument__c` |
| P3 Lohnausweise | `Dok_Lohnausweis__c` |
| P6 Pensionskassenausweis | `Dok_Pensionskassenausweis__c` |
| P9 Steuererklärung | `Dok_Steuererklaerung__c` |
| O1 Fotos | `Dok_Fotos_der_Immobilie__c` |
| O3 Grundrisspläne | `Dok_Grundrissplaene__c` |
| O4 Grundbuchauszug | `Dok_Grundbuchauszug__c` (nur wenn nicht veraltet) |
| O5 Gebäudeversicherung | `Dok_Gebaeudeversicherungsausweis__c` |
| O6 Kaufvertrag | `Dok_Kaufvertrag__c` |
| J5 Betreibungsauszug | `Dok_Betreibungsregisterauszug__c` |
| alle Pflicht-Anforderungen erfüllt | `Documents_completed__c` |
| komplette Checkliste | `Dokumenten_Check_State__c` (JSON, siehe 6.11) |
| Ablageort der Dateien | `SharePoint_Doc__c` (URL des Fall-Ordners) |

Alle übrigen Anforderungen haben keine eigene Checkbox. Ihr Status steht vollständig im JSON.

### 6.10 Vorschlag neue Felder (nur falls gewünscht)

Ohne neue Felder funktioniert alles über `Dokumenten_Check_State__c`. Für Reports und Bankanfragen wären diese Felder nützlich:

| Vorschlag | Typ | Grund |
|---|---|---|
| `Case.Unterhaltspflicht__c` | Checkbox | tragbarkeitsrelevant |
| `Case.Privatkredit__c` | Checkbox | ZEK-relevant; im Fall Gerber hätte das den 5-Wochen-Umweg vermieden |
| `Case.Leasing__c` | Checkbox | heute nur als Text auf dem Person Account |
| `Case.Solidarbuergschaft__c` | Checkbox | – |
| `Case.Darlehen_Eigenmittel__c` | Währung | Eigenmittelquelle ohne eigenes Feld |
| `Case.Geschaetzter_Objektwert__c` | Währung | Basis für Belehnung bei Ablösung |

### 6.11 Struktur `Dokumenten_Check_State__c` (JSON)

```json
{
  "version": 1,
  "updatedAt": "2026-10-05T14:12:00+02:00",
  "answers": { "antrag": "Ablösung", "kn": "Natürliche Person", "immo": "Bestehende Immobilie",
               "lieg": "Stockwerkeigentum", "nutz": "Selbstbewohnt", "baurecht": "Nein",
               "kinder": "Ja", "unterhalt": "Ja", "kredite": "Ja", "leasing": "Ja", "buerge": "Nein",
               "ab50": "Nein", "pkSe": "Nein", "nbDocs": "Nein",
               "s3a": "Ja", "pk": "Nein", "schenkung": "Nein", "erbe": "Nein", "darlehen": "Nein" },
  "requirements": [
    { "id": "grundbuch", "label": "Aktueller Grundbuchauszug (max. 6 Monate)", "group": "objekt",
      "reason": "Pflicht", "status": "outdated",
      "files": [ { "originalName": "03_Grundbuchauszug_..._2026_01_15.pdf", "storedName": "HQ-26-06-156283_03_Grundbuchauszug_2026-01-15.pdf", "url": "https://…sharepoint…", "confidence": 0.97 } ],
      "fields": [ { "key": "Eigentümer", "value": "Gary Samuel Gerber", "confidence": 0.97 } ],
      "audit": [ { "ts": "05.10.2026 14:03", "text": "Erkannt als «Grundbuchauszug» · Konfidenz 97 %" } ] }
  ],
  "extras": [ { "name": "01_Lohnausweis_Gary_Gerber_2022.pdf", "kind": "surplus" } ],
  "hints": [ { "title": "Kreditverträge (Privatkredite)", "text": "Wird mit der Erhöhung abgelöst …" } ]
}
```

`status`: `missing | partial | ok | outdated | skipped`. `kind`: `surplus | duplicate | notneeded | unknown`.

---

## 7. Mehrsprachigkeit (DE · EN · FR · IT)

- **Sprachen:** Deutsch (Standard und Fallback), Englisch, Französisch, Italienisch. Alle Texte stehen in `HYPOTEQ_Funnel_i18n.json`.
- **Sprachwahl:** automatisch aus der Browsersprache bzw. der URL (`/de`, `/en`, `/fr`, `/it`), umschaltbar oben rechts. Die Wahl wird gespeichert.
- **Anrede:** DE «du», EN «you», FR «vous», IT «Lei». In der Romandie und im Tessin ist «tu» bei Finanzthemen unüblich. Für ein durchgehendes «du» müssten FR und IT angepasst werden.
- **Platzhalter:** `{name}`, `{n}`, `{total}` usw. werden zur Laufzeit ersetzt. Die Reihenfolge darf je Sprache abweichen.
- **Zahlen:** in allen Sprachen Schweizer Format `CHF 449'000` und `44.8 %`. Datum `TT.MM.JJJJ`.
- **Auswahlwerte:** Die Keys bleiben deutsch (`opt.lieg.Stockwerkeigentum`). Nur die Anzeige wird übersetzt. In Salesforce wird immer der deutsche Wert bzw. das Werte-Mapping aus Kapitel 6 geschrieben, unabhängig von der Anzeigesprache.
- **Korrespondenzsprache:** Die Funnel-Sprache wird nach `Case.Korrespondenzsprache__c` und `PersonAccount.Korrespondenzsprache__pc` geschrieben: de → `Deutsch`, en → `Englisch`, fr → `Französisch`, it → `Italienisch`.
- **Dokumentenerkennung:** Die Erkennung muss Dokumente in allen vier Landessprachen lesen (z.B. «Extrait du registre foncier», «Estratto del registro fondiario»). Die Anforderungen selbst sind sprachunabhängig (`REQ.id`).
- **Fachbegriffe:** Die Begriffe folgen der Schweizer Rechtssprache: PPE/PPP für Stockwerkeigentum, LPP für die Pensionskasse, AVS für die AHV, droit de superficie / diritto di superficie für das Baurecht. Bitte vor dem Go-live von einer muttersprachlichen Fachperson gegenlesen lassen (Spalte «Review» in der CSV).

## 8. Offene Punkte

1. **Ferienobjekt** hat keinen Wert in `Art_der_Liegenschaft__c`. Vorschlag: Option streichen (Ferienobjekt = Nutzung «Zweitwohnsitz») und dafür `Bauland` / `Gewerbe` aus Salesforce anbieten.
2. **Nutzung:** Salesforce kennt zusätzlich «Vermietet & teilweise selbstbewohnt» und «Für eigenes Geschäft». Ins Funnel aufnehmen? Beide würden den Mieterspiegel auslösen.
3. **Geschätzter Objektwert** (v.a. bei Ablösung) hat kein Feld. Neues Feld oder bestehendes umwidmen?
4. **Erhöhung:** `Erh_hung__c` und `Erh_hung_betrag__c` existieren beide. Welches ist aktiv?
5. **Kreditnehmer:** Funnel erlaubt 6, der Case 3 (`Client__c` … `Client_3__c`). Auf 3 begrenzen oder weitere über Account-Kontakt-Beziehungen?
6. **Wärmepumpe** im Funnel aufteilen (Luft-Wasser / Wasser-Wasser) oder aus dem Dokument lesen?
7. **Partner-Whitelist:** täglicher Export aus Salesforce oder Live-Abfrage? Ehemalige Partner (326) bleiben ausgeschlossen.
8. **Neue Felder** aus 6.10 gewünscht oder reicht `Dokumenten_Check_State__c`?
9. **Anrede in FR/IT:** «vous»/«Lei» (Vorschlag) oder durchgehend «tu»/«tu» wie im Deutschen?
10. **Bestätigungs-E-Mail und Fall-Dossier:** in der Funnel-Sprache oder immer in der Korrespondenzsprache des Kunden?
