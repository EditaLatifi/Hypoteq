# Datenabgleich — Feldschlüssel je Dokumenttyp (zur Abnahme)

**Für:** Fisnik Salihu (HYPOTEQ) · **Von:** Edita Latifi · **Stand:** 26.10.2026
**Bezug:** Spezifikation Datenabgleich Kap. 4 und 4.1, Antwort 6 vom 26.10.2026 (die `Feld_Key__c`-Werte aus `Pruefregel__c` sind die Referenz für die Feldnamen).

So ist der Abgleich umgesetzt (Funnel-Branch `ai-document-intelligence`, auf der Preview): Die KI liest pro Dokument die unten genannten Felder aus — mit Konfidenz, Fundstelle (`sourceRef`) und Prompt-Version. Der Vergleich läuft danach ohne KI nach `Pruefregel__c`. Bitte prüft die beiden Tabellen und meldet, welche Felder fehlen, anders heissen oder wegfallen sollen.

## 1. Je Prüfregel: was verglichen wird

Die Quellen in `Pruefregel__c` (eure Schlüssel) sind auf unsere Dokumenttypen abgebildet. Ein Schlüssel, den der Funnel nicht kennt, wird ignoriert — eine neue Quelle in Salesforce bricht also nichts, braucht aber eine Zuordnung von uns.

| `Feld_Key__c` | Funnel-Wert | Primärquelle → Typ (Feld) | Sekundärquellen → Typ (Feld) | Hinweise |
|---|---|---|---|---|
| `name_kreditnehmer` | Vorname + Nachname je Kreditnehmer | `pass_id` → `id` (Vornamen, Name) | `lohnausweis` → `lohnausweise`, `steuererklaerung` → `steuer`, `betreibungsauszug` → `betreibung` (je gedruckter Name) | Identitäts-Konflikt; Gross/klein, Akzente, Doppelnamen normalisiert. Ein Pass, der zu keiner erfassten Person passt, ist ebenfalls ein Identitäts-Konflikt. |
| `geburtsdatum` | – (im Funnel nicht gefragt) | `pass_id` → `id` (Geburtsdatum) | `pensionskassenausweis` → `pk` (kein Feld) | Nur im JSON, nur Dokument gegen Dokument. **Frage:** Geburtsdatum am PK-Ausweis zusätzlich auslesen? |
| `nationalitaet_bewilligung` | – (nicht gefragt) | `pass_id` → `id` (Nationalität, Dokumentart inkl. Ausweis B/C) | – | Nur im JSON. |
| `jahreseinkommen` | Bruttoeinkommen KN 1 / KN 2 (angestellt) | `lohnausweis` → `lohnausweise` (Bruttolohn) | `monatslohnabrechnungen` → `lohnabrechnungen` (Monatslohn brutto × 12 bzw. × 13 mit «13. Monatslohn»), `steuererklaerung` → `steuer` (**neu:** Einkünfte unselbständig) | Sekundär ±15 % (Matrix), da `Pruefregel__c` nur eine Toleranz hat. |
| `einkommen_selbstaendig` | Bruttoeinkommen (selbständig) | `erfolgsrechnung` → `abschluss_se` (Reingewinn, Ø über die Geschäftsjahre) | `steuererklaerung` → `steuer` (**neu:** Einkünfte selbständig) | |
| `renteneinkommen` | Bruttoeinkommen (pensioniert) | `rentenbescheinigung` → `rente` (Rente pro Monat × 12, PK + AHV zusammen) | `steuererklaerung` → `steuer` (**neu:** Renteneinkünfte) | |
| `eigenmittel_total` | Eigenmittel total (ohne PK-Verpfändung), nur Kauf | `kontoauszug` → `vermoegen` (Saldo total) + `saeule3a_auszug` → `s3a` (Guthaben) / `police` (Rückkaufswert) + `pk_ausweis` → `pkvorbezug` (Betrag), sonst `pk` (Vorbezug für Wohneigentum möglich, höchstens der erfasste PK-Vorbezug) | `steuererklaerung` → `steuer` (**neu:** Vermögen) | Nur Unterschreitung. Wählt der Kunde den Dokumentwert, werden die Ersparnisse angepasst. |
| `eigenmittel_3a` | Säule 3a | `saeule3a_auszug` → `s3a` (Guthaben) + `police` (Rückkaufswert) | – | |
| `eigenmittel_pk_vorbezug` | PK-Vorbezug | `pk_ausweis` → `pkvorbezug` (Betrag), sonst `pk` (Vorbezug für Wohneigentum möglich) | – | Nur Unterschreitung. |
| `eigenmittel_schenkung_darlehen_erbe` | Schenkung / Darlehen / Erbvorbezug, je einzeln | `schenkungsvertrag` → `schenkung`, `darlehensvertrag` → `darlehen`, `erbvertrag` → `erbe` (je Betrag) | – | Drei Einträge im JSON (`part`). |
| `kaufpreis` | Kaufpreis | `kaufvertrag` (Kaufpreis) | `verkaufsdokumentation` → `verkaufsdoku` (Verkaufspreis), `reservationsvertrag` → `reservation` (kein Preisfeld) | **Frage:** Kaufpreis am Reservationsvertrag auslesen? |
| `objekt_adresse` | PLZ + Ort | `grundbuchauszug` → `grundbuch` (PLZ, Ort, Adresse) | `kaufvertrag` (Objekt), `verkaufsdokumentation` (Objekt), `gebaeudeversicherung` → `gvz` (kein Adressfeld) | Der Funnel fragt keine Strasse: verglichen werden PLZ und Ort. **Frage:** Adresse an der Gebäudeversicherung auslesen? |
| `bestehende_hypothek_betrag` | Bestehende Hypothek (Ablösung) | `produktvereinbarung` → `produkt` (Betrag, Tranchen zusammen), ohne Produktvereinbarung `hyp_zins` (Kapital) | `steuererklaerung` → `steuer` (Hypothekarschuld) | |
| `mietzins_rendite` | Netto-Mietertrag pro Jahr | `mieterspiegel` (Mietzinseinnahmen pro Jahr) | `steuererklaerung` (kein Feld) | |
| `verpflichtungen` | Chips Leasing / Privatkredit / Unterhalt (Ja/Nein) | `leasingvertrag` → `leasing` (Leasingrate), `darlehensvertrag` → `kredit` (Monatsrate), `unterhaltsvereinbarung` → `unterhalt` (Unterhaltsbeitrag) | `steuererklaerung` → `steuer` (Unterhaltsbeiträge), `betreibungsauszug` → `betreibung` (Betreibungen) | Nur Hinweis. Ein Dokument ohne Angabe im Funnel (auch ausserhalb der Liste) wird gemeldet. Der Funnel fragt keine Beträge — verglichen wird «vorhanden / nicht vorhanden». |
| `baujahr_kubatur` | – (nicht gefragt) | `gebaeudeversicherung` → `gvz` (Erstellungsjahr, Volumen) | `verkaufsdokumentation` → `verkaufsdoku` (Baujahr) | Nur das Baujahr, Dokument gegen Dokument. **Frage:** Kubatur an der Verkaufsdokumentation auslesen? |

