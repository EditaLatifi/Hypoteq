# HYPOTEQ → Edita: Antworten & Entscheide

**Funnel v5 & Partnerportal · Stand 19.10.2026 · Freigabe: Fisnik Salihu (CTO)**

Dieses Dokument beantwortet alle offenen Fragen aus «Offene Fragen zur Umsetzung Funnel v5 und Partnerportal» verbindlich. Abschnitt D listet, was seit 18.10. neu in Salesforce bereitsteht (Felder inkl. API-Namen). Abschnitt E enthält neue Punkte aus dem Review der Vercel-Builds.

---

## A. Verbindliche Rahmenentscheide

1. **Hosting/Datenhaltung:** Zielarchitektur ist **komplett AWS auf Schweizer Servern — und nur dort**. Supabase (Auth, Storage, Audit) ist als Übergangslösung erlaubt, bis die internen Tests abgeschlossen sind; danach **sofortiger Transfer auf AWS**. Bitte Storage-Zugriffe im Code von Anfang an abstrahieren, damit der Wechsel kein Umbau wird.
2. **E-Mail-Adresse:** **info@hypoteq.ch ist die einzig korrekte Adresse — überall.** Alle Vorkommen von hypoteq.com in UI, Mails und Doku bitte ersetzen.
3. **Testdaten:** Alle echten Kundendaten (Fall Gerber u.a.) **komplett aus Prototyp und Code entfernen**. Der Funnel startet leer. Gebaut wird nur kunden- und vertriebspartnerseitig.
4. **AI-Philosophie:** Die AI **unterstützt, sie ersetzt nicht**. Extraktion/Zuordnung muss «ungefähr gut» sein — nichts blockiert je den Nutzer (siehe E.4 Signatur-Override). Umbenennung + Vorbefüllung sind der Kernnutzen.

---

## B. Antworten auf die 26 Fragen

### Funnel – Berechnung und Regeln

