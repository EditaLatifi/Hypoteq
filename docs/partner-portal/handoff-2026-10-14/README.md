# Handoff: HYPOTEQ Partnerportal (MVP)

Anleitung für die Entwicklung (Edita). Stand: 14.10.2026.

## 1. Überblick
Ein geschütztes Portal für die **Vertriebspartner** von HYPOTEQ (unabhängige Hypothekarberater). Partner sehen dort den Status ihrer Finanzierungsanfragen (Cases), laden fehlende Dokumente hoch, laden freigegebene Dokumente herunter und schicken Nachrichten an HYPOTEQ. Sie können auch Spezialfinanzierungen einreichen und Support- oder Feedback-Meldungen erfassen. HYPOTEQ-Admins schalten Partner frei, ordnen ihnen Cases zu und sehen ein Audit Log.

**Systemgrenzen (Annahme MVP):**
- **Salesforce** ist das führende System für Partner, Cases, Status und Dokumentenlisten. Das Portal liest diese Daten und schreibt nur Uploads, Nachrichten, Änderungsanträge, Support-Meldungen und Spezialfinanzierungen zurück.
- **Supabase** übernimmt Auth (Passwort, Magic Link/OTP), Sessions, Storage für Uploads und das Audit Log.
- Standardfinanzierungen laufen weiterhin über den bestehenden **Funnel**, mit der Partner-ID als Parameter.

## 2. Über die Design-Dateien
Die Dateien in diesem Paket sind **Design-Referenzen in HTML**: ein klickbarer Prototyp mit dem gewünschten Aussehen und Verhalten. Sie sind **kein Produktionscode**. Die Aufgabe ist, diese Screens in der Zielumgebung nachzubauen (z. B. Next.js/React + Supabase) und dabei deren Patterns und Libraries zu verwenden. Alle Daten im Prototyp sind Demo-Daten im Speicher.

**Prototyp öffnen:** `HYPOTEQ Partnerportal – Prototyp (offline).html` per Doppelklick öffnen. Die Datei läuft ohne Internet und ohne Server.
- Partner-Login: beliebige E-Mail und ein Passwort mit mindestens 4 Zeichen.
- Admin-Login: E-Mail auf `@hypoteq.` oder der Link «Prototyp: als HYPOTEQ Administrator anmelden».
- Die Aktivierungsseite erreicht man über «Aktivierungsseite ansehen».

## 3. Fidelity
**High-fidelity.** Farben, Typografie, Abstände, Copy und Interaktionen sind final gemeint. Bitte pixelgenau umsetzen, mit dem HYPOTEQ Design System (Tokens in `design-tokens/`).

## 4. Screens

### Authentifizierung
| Screen | Zweck | Wichtig |
|---|---|---|
| Login | E-Mail und Passwort | Fehlertext unter dem Passwortfeld; «Passwort vergessen?»; «Magic Link senden» |
| Zugang aktivieren | Erster Login nach Einladung durch einen Admin | Wahl: Passwort definieren (min. 10 Zeichen, 1 Zahl, Wiederholung muss übereinstimmen) oder Magic Link/OTP. Datenschutz und Nutzungsbedingungen müssen akzeptiert sein. Der Button bleibt bis dahin deaktiviert. |
| Angaben bestätigen | Schritt 2 der Aktivierung | Name, Firma und Telefon aus Salesforce vorbefüllt und editierbar; E-Mail gesperrt (= Login) |
| Passwort zurücksetzen / E-Mail gesendet | Reset und Magic Link | Link 30 bzw. 15 Min. gültig. Keine Aussage darüber, ob das Konto existiert. |
| Sitzung abgelaufen | Nach 30 Min. Inaktivität | |

**Layout Login:** Vollflächig `#0A130D`. Links Logo, Headline und Footer; rechts eine Karte (max. 440 px, Radius 24 px, Hintergrund `linear-gradient(160deg, rgba(30,52,38,.9), rgba(15,27,20,.94))`, Border `1px rgba(255,255,255,.1)`, `backdrop-filter: blur(18px)`). Dazu ein Lime-Keil rechts (22 % Breite, `clip-path: polygon(64% 0,100% 0,100% 100%,30% 100%)`) und ein sehr schwacher Lime-Glow (12 %). Ab ca. 880 px Breite wird das Layout einspaltig.

