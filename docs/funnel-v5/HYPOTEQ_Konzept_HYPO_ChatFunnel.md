# Konzept «HYPO» — der Chat-Einstieg in den HYPOTEQ-Funnel

**Version 1.0 · 26.10.2026 · HYPOTEQ AG**
Ergänzung zur Spezifikation «Funnel Datenabgleich» v1.1 — alles dort Definierte (Feldschlüssel, Extraktions-Schema, Konfidenz-Ampel, Naming Convention, Abgleich-JSON) gilt unverändert und wird hier wiederverwendet.

> **Hinweis zur Fassung im Repository:** Der Beispiel-Partner in Kap. 4 ist durch einen fiktiven ersetzt («Max Beispiel von der Beispiel Agentur Bern»). Das Original liegt bei HYPOTEQ. Umsetzung und Ermessensentscheide: `DECISIONS.md` V92–V97.

---

## 1. Einordnung & Prinzipien

HYPO ist **kein neues Produkt**, sondern ein dritter Einstieg in den bestehenden Funnel — neben Schnellanmeldung und begleiteter Anmeldung. Das Gespräch endet in **derselben Zusammenfassungs- und Bestätigungsseite** wie die beiden bestehenden Wege und erzeugt **dasselbe JSON-Payload** Richtung Salesforce. Ab der Zusammenfassung sind alle drei Wege identisch.

Vier Prinzipien:

1. **Deterministisch geführt, KI-unterstützt.** Die Fragenstrecke ist die bestehende Funnel-Logik — fest definiert, vollständig, testbar. Das LLM erfindet keine Fragen und überspringt keine. Es wird nur an drei Stellen eingesetzt: (a) Freitext verstehen und in Feldschlüssel extrahieren, (b) Dokumente auslesen (bestehende Extraktion), (c) Fragen und Rückmeldungen natürlich formulieren.
2. **Jede Angabe wird bestätigt.** Extrahierte Werte gehen nie stillschweigend ins Dossier. Grün = kurz angezeigt und implizit bestätigt durch Weiterfahren; Gelb/Rot = aktive Rückfrage (gleiche Ampel-Logik wie im Datenabgleich, Schwellen 0.90 / 0.60).
3. **HYPO berät nicht.** Keine Zinssätze, keine Tragbarkeits-Zusagen, keine Produktempfehlungen. Die Antwort auf jede Beratungsfrage ist immer eine Variante von: «Das rechnet deine Beraterin / dein Berater für dich — genau dafür ist sie da.» Der menschliche Berater ist das Verkaufsargument, nicht die Schwäche des Bots.
4. **Freitext und Klick sind immer beide möglich.** Das Eingabefeld ist permanent aktiv. Chips sind Vorschläge, nie die einzige Antwortmöglichkeit. Die Extraktion läuft auf **jeder** Freitext-Nachricht, nicht nur der ersten.

## 2. Name & Persona

Der Assistent heisst **HYPO** — immer in Grossbuchstaben, in allen vier Sprachen identisch, wird nicht übersetzt (voller Auftritt: «HYPO — der HYPOTEQ Assistent»).

**Wortmarke:** In der geschriebenen Marke wird das **O als Smiley** gestaltet (lächelndes Gesicht im O — freundlich-technisch, kein Emoji aus dem Zeichensatz, sondern gezeichnetes Element im Funnel-Designsystem; Forest auf Lime bzw. invertiert). Das Smiley-O allein dient als Avatar im Chat-Header und als Tippindikator.

**Tonalität:** wie ein guter Hypothekarberater am Telefon — zugewandt, konkret, erklärt kurz *warum* er etwas fragt, nie belehrend, keine Floskeln, kein Smalltalk. Du-Form in DE (konsistent mit dem Funnel), vous/Lei in FR/IT, you in EN.

**Was HYPO nie tut:** Zins- oder Konditionsaussagen, Tragbarkeitsurteile («das können Sie sich leisten»), Bankempfehlungen, rechtliche/steuerliche Auskünfte, Smalltalk ausserhalb des Themas, sich als Mensch ausgeben. Auf die Frage «bist du ein Mensch?» antwortet HYPO ehrlich und positiv besetzt (Texte in Kap. 10).

