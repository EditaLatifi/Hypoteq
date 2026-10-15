# HYPOTEQ Finanzierungsfunnel – Handover an Edita

Stand: 14.10.2026 · Referenz-Prototyp: `HYPOTEQ_Funnel_Prototyp.html` (= *HYPOTEQ Funnel v5*) · Demo-Fall: Gary Gerber, 8820 Wädenswil

Dieses Dokument ist die verbindliche Grundlage für die Umsetzung. Es ersetzt die Funnel- und Dokumentenlogik aus `HYPOTEQ_Funnel_Spezifikation.md` (v1). Aus v1 gelten weiter: Partner-Erkennung, Dokument-Zustände, Umbenennung (Kap. 5.1), Mehrsprachigkeit (Kap. 7) und das JSON-Schema `Dokumenten_Check_State__c` (Kap. 6.11).

Grundlage dieser Version: Feedback Rosanna Mancina (E-Mail), Dokumenten-Regeln-Excel (Feedback-Runde Sept. 2026), Entscheide Fisnik Salihu. Final freigegeben durch Marco Circelli.

---

## 0. Was sich gegenüber v1 ändert

| Bereich | Neu |
|---|---|
| Einstieg | Zwei Wege: **Schnellanmeldung** (Unterlagen zuerst) und **Begleitete Anmeldung** (Schritt für Schritt) |
| Schritte | Begleitet: 6 → **4** · Schnell: **6** (Kontakt, Upload, dann dieselben 4 Schritte vorausgefüllt) |
| Fragen | Ja/Nein-Zusatzfragen zu **einer Chip-Frage** gebündelt · «Kinder», «ab 50», «Heizungsart» nicht mehr gefragt |
| Eigenmittel | Statt Ja/Nein: **Betragstabelle** – jeder Betrag fordert sein Dokument an (stand so schon im Excel) |
| Rechnung | Hypothekarbedarf aus **Kaufpreis**, nicht aus Objektwert · Eigenmittel fliessen ein |
| Dokumente | Anstellungsvertrag, ältere Lohnausweise, Schuldbrief, Rahmenvertrag, Eigenmittelnachweis bei Ablösung, Pläne bei Renovation **entfallen oder nur noch bedingt** |
| Auskunftsermächtigung | Im Abschluss: **Vorlage herunterladen → unterzeichnen → hochladen** (DocuSign folgt später) |
| E-Mail | **Eine** Bestätigungsmail, neu strukturiert, nur zutreffende Blöcke |
| Fortschritt | «Schritt 2 von 4 · noch ca. 2:30 Min.» |

**Grundsatz:** Weniger fragen heisst nicht weniger Daten. Alles, was aus den Dokumenten gelesen wird, geht in die Bestätigungsmail und nach Salesforce – mit Herkunft «aus Dokument».

---

## 1. Startscreen

- Oben Umschalter **HYPOTEQ Berater | Kunde selbst**.
- Darunter zwei Karten:
  - **Schnellanmeldung** – «Ich habe die Unterlagen schon. Erst hochladen – danach ist die Anfrage grösstenteils ausgefüllt.» · ca. 3 Minuten · vieles vorausgefüllt
  - **Begleitete Anmeldung** – «Ein paar Fragen. Wir sagen dir sofort, welche Unterlagen es braucht.» · ca. 3 Minuten
- Vorauswahl («Empfohlen», lime): Berater → Schnell · Kunde → Begleitet.
- Wechsel jederzeit über den Link in der Sidebar («Lieber Schritt für Schritt» / «Unterlagen schon bereit? Zur Schnellanmeldung»). Alle Daten bleiben erhalten.

**Wichtig für die Umsetzung:** Beide Wege sind **ein Funnel mit einem Datenmodell, einer Dokumentenlogik, einer Mail und einem Salesforce-Mapping**. Nur Reihenfolge und Vorbefüllung unterscheiden sich.

---

## 2. Begleitete Anmeldung (4 Schritte)

Zeitanzeige: 3:00 → 2:30 → 2:00 → 1:30.

### Schritt 1 · Anfrage