### Partnerportal (Shell)
- **Sidebar** (Desktop ≥ 900 px, 250 px, `#0A130D`):
  - Logo, bzw. das **Partnerlogo**, sobald eines hochgeladen ist. Darunter «Partnerportal» bzw. «Partnerportal · powered by HYPOTEQ».
  - Navigation: Dashboard, Cases, Spezialfinanzierung, Meldungen, Support, Profil.
  - Tool-Kacheln, die in einem neuen Tab öffnen:
    - **Immo-Bewertung** → `https://hypoteq-hedonic.wuestappraisal.com/`
    - **HYPOTEQ Academy** → `https://hypoteq.talentlms.com/plus/login`
  - User-Block mit «Abmelden».
- **Header** (sticky):
  - Globale Suche «Antragsteller suchen – Vor- oder Nachname». Treffer bei Wortanfang von Vor- oder Nachname, Teilstring oder Case-Nummer; max. 6 Treffer mit Status-Badge. Enter öffnet den 1. Treffer, Esc schliesst.
  - Button «Neue Finanzierung starten», Glocke mit Zähler für ungelesene Meldungen, Avatar.
- **Mobile** (< 900 px): Die Suche ist eine eigene Zeile im Header. Unten gibt es eine Bottom-Navigation mit 5 Einträgen (Support ist über Dashboard und Profil erreichbar). Touch-Ziele sind ≥ 44 px.

### Dashboard
1. Begrüssung und Satz «N Anfragen benötigen Ihre Aufmerksamkeit».
2. **Aktion erforderlich** (Lime-Fläche, nur wenn nötig). Eine Zeile pro Case:
   - Kunde · Case-Nr.
   - Max. **2 Dokument-Chips** plus ein Chip «+ N weitere».
   - Rechts die Anzahl fehlender Dokumente (28 px bold), ein Fortschrittsbalken «x von y vorhanden» und der Button «Case öffnen».
   - Die ganze Zeile ist klickbar.
3. KPI-Kacheln: Offen, In Bearbeitung, Dokumente fehlen, Bei Kreditgeber, Abgeschlossen. Ein Klick öffnet die Case-Übersicht mit diesem Filter.
4. **Ihr Portfolio:** Volumen in Bearbeitung, Finanziert 2026, Ø Finanzierungsbetrag, Ø Durchlaufzeit, Dokumenten-Quote. Beträge im Schweizer Format: `CHF 4.06 Mio.`, `CHF 850'000`.
5. Aktuelle Cases (5 neueste offene).
6. Tools & Ressourcen: Immo-Bewertung, Academy, Support & Feedback.

### Case Übersicht
- Filter-Pills: Alle, Offen, Dokumente fehlen, In Bearbeitung, Bei Kreditgeber, Abgeschlossen.
- Suche nach Name oder Case-Nr.
- Sortierung nach Datum oder Status (erneut klicken kehrt die Richtung um).
- Zeilen: Kunde, Art/Betrag, Status-Badge, Hinweis auf fehlende Dokumente, «Case öffnen».

### Case Detail (Reihenfolge ist wichtig)
1. Zurück-Link; Eyebrow mit Nr · Art; Kundenname (H1); Status-Badge und letzte Aktualisierung. Buttons: «Objekt bewerten» (öffnet die Immo-Bewertung) und «Case Zusammenfassung» (PDF).
2. **Timeline «Bearbeitungsstand» direkt unter dem Namen.** 7 Schritte: Anfrage eingegangen → Dokumente werden geprüft → Unterlagen vollständig → Finanzierungsanfrage vorbereitet → An Kreditgeber übermittelt → Rückmeldung erhalten → Finanzierung abgeschlossen.
   - Desktop: 7 Spalten mit `minmax(0,1fr)`. Lange Wörter haben weiche Trennstellen (`&shy;`), `hyphens: manual`.
   - Mobile: vertikal.
   - Bei «Abgelehnt» oder «Storniert» erscheint ein Hinweis statt Fortschritt.