**Avatar:** das Smiley-O aus der Wortmarke (kein menschliches Foto, kein Stock-Roboter). Ausgestaltung durch Edita im bestehenden Designsystem.

## 3. Platzierung & Einstieg

- **Funnel-Startseite:** HYPO als dritte Option neben den zwei Karten, platziert im rechten Bereich (Lime-Keil). Titel: «Erzähl uns dein Projekt.» Kein Popup, kein automatisches Aufklappen.
- **Website (hypoteq.com):** optionaler dezenter Einstiegspunkt («Beschreib dein Projekt — wir sagen dir sofort, was es braucht»), der in denselben Chat führt. Kein generisches Support-Chat-Widget, keine «Wie kann ich helfen?»-Blase.
- **Rotierende Beispiel-Prompts:** Vor der ersten Nachricht rotieren Beispiele als Platzhalter im Eingabefeld (~4 s, weicher Fade; stoppt bei Fokus/Tastendruck). Zusätzlich 2–3 klickbare Vorschlags-Chips, die den Text **ins Eingabefeld einsetzen** (editierbar), nicht direkt abschicken. Jedes Beispiel muss einen real existierenden Flow treffen (Kauf, Ablösung, Neubau, Objektwert unbekannt). Pro Sprache eigene, natürliche Beispiele (Kap. 10). Klicks auf Vorschläge werden getrackt (Intent-Statistik).

## 4. Rollen: Kunde, HYPOTEQ-Berater, Vermittler

HYPO kennt dieselben Rollen wie der Funnel-Toggle, plus Vermittler:

- **Kunde (Default).** Wer einfach lostippt, ist Kunde.
- **Vermittler / Vertriebspartner.** Beim Gesprächsstart steht unauffällig unter dem Eingabefeld ein stiller Chip: **«Ich bin Vermittler / Vertriebspartner»**. Kein aktives Abfragen bei allen Nutzern.
  - Der Chip **verschwindet nach der ersten Kundennachricht** (Freitext oder Chip-Antwort) — danach ist die Rolle implizit Kunde.
  - **Fangnetz:** Erkennt das LLM mitten im Gespräch Vermittler-Sprache («mein Kunde hat…», «ich reiche das für Familie X ein»), fragt HYPO einmal nach: «Erfasst du die Anfrage als Vermittler? Dann ordne ich sie dir zu.» Bei Ja: Wechsel in den Partner-Flow **ohne Verlust der bereits erfassten Angaben**.
  - Nach Klick/Bestätigung: HYPO fragt Name/Agentur und **matcht gegen die Sales-Partner-Accounts in Salesforce** (unscharfe Suche über Account-Name und Kontakt). Treffer → namentliche Begrüssung und Bestätigungsfrage («Du bist Max Beispiel von der Beispiel Agentur Bern?»). Kein Treffer → Neuaufnahme (Name, Agentur, E-Mail, Telefon) statt Abweisung.
  - Im Partner-Flow wechselt die Perspektive aller Fragen («Wie heisst dein Kunde?» statt «Wie heisst du?»), und das Feld **Sales Partner wird im entstehenden Case automatisch gesetzt** — die Datenlücke, die wir heute manuell flicken, entsteht damit gar nicht mehr.
- **HYPOTEQ-Berater:** erreichen HYPO über den bestehenden Berater-Toggle; Verhalten wie Vermittler-Flow, aber mit Owner-Zuordnung statt Sales-Partner.

**Datenschutz:** Keine automatische Erkennung über Cookies/Links in v1. Identifikation ausschliesslich durch Selbstauskunft. E-Mail-Abgleich erst, nachdem die Person ihre E-Mail selbst genannt hat.

## 5. Gesprächslogik