| Feld | Bedingung | Hinweis |
|---|---|---|
| Berater-E-Mail (+ Partner-Erkennung, «Noch kein Partner?») | Einstieg Berater | wie v1 |
| Kreditantrag: Neue Hypothek · Ablösung | immer | Karte, springt automatisch zur nächsten Frage |
| Kreditnehmer: Natürliche · Juristische Person | immer | Karte |
| Anrede Herr · Frau, Vorname, Nachname | natürliche Person | |
| **Firma gemäss Handelsregister, zeichnungsberechtigte Person** | juristische Person | ersetzt Anrede/Name – Bug aus Rosannas Test: Firma blieb in der Mail leer |
| E-Mail, Telefon | immer | **Telefon jetzt in beiden Rollen** (Bug: bei juristischer Person leer) |

### Schritt 2 · Objekt & Finanzierung

| Feld | Bedingung | Regel |
|---|---|---|
| PLZ, Ort | immer | beide als Eingabe |
| Art der Immobilie: Bestehende Immobilie · Neubau · Bauprojekt | immer | **Bei Ablösung ist «Bauprojekt» deaktiviert** (Hinweis wird angezeigt). Wird nachträglich auf Ablösung gewechselt, wird «Bauprojekt» zurückgesetzt. |
| GB-Auszug und GVZ-Police vorhanden? | nur Neubau | wie v1 |
| Art der Liegenschaft: EFH · STWE · MFH | immer | «Ferienobjekt» entfällt (kein SF-Wert; Ferienwohnung = Nutzung Zweitwohnsitz) |
| Nutzung | immer | **Natürliche Person:** Selbstbewohnt · Vermietet · Zweitwohnsitz · **Juristische Person:** Vermietet · Gewerbe |
| **Jährlicher Netto-Mietertrag** | Nutzung = Vermietet | nicht bei Gewerbe |
| Ablösung-Block: bestehende Hypothek · Erhöhung Ja/Nein · Betrag · Verwendungszweck | Ablösung | |
| Kauf-Block: **Kaufpreis · Kaufdatum** · Renovation Ja/Nein · **Renovationsbetrag** · reserviert Ja/Nein | Neue Hypothek | Renovationsbetrag zählt zur Gesamtfinanzierung |
| Geschätzter Objektwert | nach Antrag | Bei Kauf leer = Kaufpreis (Platzhalter zeigt den Kaufpreis). Nur ändern, wenn er abweicht. |
| **Eigenmittel – Aufteilung** (Kauf) | Neue Hypothek | Ersparnisse · Säule 3a · PK-Vorbezug · PK-Verpfändung · Schenkung · Erbvorbezug · Darlehen |
| **Vorsorge** (Ablösung) | Ablösung | Säule 3a · PK-Verpfändung |
| Weitere Angaben (optional, eingeklappt) | immer | Laufzeit, Kommentar |

Unter den Eigenmitteln: «Eigenmittel total CHF … · x % · davon hart CHF …». Hinweis, wenn harte Eigenmittel < 10 % des Kaufpreises.

Live-Berechnung (dunkle Karte) erscheint ab Schritt 2, siehe Kap. 5.

### Schritt 3 · Personen

| Feld | Bedingung |
|---|---|
| Kreditnehmer 1: Vorname(n), Nachname, Bruttoeinkommen, Beschäftigung (Angestellt · Selbständig · Pensioniert) | natürliche Person |
| Pensionskasse vorhanden? | selbständig |
| **Kreditnehmer 2** (Vorname, Nachname, Einkommen) | **nur wenn «+ Kreditnehmer hinzufügen» geklickt** – Bug: KN 2 erschien in der Mail auch ohne Erfassung |
| Firma, zeichnungsberechtigte Person | juristische Person (aus Schritt 1 übernommen) |
| **«Trifft etwas davon zu?»** – Chips, Mehrfachauswahl | immer |
| Solidarbürge: Vorname Name | Chip Solidarbürgschaft aktiv |

Chips (nichts angetippt = trifft nicht zu):

| Chip | Key | Dokument | Nur bei |
|---|---|---|---|
| Unterhaltszahlungen | `unterhalt` | Unterhaltsvereinbarung | natürliche Person |
| Privatkredit | `kredite` | Kreditverträge | |
| Leasing | `leasing` | Leasingverträge | |
| Solidarbürgschaft | `buerge` | Bürge: ID, Steuererklärung, Lohnausweis | |
| Liegenschaft im Baurecht | `baurecht` | Baurechtsvertrag | |
| Bestehende Finanzierungsangebote | `angebote` | Angebote | |
| Interesse an Steueroptimierung | `steuer` | – | |