3. **Aktion erforderlich:** die fehlenden Dokumente mit Status und dem Button «Dokument hochladen».
4. Links: Dokumente nach Kategorie (mit Fortschrittsbalken) und freigegebene Dokumente zum Download.
   Rechts: Case Übersicht (Fakten), Letzte Updates, **Nachricht senden**.
   - **Die Nachricht geht als E-Mail an `info@hypoteq.com`**, mit Case-Nr und Kundenname im Betreff. Das steht so im UI.
   - Zusätzlich erscheint die Nachricht unter «Letzte Updates».
   - Der Button heisst «Als E-Mail senden».
5. **Upload-Dialog:**
   - Drag & Drop oder Dateiauswahl; erlaubt sind PDF, JPG, JPEG und PNG bis max. 20 MB.
   - Fehlermeldungen für Format und Grösse; Fortschrittsbalken.
   - Danach Dokumentstatus «Hochgeladen», ein Eintrag in den Updates und ein Toast.

### Spezialfinanzierung (neu)
**Einstieg:** Der Button «Neue Finanzierung starten» öffnet einen Auswahl-Dialog:
- **Standardfinanzierung** → Weiterleitung in den bestehenden Funnel mit Partner-ID. Läuft unter der Partnervereinbarung.
- **Spezialfinanzierung** → Erfassung im Portal. Wird individuell geprüft.

Ausserdem gibt es den Nav-Eintrag «Spezialfinanzierung».

**Hinweis-Box** (immer sichtbar), Copy:
> Spezialfinanzierungen werden von HYPOTEQ einzeln beurteilt und fallen nicht unter die bestehende Partnervereinbarung. Machbarkeit, Konditionen und Vergütung vereinbaren wir pro Fall separat. Wir melden uns innert 2 Arbeitstagen bei Ihnen.

**Wizard (5 Schritte, Stepper oben; man kann nur auf bereits gültige Schritte zurückspringen):**
1. **Art:** Mezzanine-Finanzierung, Bauprojekt/Baukredit, Renditeobjekt, Gewerbeliegenschaft, Überbrückung, Andere. Pflicht.
2. **Endkunde:**
   - Privatperson/Unternehmen.
   - Name bzw. Firma (Pflicht).
   - Wohnort/Sitz, Kontakt und Eigenmittel (optional).
3. **Vorhaben:**
   - Betrag in CHF (Pflicht, ≥ 4 Ziffern) und Objekt/Standort.
   - Zeitrahmen.
   - **Beschreibung als Freitext** (Pflicht, min. 20 Zeichen).
4. **Dokumente:**
   - Mehrfach-Upload (PDF/JPG/PNG/XLSX, max. 20 MB pro Datei), einzeln entfernbar.
   - Je nach Art werden hilfreiche Unterlagen als Chips vorgeschlagen.
   - Optional; fehlende Unterlagen können später im Case nachgereicht werden.
5. **Prüfen & senden:** Zusammenfassung und eine Pflicht-Checkbox («… individuell geprüft … nicht unter die bestehende Partnervereinbarung»).

**Absenden:**
- Erzeugt einen neuen Case mit Art `Spezialfinanzierung · <Typ>` und Status «Neue Anfrage». Die Uploads hängen als Dokumente am Case.
- Schreibt einen Audit-Eintrag, zeigt einen Toast und öffnet den Case.
- **Backend:** Salesforce-Case mit RecordType «Spezialfinanzierung», Benachrichtigung an das Team, Files als ContentVersion bzw. Supabase Storage.

### Meldungen
Liste mit Ungelesen-Punkt. Ein Klick markiert die Meldung als gelesen und öffnet den Case. «Alle als gelesen markieren». Dazu eine Vorschau der **E-Mail-Benachrichtigung** (enthält keine sensiblen Daten, nur Kunde und Aktion).