1. **Offene Eingangsfrage** («Erzähl mir kurz dein Projekt…»). Die Extraktion füllt aus dem Freitext alle erkennbaren Feldschlüssel (gleiches Schema wie Dokument-Extraktion: `value`, `confidence`, `source: "chat"`).
2. **Erkannt-Karte:** Nach jeder Freitext-Nachricht mit extrahierten Werten zeigt HYPO eine kompakte Karte «Aus deiner Nachricht erkannt» mit Ampel-Punkten. Grün wird nicht einzeln abgefragt; **Gelb/Rot löst genau eine gezielte Rückfrage aus** (nicht alle auf einmal).
3. **Lückenfüllung deterministisch:** Danach arbeitet HYPO die fehlenden Pflichtfelder der Funnel-Strecke in der definierten Reihenfolge ab — eine Frage pro Nachricht. Geschlossene Fragen bekommen Chips (ja/nein, Auswahl, Betragsvorschläge), offene Fragen nicht.
4. **Freitext schlägt Chip:** Antwortet jemand frei statt per Chip, wird die Antwort extrahiert und ggf. mehr als ein Feld gefüllt (inkl. Zusatzinfos wie Pensum, Bonus — diese landen in `Wichtige Zusatzinfos`).
5. **Fortschritt sichtbar:** Rechts (Desktop) bzw. oben einklappbar (Mobile) das **Dossier-Panel**: Fortschrittsbalken, gefüllte Felder mit Ampel, Dokumenten-Checkliste. Füllt sich live.
6. **Abbruch-Sicherheit:** «Weiter im Formular» ist jederzeit möglich — der Wechsel übernimmt alle erfassten Werte in den klassischen Funnel (gleiche Feldschlüssel, verlustfrei). Session-Wiederaufnahme wie beim bestehenden Funnel.

## 6. Kontext-Trigger

Definierte Situationen, in denen HYPO aktiv etwas anbietet (abschliessende Liste v1 — keine freien LLM-Angebote):

| Trigger | Reaktion |
|---|---|
| Objektwert/Kaufpreis unbekannt («weiss ich nicht», Neubau, Erbschaft) | Immobilienbewertung anbieten: «Kein Problem — wir haben eine Immobilienbewertung. Soll ich sie dir direkt mitbestellen?» Bei Ja: Flag im Payload (`bewertung_angefragt: true`), Objekt-Basisdaten (Adresse, Typ) werden erfasst. |
| Rolle = Vermittler bestätigt | Einmalig Academy anbieten: «Übrigens — wir haben neu die HYPOTEQ Academy. Soll ich dir den Registrierungslink mitgeben?» Link je Sprache konfigurierbar; keine Wiederholung im selben Gespräch. |
| Ablösung/Verlängerung erkannt | Direkt nach aktueller Bank, Restschuld und **Ablaufdatum** fragen (Ablaufdatum priorisiert — Dringlichkeit). |
| Säule 3a / PK als Eigenmittel erwähnt | Ein Satz Einordnung (zählt als Eigenmittel; Verpfändung vs. Bezug klärt der Berater) — keine Empfehlung. |
| Beratungsfrage (Zins, Tragbarkeit, «welche Bank?») | Standard-Umlenkung auf den Berater (Kap. 10), Frage wird als Notiz ins Dossier übernommen, damit der Berater sie beantworten kann. |
| Unverständliche/fremdsprachige Eingabe, 2× in Folge | Angebot: Sprache wechseln oder «weiter im Formular». |

## 7. Dokumente im Gespräch

- Upload jederzeit über permanenten Büroklammer-Button und kontextuelle Upload-Chips («Lohnausweis hochladen»).
- Jedes Dokument läuft sofort durch die bestehende Extraktion; Ergebnis als Karte «‹Dokument› ausgelesen» mit Ampel.
- **Konflikt Chat-Angabe vs. Dokument** wird sofort im Gespräch geklärt (gleiche Logik und Prüfmatrix wie Datenabgleich-Spezifikation Kap. 4): beide Werte anzeigen, Nutzer wählt. Bei «meine Angabe stimmt» werden beide Werte gespeichert (`customerChoice` wie definiert) — der Berater sieht die Abweichung.
- Benennung/Ablage nach bestehender Naming Convention (Spez. Kap. 8). Keine Pflicht, alles im Chat hochzuladen — fehlende Dokumente erscheinen auf der Bestätigungsseite als offene Punkte (wie bisher).