Der Darlehensvertrag heisst in zwei Regeln Verschiedenes: bei den Eigenmitteln das Darlehen (`darlehen`), bei den Verpflichtungen der Privatkredit (`kredit`).

## 2. Je Dokumenttyp: was ausgelesen wird

Alle Felder mit Konfidenz (0–1), Fundstelle und — neu — der Prompt-Version der Analyse. **Neu** sind die vier Felder der Steuererklärung (Einkünfte unselbständig, Einkünfte selbständig, Renteneinkünfte, Vermögen); alle übrigen liest der Funnel schon heute. Zahlen und Daten liegen in der Analyse wie gedruckt und werden für den Vergleich normalisiert (CHF ohne Trennzeichen, Daten ISO).

| Typ (unser Schlüssel) | Dokument | Euer Schlüssel in `Pruefregel__c` | Felder |
|---|---|---|---|
| `fotos` | Fotos der Immobilie (innen und aussen) | – | Objekt · Aufnahmen · Zustand |
| `verkaufsdoku` | Verkaufsdokumentation | `verkaufsdokumentation` | Anbieter · Objekt · Baujahr · Verkaufspreis · Zimmer · Wohnfläche · Garten · Heizung |
| `stwe_plan` | Bau- / Grundrisspläne inkl. Nettowohnfläche | – | Objekt · Pläne · Einheit Nr. 1 · Nettowohnfläche |
| `grundbuch` | Aktueller Grundbuchauszug (max. 6 Monate) | `grundbuchauszug` | Grundbuch · Eigentümer · Objekt · Adresse · PLZ · Ort · Wertquote · Baurecht · Grundpfandrechte · Ausstellungsdatum |
| `gvz` | Aktuelle Gebäudeversicherungspolice (inkl. Kubatur) | `gebaeudeversicherung` | Versicherung · Policen-Nr. · Eigentümerschaft · Versicherungssumme · Erstellungsjahr · Volumen |
| `kaufvertrag` | Kaufvertrag (Entwurf oder Original) | `kaufvertrag` | Käufer · Verkäufer · Objekt · Kaufpreis · Eigentumsübertragung · Datum |
| `reservation` | Reservationsvertrag | `reservationsvertrag` | Verkäufer · Käufer · Objekt · Reservationsbetrag · Datum |
| `reservation_zahlung` | Nachweis Reservationszahlung (Bankauszug) | – | Bank · Betrag · Valuta · Empfänger |
| `baubewilligung` | Baubewilligung | – | Gemeinde · Bauvorhaben · Bewilligt am |
| `projekt` | Projektpläne, Baubeschrieb und Werkvertrag inkl. Kostenzusammenzug und Kubatur | – | Bauherr · Objekt · Gesamtkosten · Kubatur |
| `reno_liste` | Aufstellung der Renovationen | – | Objekt · Positionen · Total |
| `stwe_regl` | Begründungsakt mit Wertquoten · Nutzungs- und Verwaltungsreglement | – | Gemeinschaft · Umfang · Wertquote Einheit Nr. 1 |
| `ef` | Angaben zum Erneuerungsfonds | – | Kontoinhaber · IBAN · Saldo per 31.12.2025 · Erstellt am |
| `mieterspiegel` | Aktueller Mieterspiegel inkl. Mietzinsaufstellung | `mieterspiegel` | Objekt · Mieteinheiten · Mietzinseinnahmen pro Jahr · Stichtag |
| `baurecht` | Baurechtsvertrag | – | Baurechtsgeber · Baurechtsnehmer · Dauer bis · Baurechtszins |
| `angebote` | Bestehende Finanzierungsangebote | – | Bank · Betrag · Zinssatz · Laufzeit · Gültig bis |
| `produkt` | Aktuelle Produktvereinbarung | `produktvereinbarung` | Bank · Produkt · Betrag · Zinssatz · Laufzeit · Ablösedatum |
| `hyp_zins` | Letzte Zinsabrechnung | `produktvereinbarung` | Produkt · Kapital · Zinssatz · Laufzeit · Zins Q1 2026 · Ablösedatum |
| `vollmacht` | HYPOTEQ Auskunftsermächtigung | – | Vollmachtgeber · Adresse · Unterschrift · Unterzeichnet am |
| `id` (auch Solidarbürge `b_id`, Zeichnungsberechtigte `wb`) | Pass / Identitätskarte | `pass_id` | Name · Vornamen · Geschlecht · Geburtsdatum · Nationalität · Dokumentart · Gültig bis |
| `lohnausweise` (auch Vorjahre `lohnausweise_alt`, Solidarbürge `b_lohn`) | Aktueller Lohnausweis | `lohnausweis` | Arbeitgeber · AHV-Nr. · Jahr · Bruttolohn · Beschäftigungsgrad |
| `lohnabrechnungen` | Letzte 3 Monatslohnabrechnungen | `monatslohnabrechnungen` | Arbeitgeber · Perioden · Monatslohn brutto · 13. Monatslohn · Familienzulagen · Nettolohn · Pauschalspesen · Auszahlung |
| `pk` | Pensionskassenausweis | `pensionskassenausweis`, `pk_ausweis` | Versicherte Person · Versicherter Lohn · Altersguthaben · Vorbezug für Wohneigentum möglich |
| `anstellung` | Anstellungsvertrag | – | Arbeitgeber · Arbeitnehmer · Anstellung · Jahreslohn |
| `abschluss_se` | Bilanz und Erfolgsrechnung der letzten 3 Jahre (selbständig) | `erfolgsrechnung` | Firma · Geschäftsjahr · Umsatz · Reingewinn |
| `rente` | Rentenbescheinigung (PK, AHV) | `rentenbescheinigung` | Rentenart · Rente pro Monat · Gültig ab |
| `steuer` (auch Solidarbürge `b_steuer`) | Aktuelle Steuererklärung | `steuererklaerung` | Steuerjahr · Kanton · Zivilstand · Kinder · Unterhaltsbeiträge · Liegenschaft · Eigenmietwert · Hypothekarschuld · **Einkünfte unselbständig · Einkünfte selbständig · Renteneinkünfte · Vermögen** |
| `ahv_voraus` | Rentenvorausberechnung (AHV) | – | Versicherte Person · Voraussichtliche Rente pro Monat · Rentenbeginn |
| `unterhalt` | Unterhaltsvereinbarung | `unterhaltsvereinbarung` | Parteien · Kinder · Unterhaltsbeitrag · Gültig ab |
| `kredit` | Kreditverträge (Privatkredite) | `darlehensvertrag` (nur bei `verpflichtungen`) | Kreditgeber · Vertragsnummer · Restschuld · Monatsrate · ZEK-relevant |
| `leasing` | Leasingverträge | `leasingvertrag` | Leasinggeber · Leasingnehmer · Leasingrate · Restlaufzeit |
| `hr` | Aktueller Handelsregisterauszug | – | Firma · UID · Sitz · Zeichnungsberechtigte · Auszug vom |
| `jahresabschluss` | Jahresabschlüsse der letzten 3 Jahre (Gesellschaft) | – | Firma · Geschäftsjahr · Bilanzsumme · Eigenkapital · Reingewinn |
| `zwischenbilanz` | Aktuelle Zwischenbilanz | – | Firma · Stichtag · Eigenkapital |
| `betreibung` | Aktueller Betreibungsauszug | `betreibungsauszug` | Schuldner · Betreibungen · Ausgestellt am |
| `steuer_jp` | Aktuelle Steuererklärung der Gesellschaft | – | Firma · Steuerjahr · Steuerbarer Gewinn · Steuerbares Kapital |
| `vermoegen` | Aufstellung und Nachweis der Eigenmittel | `kontoauszug` | Bank · Kontoinhaber · Privatkonto · Saldo total |
| `s3a` | Säule 3a Bescheinigung | `saeule3a_auszug` | Vorsorgeeinrichtung · Versicherte Person · Guthaben · Beiträge 2025 · Beginn Vorsorgeverhältnis · Verpfändung |
| `police` | Vorsorgepolice 3a inkl. Wertmitteilung | `saeule3a_auszug` | Versicherer · Police-Nr. · Vorsorgeplan · Versicherungsbeginn · Monatsprämie · Rückkaufswert · Begünstigte Bank |
| `pkvorbezug` | Bestätigung PK-Vorbezug | `pk_ausweis` | Vorsorgeeinrichtung · Versicherte Person · Betrag · Art |
| `pkverp` | Bestätigung PK-Verpfändung | – | Vorsorgeeinrichtung · Versicherte Person · Betrag · Pfandgläubiger |
| `schenkung` | Schenkungsvertrag | `schenkungsvertrag` | Schenkgeber · Beschenkte · Betrag · Datum |
| `erbe` | Erbvorbezug / Erbschaftsbestätigung | `erbvertrag` | Erblasser · Erben · Betrag |
| `darlehen` | Darlehensvertrag | `darlehensvertrag` (bei den Eigenmitteln) | Darlehensgeber · Darlehensnehmer · Betrag · Zins · Rückzahlung |

## 3. Offen zur Abnahme

1. Passen die Zuordnungen eurer Schlüssel zu unseren Typen (Tabelle 2, dritte Spalte)?
2. Die vier neuen Felder der Steuererklärung — passend benannt?
3. Zusätzliche Felder (je ein Ja genügt): Geburtsdatum am PK-Ausweis · Kaufpreis am Reservationsvertrag · Adresse an der Gebäudeversicherung · Kubatur an der Verkaufsdokumentation.
4. Ein Prompt-Aufruf pro Dokument liest Typ und Felder in einem Schritt (Spezifikation 4.1: «ein Prompt pro Dokumenttyp, versioniert»): Jeder Typ hat seine eigenen Felder und Anweisungen im versionierten Katalog, die Version steht an jeder Analyse. Getrennte Aufrufe pro Typ würden Zeit und Kosten des Auslesens verdoppeln — einverstanden so?