Jeder Chip zeigt, wie viele Unterlagen er auslöst (z.B. «+3»).

### Schritt 4 · Unterlagen & Abschluss

Upload (Kap. 4), darunter Abschluss mit Kennzahlen, Hinweisen an die Bank, Prüfliste, Auskunftsermächtigung (Kap. 6) und «Finanzierungsanfrage abschliessen».

---

## 3. Schnellanmeldung (6 Schritte)

Zeitanzeige: 3:00 → 2:30 → 2:00 → 1:30 → 1:00 → 0:30.

Die Schnellanmeldung ist **die begleitete Anmeldung mit vorgezogenem Upload**. Nach dem Upload kommen exakt dieselben Schritte, Fragen und Felder – nur vorausgefüllt.

| # | Schritt | Inhalt |
|---|---|---|
| 1 | Kontakt | Berater-E-Mail (mit Partner-Erkennung), E-Mail + Telefon des Kunden. Name, Anrede, Geburtsdatum kommen aus der ID. |
| 2 | Unterlagen | Upload aller vorhandenen Dokumente (einzeln oder ganzer Ordner). Rechte Spalte live: «Deine Anfrage füllt sich» mit jeder übernommenen Angabe und Quelle. |
| 3 | Anfrage | = begleiteter Schritt 1, vorausgefüllt |
| 4 | Objekt & Finanzierung | = begleiteter Schritt 2, vorausgefüllt |
| 5 | Personen | = begleiteter Schritt 3, vorausgefüllt (erkannte Chips sind angetippt) |
| 6 | Fehlende Unterlagen & Abschluss | = begleiteter Schritt 4, aber die Liste zeigt **nur noch fehlende** Unterlagen |

Regeln:
- Ab Schritt 3 steht oben: «N Angaben aus deinen Unterlagen vorausgefüllt – markiert mit «aus Dokument»». Auswahlfragen tragen den Vermerk **«aus Dokument»** bzw. **«aus Dokument · bitte prüfen»** (Konfidenz unter Schwellwert, Vorschlag 90 %).
- Fehlt ein Dokument, bleibt die passende Frage leer. Es wird nichts geraten.
- Vom Nutzer geänderte Felder verlieren den Vermerk und werden von später hochgeladenen Dokumenten nicht mehr überschrieben.
- Antworten in Schritt 3–5 können neue Unterlagen auslösen (z.B. Chip «Solidarbürgschaft»). Diese erscheinen in Schritt 6 als fehlend, zusammen mit allem, was im Ordner nicht erkannt wurde.
- Schritt 6: Drop-Zone «Fehlende Unterlagen hier ablegen». Ist alles da: «Alle Unterlagen sind vollständig.» Fehlendes darf nachgereicht werden.
- Wechsel zur begleiteten Anmeldung jederzeit; man landet im gleichen Thema.

### 3.1 Was aus welchem Dokument vorbefüllt wird

| Dokument | Funnel-Feld | Zusätzlich (Mail/SF) |
|---|---|---|
| ID | Anrede, Vorname, Nachname, Kreditnehmer = natürlich | Geburtsdatum, Nationalität, «ab 50» |
| Grundbuchauszug | PLZ, Ort, Art der Immobilie = bestehend, Baurecht | Objektadresse, Wertquote, Grundpfandrechte |
| STWE-Reglement / Erneuerungsfonds | Art der Liegenschaft = STWE | Saldo Erneuerungsfonds |
| Zinsabrechnung | Kreditantrag = Ablösung, bestehende Hypothek | Bank, Zins, Laufzeit, Ablösedatum |
| Kaufvertrag | Kreditantrag = Neue Hypothek, Kaufpreis, Kaufdatum | |
| Lohnausweis | Beschäftigung = angestellt, Bruttoeinkommen | Arbeitgeber |
| Lohnabrechnungen | – | Bonus erkannt, Lohnerhöhung erkannt (Kap. 4.2) |
| Steuererklärung | Nutzung = selbstbewohnt (unsicher, über Eigenmietwert) | Zivilstand, Kinder |
| Verkaufsdokumentation | Objektwert (unsicher) | Baujahr, Zimmer, Heizungsart |
| Gebäudeversicherung | – | Baujahr, Kubatur, Versicherungssumme |
| Unterhaltsvereinbarung / Kreditvertrag / Leasingvertrag | Chip Unterhalt / Privatkredit / Leasing | Betrag, Rate, Restschuld |
| 3a-Police / -Bescheinigung | Säule 3a (Rückkaufswert) | Verpfändung |
| PK-Ausweis | – | Altersguthaben, Vorbezug möglich |
| Handelsregisterauszug | Firma, zeichnungsberechtigte Person | UID, Sitz |