## 8. Abschluss

Wenn alle Pflichtfelder gefüllt sind (oder der Nutzer «abschliessen» wählt):

1. HYPO zeigt eine letzte kompakte Zusammenfassungs-Karte im Chat («bereit zum Senden»),
2. leitet dann auf die **bestehende Zusammenfassungs-/Prüfseite des Funnels** weiter (Spez. Kap. 2/3 — inkl. Abgleich-Ansicht bei Konflikten),
3. Absenden dort erzeugt Case + Dokumente + Mails **exakt wie heute**. Einziges Zusatzfeld im Payload: `entry_channel: "chat"` (+ ggf. `bewertung_angefragt`, Partner-Zuordnung).

Kein eigener Chat-Abschluss, keine zweite Bestätigungslogik.

## 9. Guardrails, Datenschutz, Technik

- **System-Leitplanken (hart, nicht promptbar):** keine Zins-/Konditions-/Tragbarkeitsaussagen; keine Bank-Nennungen als Empfehlung; keine Rechts-/Steuerauskunft; Antworten nur im Themenraum Hypothekaranfrage; maximale Antwortlänge begrenzt; Ausgaben gegen die Feldschlüssel-Whitelist validiert (das LLM kann nur definierte Felder schreiben).
- **Sichtbarer Hinweis** unter dem Eingabefeld (Kap. 10): Angaben werden bestätigt, bevor sie übernommen werden; keine Beratung im Chat.
- **Datenschutz:** Hinweis auf Datenschutzerklärung beim Start (ein Satz + Link, kein Consent-Blocker, da funktional notwendig); LLM-Verarbeitung in CH/EU-Region bzw. ohne Trainingsnutzung (Auftragsverarbeitung — Anbieterwahl Edita/HYPOTEQ gemeinsam); Chat-Verlauf wird dem Case als Transkript angehängt (interne Sichtbarkeit wie Funnel-Rohdaten), gegenüber dem Kunden nicht beworben.
- **Logging/Qualität:** jede Extraktion mit Konfidenz geloggt (wie Dokument-Extraktion); wöchentliche Stichprobe der Gelb/Rot-Fälle; Vorschlags-Klicks und Abbruchpunkte als Events.
- **Fallback:** LLM nicht erreichbar → HYPO degradiert automatisch auf reine Chip-Führung (deterministisch) mit Hinweis; Funnel bleibt immer verfügbar.

## 10. Texte (DE / EN / FR / IT)

Die Texte stehen wörtlich in `messages/funnel-v3/{de,en,fr,it}.json`, Namensraum `hypo` (Begrüssung `greet`, Beispiele `suggest.1–3`, Partner-Chip `partnerChip`, Fangnetz `offer.broker`, Immobilienbewertung `offer.bewertung`, Academy `offer.academy`, Beratungs-Umlenkung `advice`, «Bist du ein Mensch?» `human`, Hinweis `notice`, Abschluss `done`). Die Fragen, Karten und übrigen Sätze, die das Konzept nicht vorgibt, sind im selben Namensraum ergänzt (DECISIONS V93).

---

## Offene Punkte (Entscheid HYPOTEQ)

1. **Academy-Link** je Sprache (URL) und ob die Registrierung im Chat aufgenommen oder nur verlinkt wird (v1: nur Link).
2. **Immobilienbewertung:** nur Flag im Payload oder direkte Bestellung mit eigenem Prozess? (v1: Flag + Berater löst aus.)
3. **LLM-Anbieter/Hosting** (CH/EU, keine Trainingsnutzung) — Vorschlag von Edita erbeten.
4. Referenz-Design: klickbare HTML-Vorschau existiert intern (Dialogführung, Erkannt-Karten, Dossier-Panel, Konflikt-Klärung) — Design-Umsetzung im bestehenden Funnel-Designsystem durch Edita.