### Support & Feedback
- Formular:
  - Typ: Frage, Fehler oder Wunsch.
  - Optional ein Case-Bezug; Betreff und Beschreibung sind Pflicht.
  - Checkbox «Technische Angaben mitsenden».
- Rechts: Ansprechpartner (Name, Telefon, partner@hypoteq.com, Zeiten) und «Ihre Meldungen» mit Status (Eingegangen, In Prüfung, Behoben, Beantwortet).

### Profil
- **Profilfoto:** Upload per Klick auf den Avatar, max. 2 MB. Wird auch in der Sidebar und im Header angezeigt.
- **Partnerdaten** (aus Salesforce, **nur lesen**):
  - Die Daten sind nicht direkt editierbar. «Änderung beantragen» und das Stift-Symbol pro Zeile öffnen einen Dialog: Feld, aktueller Wert, neuer Wert, Bemerkung.
  - Der Antrag erscheint unter «Änderungsanträge» mit Status «In Prüfung».
  - Backend: Task/Case in Salesforce.
- **Firmenlogo:**
  - Upload (PNG/SVG/JPG, max. 2 MB) mit Live-Vorschau.
  - Schalter «Auf hellem Hintergrund anzeigen» (weisse Plakette für dunkle Logos); Logo ersetzen oder entfernen.
  - **Ist ein Logo gesetzt, ersetzt es das HYPOTEQ-Logo in der Sidebar und im Mobile-Header.** Das gilt für alle User dieses Partners.
- **Eigene Dokumente:** Firmenunterlagen (Handelsregisterauszug, Registereintrag, Verträge) mit Status.
- E-Mail-Benachrichtigungen (4 Schalter); Sicherheit (letzter Login, Passwort ändern, Abmelden).

### Zugriff verweigert (403)
Wird angezeigt, wenn ein Partner einen fremden Case aufruft. **Die Prüfung muss serverseitig passieren (RLS), nicht nur im UI.** Der Versuch wird protokolliert.

### Administration (Rolle Admin)
- **Vertriebspartner:**
  - KPIs nach Portal-Status und Filter.
  - Aktionen: Aktivieren & einladen (legt Supabase-User an und sendet die Einladung), Einladung erneut senden, Deaktivieren, Reaktivieren.
- **Partner Detail:**
  - Mapping: Salesforce Account ID ↔ Supabase User ID.
  - Salesforce-Portalfelder (`Portal_Access__c`, `Portal_Visible__c`, `Portal_Status__c`, `Partner_Action_Required__c`, `Send_Notification__c`).
  - Cases zuordnen und entfernen.
- **Audit Log:** Zeit, Person, Aktion, Referenz. Ohne sensible Inhalte.

## 5. Status-Mapping
Case-Status → Badge-Ton → Timeline-Schritt (0-basiert):
- Neue Anfrage → neutral → 0
- Dokumente ausstehend → warning → 1
- Dokumente vollständig, In Prüfung → info → 2
- Bereit für Kreditgeber → info → 3
- Bei Kreditgeber → info → 4
- Rückmeldung erhalten → accent → 5
- Nachbearbeitung notwendig → warning → 5
- Finanzierung bestätigt → success → 5
- Abgeschlossen → success → alle erledigt
- Abgelehnt, Storniert → danger → keine Timeline, nur Hinweis

Dokument-Status: Vorhanden (success), Fehlt (danger), In Prüfung (info), Ungültig (danger), Neu erforderlich (warning), Hochgeladen (accent).
«Aktion erforderlich» gilt, wenn ein Dokument den Status Fehlt, Ungültig oder Neu erforderlich hat **und** der Case nicht abgeschlossen, abgelehnt oder storniert ist.