In der begleiteten Anmeldung werden Funnel-Felder **nicht** automatisch überschrieben. Widerspricht ein Dokument einer Antwort, erscheint ein Vorschlag («Wir haben einen Kreditvertrag erkannt – ergänzen?»), wie in v1.

---

## 4. Dokumentenlogik

### 4.1 Regeln

| # | Dokument | Regel | Änderung |
|---|---|---|---|
| O1 | Fotos der Immobilie | immer, ausser Bauprojekt | |
| O2 | Verkaufsdokumentation («Habe ich nicht» erlaubt) | immer, ausser Bauprojekt | |
| O3 | Bau- / Grundrisspläne inkl. Nettowohnfläche | immer, ausser Bauprojekt | |
| O4 | Grundbuchauszug (max. 6 Monate) | immer · Neubau nur bei «vorhanden» | |
| O5 | Gebäudeversicherungspolice | wie O4, ausser Bauprojekt | |
| O6 | Kaufvertrag | Neue Hypothek, ausser Bauprojekt | |
| O7/O8 | Reservationsvertrag, Nachweis Reservationszahlung | Neue Hypothek + reserviert | |
| O9/O10 | Baubewilligung · Projektpläne, Baubeschrieb, Werkvertrag | **nur Bauprojekt** | **neu:** nicht mehr bei Renovation |
| O11 | **Aufstellung der Renovationen (Betrag und Ort, z.B. Küche, Bad, Fassade)** | Neue Hypothek + Renovation | **neu** (Rosanna) |
| O12/O13 | STWE-Begründungsakt/Reglement · Erneuerungsfonds | STWE | |
| O14 | Mieterspiegel | Nutzung = Vermietet | |
| O15 | Baurechtsvertrag | Chip Baurecht | |
| O16 | Bestehende Finanzierungsangebote | Chip Angebote | |
| H1 | **Aktuelle Produktvereinbarung** | Ablösung | **neu:** ersetzt Hypothekar-/Rahmenvertrag (Rosanna) |
| H2 | Letzte Zinsabrechnung | Ablösung | **offen für Marco** – nicht im Excel, wir lesen Bank, Zins und Ablösedatum daraus |
| – | ~~Sicherungsvereinbarung / Schuldbrief~~ | – | **entfällt** (Rosanna; stand auch nicht im Excel) |
| P1 | Pass / ID | pro Kreditnehmer | |
| P2 | **Aktueller Lohnausweis** (1 Jahr) | angestellt | **neu:** statt 3 Jahre (Excel: «aktueller Lohnausweis») |
| P3 | Letzte 3 Monatslohnabrechnungen | angestellt | |
| P4 | Pensionskassenausweis | angestellt · selbständig mit PK | |
| P5 | **Lohnausweise der zwei Vorjahre** | **automatisch, wenn Bonus erkannt** (4.2) | **neu** |
| P6 | **Anstellungsvertrag** | **automatisch, wenn Lohnerhöhung erkannt** (4.2) | **neu:** vorher immer (stand nicht im Excel) |
| P7 | Bilanz und ER der letzten 3 Jahre | selbständig | |
| P8 | Rentenbescheinigung | pensioniert | |
| P9 | Steuererklärung | natürliche Person | |
| P10 | Rentenvorausberechnung AHV | **automatisch, wenn ID ≥ 50 Jahre zeigt** | **neu:** keine Frage mehr |
| P11 | Unterhaltsvereinbarung | Chip Unterhalt | vorher «Kinder» + «Unterhalt» |
| P12/P13 | Kreditverträge · Leasingverträge | Chip | |
| P14–16 | Solidarbürge: ID, Steuererklärung, **aktueller** Lohnausweis | Chip | |
| P17 | Kreditnehmer 2: ID, Lohnausweis, Lohnabrechnungen, PK-Ausweis | KN 2 erfasst | |
| J1–J6 | HR-Auszug, ID Zeichnungsberechtigte, Jahresabschlüsse 3 J., Zwischenbilanz (optional), Betreibungsauszug, Steuererklärung Gesellschaft | juristische Person | |
| E1 | Aufstellung und Nachweis der Eigenmittel | **nur Neue Hypothek** | **neu** (Rosanna; im Excel «immer») |
| E2/E3 | Säule-3a-Bescheinigung · Police inkl. Wertmitteilung | **Betrag Säule 3a > 0** oder ab 50 | **neu:** Betrag statt Ja/Nein |
| E4 | Bestätigung PK-Vorbezug | Betrag PK-Vorbezug > 0 | **neu:** getrennt |
| E5 | Bestätigung PK-Verpfändung | Betrag PK-Verpfändung > 0 | **neu:** getrennt |
| E6 | Schenkungsvertrag | Betrag Schenkung > 0 | |
| E7 | Erbvorbezug / Erbschaftsbestätigung | Betrag Erbvorbezug > 0 | |
| E8 | Darlehensvertrag | Betrag Darlehen > 0 | |
| P0 | HYPOTEQ Auskunftsermächtigung (unterzeichnet) | immer · eigener Block im Abschluss (Kap. 6) | Download → unterzeichnen → Upload; wird auch im Ordner erkannt |