**1 · Formel:** Die **Handover-Formel bleibt** (konservativer: Grenze 33 %). Die Homepage-Parameter liefert Marco später zur Vereinheitlichung nach; bis dahin ist bekannt und akzeptiert, dass Homepage-Rechner und Funnel leicht abweichen. Testfall Rosanna (400'000 · 80 % · 19.6 %) muss weiterhin stimmen.

**2 · Bonus/Lohnerhöhung 5 %:** Bestätigt. Wird nach 2–3 Monaten anhand echter Fälle nachjustiert.

**3 · Zinsabrechnung bei Ablösung:** Bleibt Pflicht (liefert Bank, Zins, Ablösedatum für die Extraktion).

**4 · Renovationsbetrag:** Neues Feld **`Case.Renovationsbetrag__c`** (Currency) — ist angelegt und für den Integration-User schreibbar. Bitte dorthin mappen (JSON zusätzlich ok). `Betrag__c` nicht verwenden.

**5 · Nutzung «Vermietet & teilweise selbstbewohnt»:** **Doch umsetzen** — bitte als vierte Option bei natürlicher Person anbieten. Salesforce-seitig ist nichts zu tun: Der Picklist-Wert `Vermietet & teilweise selbstbewohnt` existiert bereits auf `Nutzung_der_Immobilie__c`.

**6 · Startscreen:** Einverstanden, erscheint immer (auch via Portal-Link, mit Vorauswahl). **Dazu ein Bug-Hinweis: Passwort-Reset und Magic Link funktionieren im aktuellen Build nicht — bitte fixen.**

**7 · Text Schnellanmeldung:** Handover gilt: «ca. 3 Minuten». Bestätigt.

### Funnel – Auskunftsermächtigung und Mails

**8 · Vorlagen-Belegung** (Text1–5 = KN1, Text6–10 = KN2, Text11/12 = Datum/Ort): Plausibel — wir machen einen Testdruck mit der Original-Vorlage zur finalen Bestätigung.

**9 · Fehlende Formularfelder:** Zusatzzeile für Geburtsdatum/Objekt/Zweck **reicht für Phase 1**. Eine neue Vorlage mit echten Feldern kommt zusammen mit der DocuSign-Phase.

**10 · Mail-Texte:** Wir liefern euch **komplette Textvorschläge für den gesamten E-Mail-Flow** (Bestätigungen, Erinnerungen, Status-Benachrichtigungen aus dem Portal) — alle Sprachen. Der komplette E-Mail-Flow wird automatisiert. Bis dahin: eure übernommenen Fliesstexte als Platzhalter ok.

**11 · DocuSign:** Spätere Phase, **jetzt kein Thema** — weglassen, nicht klären. Nur die Upload-Stelle so bauen, dass DocuSign sie später ersetzen kann (wie im Handover vorgesehen).

**12 · Übersetzungen:** Wir liefern eine überarbeitete Fassung der EN/FR/IT-Texte (Review eurer i18n-Datei). Getestet und verbessert wird nach Aufsetzung.

### Salesforce

**13 · Feldkonflikte — bestätigt mit einer Korrektur:**
- Ersparnisse → **`Bar__c`** ✓ (Currency; `Ersparnisse__c` ist nur Text 80 — richtig erkannt)
- Eigenmittel total → **`Eigenmittel__c`** ✓ (Currency, schreibbar)
- Telefon → **`Account.Phone`** ✓
- Kaufdatum: `Kaufdatum__c` ist ein **Textfeld** (Text 80, Label «Kauf- & Ablöse-Datum») — als Text `TT.MM.JJJJ` weiter befüllen. **Zusätzlich neu: `Case.Kaufdatum_Datum__c` (Date)** — bitte parallel mit dem echten Datum befüllen (auswertbar).
- **Generell gilt: alles muss auswertbar sein.** Beträge in Currency-Felder, Flags in Checkboxen, JSON nur für Details/Audit. Die Weitergabe Case → Opportunity beachten (Kaufpreis/Amount synchronisiert Salesforce bereits automatisch).

**14 · Tragbarkeit/Eigenmittel %:** Ja — der Funnel schreibt die **v5-Werte** (Handover-Formel) in `Tragbarkeit__c` und `EigenmittelProzent__c`.

**15 · Feldrechte — alles verifiziert (18.10.):**
- `Waermeerzeugung__c` existiert mit euren fünf Werten plus `Gas Biogas`, `Wärmepumpe Wasser-Wasser`, `Andere` («Wärmepumpe» könnt ihr also aufteilen, Standard-Mapping: Wärmepumpe → `Wärmepumpe Luft-Wasser`).
- `Kaufdatum__c` = Text(80), siehe Frage 13.
- Der Integration-User (funnel.integration@hypoteq.ch) darf schreiben: `J_hrlicher_Netto_Mietertrag__c`, `Steueroptimierung__c`, `Eigenmittel__c`, `Verpf_ndung_PK__c` (Picklist Ja/Nein) — ausserdem `Tragbarkeit__c`, `EigenmittelProzent__c`, `X3_Saeule__c`, `PK_Betrag__c`, `Schenkung_usw__c` und alle neuen Felder aus Abschnitt D.

**16 · Juristische Person:** **Business Account + Kontakt** (zeichnungsberechtigte Person), wie im Handover. Kein Person Account mit Firmennamen.

**17 · Reste aus v1:**
- Geschätzter Objektwert → neues Feld **`Case.Geschaetzter_Objektwert__c`** (Currency), angelegt.
- Erhöhung → **`Erh_hung__c`** verwenden (in Nutzung); `Erh_hung_betrag__c` ignorieren.
- Kreditnehmer: **max. 3 in Salesforce** (`Client_2__c`, `Client_3__c`, `Wie_viele_Kunden__c` 1/2/3) — bestätigt; weitere nur ins JSON.
- Partner-Liste: **live per API-Abfrage** bei Eingabe der Berater-E-Mail (der Integration-User darf Account + Contact lesen); 24h-Cache als Fallback. Kein täglicher Export.

### Partnerportal

**18 · Portal-Status:** **Angelegt: `Case.Portal_Status__c`** (Picklist, restricted, mit Feldhistorie) mit 11 benutzerfreundlichen Werten — siehe Abschnitt D.3. Die Herleitung aus Case + Opportunity übernimmt Salesforce selbst (zwei aktive Flows); **das Portal muss nur dieses eine Feld lesen.** «Abgelehnt» und «Finanzierung bestätigt» sind damit sauber abbildbar; «Verloren» sieht der Partner nie.

**19 · Dokumentstatus:** Eure Annahme ist fürs MVP akzeptiert. Mittelfristig setzt HYPOTEQ «Ungültig»/«Neu erforderlich» aktiv im Case (JSON-Update); das Portal liest dann daraus.

**20 · Adressen/Support-Box — final bestätigt:** Nur **info@hypoteq.ch** (siehe A.2). Kontaktbox: Partner Management, HYPOTEQ AG · **+41 44 554 41 00** · Erreichbarkeit: **«Telefonisch Mo–Fr, 09:30–16:30 · Meldungen rund um die Uhr (24/7)»**. **Kein Antwortzeit-Versprechen anzeigen** — die Zeile «Antwort innert 1 Arbeitstag» bitte entfernen.

**21 · Spezialfinanzierung:**
- RecordType **`Case.Spezialfinanzierung`** ist angelegt (der erste RecordType auf Case) und für den Integration-User freigeschaltet. RecordTypeId bitte zur Laufzeit per Describe/Query auflösen, nicht hardcoden.
- Queues **«Spezialfinanzierung»** und **«Web-Anfragen»** sind angelegt (beide mit E-Mail an Mitglieder).
- SLA 2 Arbeitstage: bestätigt.
- Tasks: Der Integration-User **darf jetzt Tasks anlegen** (Recht ergänzt am 18.10.).

**22 · Nachricht aus dem Case:** Betreff **«Portal-Nachricht · {Case-Nr} · {Kundenname}»**, An: info@hypoteq.ch, **Reply-To = E-Mail des Partners**, Case-Owner in CC. **Zusätzlich** (neu entschieden): die Nachricht als **abgeschlossene Aufgabe (Task) am Case loggen** — `WhatId` = Case, `Status` = Completed, `Subject` = «Portal-Nachricht: {Betreff/erste Worte}», voller Text in `Description`. So erscheint sie in der Aktivitäten-Timeline und unter «Letzte Updates» im Portal.

**23 · Logo & Foto:** Bestätigt wie umgesetzt — Logo pro Partnerfirma, Foto pro User, «powered by HYPOTEQ» bleibt.

**24 · Benachrichtigungen:** **Ja — automatische E-Mail an den Partner bei jedem Statuswechsel, der ihn betrifft.** Wir benachrichtigen zu Beginn so oft und so gut es geht. Welche Status eine Mail auslösen, steht in D.3. Die Mail-Texte liefern wir (siehe Frage 10). Versand löst Salesforce aus (Flow), sobald die Texte freigegeben sind.

**25 · Portal-Felder — alle angelegt (18.10.):** `Account.Portal_Access__c`, `Account.Portal_Visible__c`, `Account.Send_Notification__c` (Partner-Steuerung) und `Case.Partner_Action_Required__c` (wird vom Status-Flow automatisch gesetzt, wenn Dokumente fehlen).

**26 · Profil:** IBAN liegt in **`Account.IBAN_Nr__c`** (Text 50 — nicht IBAN__c), Partner-Nummer in **`Account.AccountNumber`**. Bitte Mapping korrigieren.

---

## C. Support-Reiter — Konzept bestätigt

Der Support-Reiter ist der Kanal für **Produkt-Feedback zum Portal** (Frage/Fehler/Wunsch), getrennt von der fachlichen Case-Nachricht (Frage 22). Ablauf bei «Meldung senden» — zwei Dinge parallel:

1. **E-Mail an info@hypoteq.ch** (Betreff: «Portal-Support · {Typ} · {Betreff}», bei Case-Bezug mit Case-Nr).
2. **Task in Salesforce** über den Integration-User: `Subject` = «Portal-Support: {Betreff}», `Description` = vollständige Beschreibung (+ Partner, Typ, ggf. technische Angaben), **`OwnerId` = Fisnik Salihu (`005TG000004Ogi9YAC`)**, Status Open; bei Case-Bezug `WhatId` = Case. Das Task-Erstellrecht hat der Integration-User bereits.

Der Ticket-Status im Portal (Eingegangen → In Prüfung → Behoben/Beantwortet) wird im Admin-Bereich gepflegt. Die Checkbox «Technische Angaben mitsenden» bitte so belassen (Browser/Seite/Version, keine Case-Daten). Kontaktbox gemäss Frage 20 — ohne Antwortzeit-Zeile.

---

## D. Neu in Salesforce seit 18.10. (produktiv, getestet)

### D.1 Neue Felder — alle für den Integration-User schreibbar

| Objekt | API-Name | Typ | Zweck |
|---|---|---|---|
| Case | `Renovationsbetrag__c` | Currency | Frage 4 |
| Case | `Geschaetzter_Objektwert__c` | Currency | Frage 17 |
| Case | `Kaufdatum_Datum__c` | Date | Frage 13 (parallel zum Textfeld) |
| Case | `Darlehen_Eigenmittel__c` | Currency | Eigenmittelquelle Darlehen (statt nur JSON) |
| Case | `Privatkredit__c` | Checkbox | Chip Privatkredit |
| Case | `Leasing__c` | Checkbox | Chip Leasing |
| Case | `Unterhaltspflicht__c` | Checkbox | Chip Unterhaltszahlungen |
| Case | `Solidarbuergschaft__c` | Checkbox | Chip Solidarbürgschaft |
| Case | `Portal_Status__c` | Picklist (11 Werte) | nur lesen — wird von Flows gesetzt |
| Case | `Partner_Action_Required__c` | Checkbox | nur lesen — wird von Flows gesetzt |
| Account | `Portal_Access__c` | Checkbox | Portal-Zugang aktiv |
| Account | `Portal_Visible__c` | Checkbox | Cases im Portal sichtbar |
| Account | `Send_Notification__c` | Checkbox | Partner erhält Status-Mails |

Die Chips bitte **zusätzlich zu den JSON-Antworten** in die Checkboxen schreiben (Auswertbarkeit).

### D.2 RecordType & Queues

- RecordType `Case.Spezialfinanzierung` (aktiv)
- Queues `Spezialfinanzierung` und `Web-Anfragen` (Case; der Mapping-Eintrag «Queue Web-Anfragen» funktioniert jetzt)

### D.3 Portal-Status: Werte, Herleitung, Mail-Trigger

`Portal_Status__c` wird von zwei aktiven Flows gesetzt (Case-Frühphase + Opportunity-Phasen). **Das Portal liest nur dieses Feld** und mappt es auf Badge/Timeline:

| Wert (exakt so in der Picklist) | Timeline | Auto-Mail an Partner |
|---|---|---|
| Anfrage eingegangen | 1 | ja (Eingangsbestätigung) |
| Unterlagen fehlen noch | 2 | ja |
| Wir prüfen die Unterlagen | 3 | nein |
| Anfrage wird für die Bank vorbereitet | 4 | nein |
| Bei der Bank in Prüfung | 5 | ja |
| Angebot liegt vor | 6 | ja |
| Kleine Nacharbeit nötig | 6 | ja |
| Finanzierung bestätigt | 6 | ja |
| Abgeschlossen | alle ✓ | ja |
| Leider abgelehnt | Hinweis statt Timeline | ja |
| Anfrage zurückgezogen | Hinweis statt Timeline | nein |

Abgelehnt vs. zurückgezogen unterscheidet Salesforce über den Verlust-Grund der Opportunity — im Portal ist keine Logik dafür nötig. `Partner_Action_Required__c` ist true, solange Dokumente fehlen (treibt «Aktion erforderlich» im Dashboard).

### D.4 Hinweis Case-Erstellung

`Case_Name__c` ist Pflichtfeld bei der Case-Erstellung (Format gemäss Mapping: «{Nachname} {Vorname} – {PLZ} {Ort}»).

---

## E. Neue Punkte aus dem Review der aktuellen Builds (19.10.)

1. **Profil → Sektion «Eigene Dokumente»: komplett entfernen.**
2. **Profil → «E-Mail-Benachrichtigungen» (die 4 Schalter): entfernen.** Es gibt kein Opt-out zu Beginn — benachrichtigt wird immer, die Auslöser sind zentral definiert (D.3). Steuerung liegt bei HYPOTEQ (`Account.Send_Notification__c`), nicht beim Partner.
3. **Passwort-Reset und Magic Link funktionieren nicht** — bitte fixen (siehe Frage 6).
4. **Auskunftsermächtigung:** Die AI-Prüfung (richtiges Formular, Unterschrift, Name) darf **nie blockieren**. Button «Trotzdem einreichen – HYPOTEQ prüft manuell» ergänzen; die AI-Einschätzung nur als Hinweis am Case vermerken.
5. **Sicherheit Preview-Umgebung:** Solange echte Daten im Build sind (vgl. A.3), muss der Login die echte Supabase-Auth sein — die Prototyp-Regel «beliebige E-Mail + 4 Zeichen» darf auf keiner erreichbaren URL mit echten Daten aktiv sein. Bitte kurz bestätigen.
6. **Konfidenzwerte** weiterhin pro Feld/Dokument ins JSON (`Dokumenten_Check_State__c`) schreiben — wir werten sie periodisch aus, um die Erkennung zu verbessern. Keine Zusatzarbeit nötig, nur beibehalten.

---

## F. Was als Nächstes von HYPOTEQ kommt

1. E-Mail-Textvorschläge für den kompletten Flow (DE zuerst, dann EN/FR/IT) — inkl. Status-Mails aus D.3.
2. Überarbeitete EN/FR/IT-Übersetzungen der i18n-Datei.
3. Homepage-Kalkulator-Parameter (Marco) zur späteren Formel-Vereinheitlichung.
4. Testdruck der Auskunftsermächtigungs-Vorlage (Frage 8).

Bei Fragen zu Salesforce-Feldern, Rechten oder den Status-Flows direkt an Fisnik — Änderungen daran sind innert Stunden möglich.