## 6. Datenmodell (Vorschlag)
- `partner` (sf_account_id, supabase_user_id, name, firma, email, telefon, portal_access, logo_url, logo_on_light, photo_url)
- `case` (sf_case_id, partner_id, nr, kunde, art, betrag, objekt, status, created_at, updated_at, is_special, special_type, special_payload jsonb)
- `case_document` (case_id, kategorie, name, status, note, file_url, uploaded_at)
- `case_update` (case_id, date, text, author)
- `message` (case_id, partner_id, body, sent_to = 'info@hypoteq.com', sent_at)
- `change_request` (partner_id, field, old_value, new_value, note, status)
- `support_ticket` (partner_id, type, case_id?, subject, body, tech_info jsonb, status)
- `partner_document` (partner_id, name, file_url, status)
- `notification` (partner_id, case_id, title, text, read_at)
- `audit_log` (ts, actor, action, ref)

**Sicherheit:**
- RLS: Ein Partner sieht nur Zeilen mit eigener `partner_id`.
- Downloads nur über signierte URLs.
- Uploads serverseitig prüfen (MIME-Typ, Grösse, Virenscan empfohlen).
- Sessions laufen nach 30 Min. Inaktivität ab.

## 7. Design Tokens (Auszug, vollständig in `design-tokens/`)
- **Farben:**
  - Brand: Forest `#132219`, Lime `#CAF476`, Weiss `#FFFFFF`.
  - Flächen: `#0A130D` (Sidebar/Login), `#132219` (Seite), `#1A2E20` (Karten).
  - Lime-Hover `#B7E455`, Active `#9CC93B`.
- **Text auf Dunkel:** Weiss 100 % / 70 % (Sekundärtext, **keine Grautöne**) / 45 % (Labels). Hairlines `rgba(255,255,255,.14)`, Flächen-Tint `rgba(255,255,255,.08)`.
- **Status:** success `#2F8F52`, warning `#C98A16`, danger `#B23B34`, info `#2F6B8F`.
- **Schrift:** SF Pro Display (Dateien in `design-tokens/fonts.css`, OTFs liefert das DS).
  - H1: 44 px (clamp 30–44) Bold, Tracking −0.02em.
  - Lead: 21 px Medium; Body: 17 px; Sekundär: 15 px; Caption: 13 px; Eyebrow: 13 px UPPERCASE, Tracking .08em, Lime.
- **Radien:** 8 (klein), 12 (Karten, Inputs), 16, 24 (Login-Karte), 999 (Buttons, Pills).
- **Fokus:** `0 0 0 3px rgba(202,244,118,.55)`.
- **Motion:** 180 ms ease-out für Zustände; Einblenden 420 ms (Fade + 10 px nach oben). Kein Bounce, kein Skalieren.
- **Formate:** CHF mit Apostroph (`CHF 850'000`), Datum `TT.MM.JJJJ`, Prozent mit Leerzeichen (`35 %`).
- **Icons:** Lucide (Outline, 1.75–2 px), Lime auf Dunkel. Keine Emoji.

## 8. Assets
- `assets/logos/`: HYPOTEQ-Wortmarke weiss/schwarz und Favicon. Mindestbreite 120 px, ® immer behalten.
- Icons: Lucide (`lucide.dev`).
- Fotos: keine.

## 9. Dateien
- `HYPOTEQ Partnerportal – Prototyp (offline).html`: der vollständige, klickbare Prototyp.
- `source/HYPOTEQ Partnerportal.dc.html`: Quelle des Prototyps zum Nachlesen von Copy, Abständen und Logik. Im Block `class Component` stehen Demo-Daten, Status-Mapping, Validierungen und Handler.
- `design-tokens/`: CSS-Variablen des HYPOTEQ Design Systems.
- `assets/logos/`: Logos.

## 10. Offen / zu klären
- Genauer Betreff und Template der Case-E-Mail an info@hypoteq.com (Reply-To = Partner?).
- Salesforce-RecordType und Queue für Spezialfinanzierungen sowie die SLA von 2 Arbeitstagen bestätigen.
- Ob «powered by HYPOTEQ» unter dem Partnerlogo bleiben soll.
- Ob Logo und Foto pro Partner-Firma oder pro User gelten.