### 4.2 Regeln aus der Dokumentenanalyse (ohne Frage)

| Regel | Prüfung | Folge |
|---|---|---|
| **Bonus** | Jahreslohn Lohnausweis > Monatslohn (Lohnabrechnung) × 12 bzw. × 13 (falls 13. Monatslohn) **+ 5 %** | P5 kommt auf die Liste, Grund «variabler Lohnanteil erkannt» |
| **Lohnerhöhung** | aktueller Monatslohn × 12/13 > Jahreslohn Vorjahres-Lohnausweis **+ 5 %** | P6 kommt auf die Liste, Grund «Lohnerhöhung erkannt» |
| **Ab 50** | Geburtsdatum (ID) → Alter ≥ 50 | P10 und E2/E3 kommen auf die Liste |

Schwellwert 5 % ist ein Vorschlag – Marco bestätigt. Die Liste wächst nach dem Upload; der Nutzer sieht eine kurze Meldung.

Fall Gerber: Lohnausweis 2025 CHF 125'385 vs. 13 × CHF 9'615 = CHF 124'995 → +0.3 %. Kein Bonus, keine Erhöhung → ältere Lohnausweise sind «überzählig», Anstellungsvertrag ist «nicht benötigt».

### 4.3 Upload

- Eine Drop-Zone. Text: **«Einzelne Dateien oder ganzen Ordner hier ablegen»** · «Einzelne Dokumente oder einen ganzen Ordner mit allen Unterlagen. PDF, JPG, PNG. Du musst nicht angeben, was welches Dokument ist.»
- Zwei Buttons: **«Dateien auswählen»** und **«Ganzen Ordner auswählen»** (`<input webkitdirectory>`). Ordner per Drag & Drop werden rekursiv gelesen.
- Dateien ausserhalb der Liste: überzählig · Duplikat · nicht benötigt (mit Begründung, z.B. «Eigenmittelnachweis ist nur bei einem Kauf nötig») · nicht erkannt. Nichts wird gelöscht.
- Umbenennung und Detailansicht wie v1 (Kap. 5.1).

---

## 5. Berechnung

> **Massgebend ist die Logik des Hypothekenrechners auf hypoteq.ch.** Der Prototyp verwendet die folgende Standardformel als Platzhalter. Bitte die Parameter aus dem Homepage-Kalkulator übernehmen und hier ersetzen – die Formel muss an beiden Orten identisch rechnen.

**Kauf**
- Gesamtkosten = Kaufpreis + Renovationsbetrag
- Eigenmittel total = Ersparnisse + 3a + PK-Vorbezug + Schenkung + Erbvorbezug + Darlehen (**PK-Verpfändung zählt nicht**, sie ist Sicherheit)
- Hypothek = Gesamtkosten − Eigenmittel total · ohne Eigenmittelangabe: 80 % der Gesamtkosten
- Belehnungsbasis = tieferer Wert von Gesamtkosten und geschätztem Objektwert (Niederstwertprinzip)
- Harte Eigenmittel = Eigenmittel total − PK-Vorbezug · mind. 10 % des Kaufpreises

**Ablösung**
- Hypothek = bestehende Hypothek + Erhöhung · Belehnungsbasis = Objektwert

**Für beide**
- Belehnung = Hypothek / Basis · max. 80 %
- Tragbarkeit = (Hypothek × 5 % + max(Hypothek − ⅔ Basis, 0) / 15 + Basis × 1 %) / Bruttoeinkommen Haushalt · max. 33 %
- Urteil: «Finanzierung möglich» (alle Grenzen eingehalten) · «Prüfung nötig» · «Angaben ergänzen»

**Testfall Rosanna** (muss stimmen): Kaufpreis 500'000, Objektwert 1'000'000, Einkommen 150'000, keine Eigenmittel → Hypothek 400'000 · Belehnung 80 % · Tragbarkeit 19.6 % · «Finanzierung möglich».
v1 rechnete fälschlich 800'000 / 100 % / «nicht tragbar».

---

## 6. Auskunftsermächtigung (Pflicht für jeden Fall)

Aktuell **nur per Download und Upload**. Eine digitale Signatur (DocuSign) folgt in einer späteren Phase – die Lösung soll so gebaut werden, dass der Upload dann durch DocuSign ersetzt werden kann.

Im Abschluss, vor «Finanzierungsanfrage abschliessen», drei Schritte nebeneinander:

1. **Vorlage herunterladen** – PDF, vorausgefüllt mit Vollmachtgeber, Geburtsdatum, Adresse, Objekt und Zweck (aus Funnel und Dokumenten).
2. **Unterzeichnen** – von allen Kreditnehmern (bei JP: zeichnungsberechtigte Person), von Hand.
3. **Unterzeichnet hochladen** – PDF oder Foto. Eigener Upload-Button, unabhängig vom Dateinamen.

Weitere Regeln:
- Liegt die unterzeichnete Ermächtigung schon im hochgeladenen Ordner, wird sie erkannt und die Pflicht ist erfüllt.
- Die Dokumenten-AI prüft: richtiges Formular, Unterschrift vorhanden, Name passt zum Kreditnehmer. Fehlt etwas, Status «Unterschrift fehlt» statt «erhalten».
- **«Später nachreichen»** (z.B. Berater ohne Kunde vor Ort): Der Fall kann abgeschlossen werden, Status **«Unterschrift ausstehend»**. Die Vorlage liegt der Bestätigungsmail an den Kunden bei; Erinnerung nach 2 und 5 Tagen. Ohne Unterschrift geht keine Anfrage an die Bank.
- «Finanzierungsanfrage abschliessen» ist gesperrt, bis hochgeladen oder «später nachreichen» gewählt ist.
- Ablage im Fall-Ordner, Anhang im Dossier, Verknüpfung in Salesforce.

---

## 7. E-Mail-Logik

### 7.1 Versand

| Ereignis | Empfänger | Inhalt |
|---|---|---|
| Abschluss | **Kunde – genau eine Mail** | Bestätigung + Zusammenfassung + ggf. Vorlage Auskunftsermächtigung + ggf. fehlende Unterlagen |
| Abschluss | Berater/VP (falls Berater-Einstieg) | gleiche Zusammenfassung, Betreff mit Kundenname |
| Abschluss | HYPOTEQ intern (Queue) | gleiche Zusammenfassung + Link zum Case |
| Unterschrift ausstehend | Kunde | Erinnerung nach 2 und 5 Tagen (Vorlage + Upload-Link, keine Zusammenfassung) |
| Unterlagen nachgereicht | – | keine Mail; Zusammenfassung im Case aktualisieren |

**Bug aus Rosannas Test:** Der Kunde erhielt 2 Mails. Künftig gibt es pro Ereignis und Empfänger genau eine Mail. Vorlage der Auskunftsermächtigung und Bestätigung sind dieselbe Mail.

### 7.2 Aufbau

Betreff: `Deine Finanzierungsanfrage HQ-… – {Vorname Nachname / Firma}, {PLZ Ort}`

1. **Kopf** – HYPOTEQ-Logo, Anfrage-Nr., Datum, erfasst von (Berater/Partner oder «Eigene Anfrage»).
2. **Nächster Schritt** (nur falls zutreffend, zuoberst) – «Bitte Auskunftsermächtigung unterzeichnen und hochladen» mit Vorlage im Anhang und Upload-Link, oder «Diese Unterlagen fehlen noch: …» mit Link zurück in den Funnel.
3. **Ergebnis** – Gesamtfinanzierung, Belehnung, Tragbarkeit, Urteil.
4. **Antrag** – Kreditantrag, Kreditnehmer-Typ.
5. **Kreditnehmer** – je Kreditnehmer ein Block: Anrede, Name, Geburtsdatum, Nationalität, Zivilstand, Adresse, E-Mail, Telefon, Beschäftigung, Arbeitgeber, Bruttoeinkommen. Bei JP: Firma, UID, Sitz, zeichnungsberechtigte Person, Kontakt.
6. **Objekt** – Adresse, Art der Immobilie (+ Neubau-Art nur bei Neubau), Art der Liegenschaft, Nutzung, Mietertrag (nur vermietet), Baujahr, Wohnfläche, Heizungsart, Baurecht.
7. **Finanzierung** – Kauf: Kaufpreis, Kaufdatum, Renovationsbetrag, Objektwert, Eigenmittel-Aufteilung (nur ausgefüllte Positionen) und total · Ablösung: bestehende Bank, Hypothek, Zins, Ablösedatum, Erhöhung + Zweck, Vorsorge.
8. **Weitere Angaben** – nur angetippte Chips (Unterhalt, Privatkredit, Leasing, Solidarbürgschaft + Name, Baurecht, Angebote, Steueroptimierung), Laufzeit, Kommentar.
9. **Unterlagen** – erfüllt / total, Liste mit Status (erkannt, veraltet, fehlt).
10. **Fuss** – Kontakt Berater bzw. HYPOTEQ, Link zur Anfrage.

### 7.3 Regeln

- **Nur zutreffende Blöcke und Felder anzeigen.** Leere Felder werden weggelassen, nicht leer angezeigt. (Bugs aus Rosannas Test: Kreditnehmer 2 ohne Erfassung, «Firma» bei natürlicher Person, «Neubau-Art» bei bestehender Immobilie, «Jährlicher Mietertrag» bei selbstbewohnt.)
- **Jede Funnel-Antwort erscheint in der Mail** – auch Heizungsart, Finanzierungsangebote und Firma (Bugs: fehlten bzw. blieben leer).
- **Werte aus Dokumenten** erscheinen gleichwertig, mit kleinem Vermerk «aus Dokument» in der internen und der Berater-Mail. In der Kundenmail ohne Vermerk.
- Werte, die erst nach dem Abschluss aus nachgereichten Dokumenten kommen, aktualisieren den Case – keine neue Mail.
- Sprache der Mail = Sprache des Funnels (siehe v1 Kap. 7). Zahlen im Schweizer Format.
- Anrede: DE «du» (Kunde), Berater-/Intern-Mail neutral.

---

## 8. Salesforce – Ergänzungen zum Mapping

Alle Felder existieren laut Feldkatalog. Das bestehende Mapping bleibt gültig; diese Zeilen sind ein Vorschlag (auch in `HYPOTEQ_Salesforce_Mapping_Vorschlag.csv` ergänzt).

| Funnel | Salesforce | Hinweis |
|---|---|---|
| Einstieg Schnell / Begleitet | `Case.Dokumenten_Check_State__c` → `entry` | für Auswertung |
| Jährlicher Netto-Mietertrag | `Case.J_hrlicher_Netto_Mietertrag__c` | nur vermietet |
| Kaufdatum | `Case.Kaufdatum__c` (Text 80) | bei Ablösung: Ablösedatum aus Zinsabrechnung |
| Renovation Ja/Nein | `Case.Gibt_es_Renovationen_oder_Zusatzkosten__c` | |
| Renovationsbetrag | **kein Feld** → `Case.Betrag__c` prüfen oder neues Feld | offen |
| Nutzung Gewerbe | `Case.Nutzung_der_Immobilie__c` = «Für eigenes Geschäft» | |
| Ersparnisse | `Case.Ersparnisse__c` (Text 80) | Betrag als Text |
| Säule 3a | `Case.X3_Saeule__c` | |
| PK-Vorbezug | `Case.PK_Betrag__c` | |
| PK-Verpfändung | `Case.Verpf_ndung_PK__c` = Ja + Betrag in `Dokumenten_Check_State__c` | |
| Schenkung + Erbvorbezug | `Case.Schenkung_usw__c` (Summe) | Aufteilung im JSON |
| Darlehen | `Dokumenten_Check_State__c` | kein Feld |
| Eigenmittel total | `Case.Eigenmittel_Total__c` · `Case.EigenmittelProzent__c` | |
| Steueroptimierung | `Case.Steueroptimierung__c` | |
| Heizungsart (aus Dokument) | `Case.Waermeerzeugung__c` | |
| Zivilstand (aus Dokument) | `PersonAccount.Zivilstand__c` | |
| Telefon | `PersonAccount.PersonMobilePhone` | beide Rollen |
| JP: Firma / zeichnungsberechtigte Person | Business Account `Name` / Kontakt | |
| Kreditnehmer 2 | `Case.Client_2__c` | nur wenn erfasst |
| Auskunftsermächtigung | Datei am Case + Status im JSON (`signature: uploaded | pending`, Zeitstempel, Methode) | |
| Herkunft je Feld | `Dokumenten_Check_State__c` → `sources: { "fin.inc": "Lohnausweis 2025", … }` | |

---

## 9. Fehler aus Rosannas Test – Checkliste

- [ ] Kunde erhält 2 Mails → genau eine (7.1)
- [ ] Ablösung + Bauprojekt wählbar → deaktiviert (2)
- [ ] Juristische Person: Nutzung Selbstbewohnt/Zweitwohnsitz → nur Vermietet/Gewerbe (2)
- [ ] Mietertrag nicht eingebbar → Feld bei Vermietet (2)
- [ ] Neubau-Art «Bereits erstellt» nicht wählbar → im neuen Modell «Neubau» = bereits erstellt, «Bauprojekt» separat (SF-Mapping v1 Kap. 6.5)
- [ ] Mail ohne Heizungsart, Angebote, Firma → alle Antworten in der Mail (7.3)
- [ ] Mail zeigt leere Felder (KN 2, Firma, Neubau-Art, Mietertrag) → nur zutreffende (7.3)
- [ ] JP: Name/Telefon leer → Felder in Schritt 1 (2)
- [ ] Hypothekarbedarf aus Objektwert → aus Kaufpreis (5)
- [ ] Eigenmittel nicht erfassbar → Betragstabelle (2)
- [ ] Zivilstand, Geburtsdatum, Privatkredit, Schenkung, Solidarbürgschaft fehlen in der Mail → aus Dokument bzw. Chips (3.1, 7)

---

## 10. Offene Punkte für Marco

1. **Zinsabrechnung** bei Ablösung behalten? (nicht im Excel; liefert Bank, Zins, Ablösedatum)
2. **Schwellwert** für Bonus/Lohnerhöhung: 5 %?
3. **Homepage-Kalkulator:** Parameter/Formel an Edita geben (Kap. 5)
4. **DocuSign** (spätere Phase): Signaturtyp mit den Partnerbanken klären (einfach oder qualifiziert nach ZertES).
5. **Renovationsbetrag:** neues Salesforce-Feld oder `Betrag__c`?
6. **Nutzung** bei natürlicher Person zusätzlich «Vermietet & teilweise selbstbewohnt»?
7. Aus v1 weiterhin offen: geschätzter Objektwert (Feld), `Erh_hung__c` vs. `Erh_hung_betrag__c`, max. 3 Kreditnehmer in Salesforce, Partner-Whitelist (täglich oder live).
