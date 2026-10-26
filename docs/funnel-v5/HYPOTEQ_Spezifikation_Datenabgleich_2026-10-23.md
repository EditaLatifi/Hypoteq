# HYPOTEQ Funnel — Spezifikation Datenabgleich, Schritt-4-Redesign & Re-Upload

**Für:** Edita Latifi
**Von:** Fisnik Salihu (HYPOTEQ)
**Stand:** 23.10.2026 · Version 1.1
**Hinweis:** Alle Layouts sind in diesem Dokument textlich beschrieben. Gestaltung und Komponenten gemäss bestehendem Funnel-Designsystem (Karten, Pills, Badges, Buttons wie heute). Alle kundenseitigen Texte liegen in Kapitel 10 in DE/EN/FR/IT vor.

> **Fassung im Repository:** unverändert bis auf die Objekt-Adresse im Namensbeispiel (Kap. 8.1), die durch die fiktive «Musterweg-1-Zuerich» ersetzt ist. Umsetzung blockweise in der Reihenfolge Kap. 2 → Kap. 3+4 → Kap. 5 (Mail Fisnik, 23.10.2026); Stand der Umsetzung in DECISIONS.md.

---

## 1. Ziel & Prinzipien

Der Funnel vergleicht künftig die **Eingaben des Kunden** mit den **aus den Dokumenten extrahierten Werten** und macht Abweichungen sichtbar — für den Kunden im Funnel (letzte Seite) und für unsere Analysten in Salesforce.

Leitprinzipien:

1. **KI extrahiert, Code vergleicht.** Die KI liest pro Dokumenttyp definierte Felder aus (strukturiert, mit Fundstelle und Konfidenz). Der Vergleich Funnel vs. Dokument läuft deterministisch nach der Prüfmatrix (Kap. 4) — reproduzierbar und testbar, kein LLM-Entscheid.
2. **Funnel-Eingaben sind führend.** Extraktionswerte überschreiben **nie** automatisch einen Funnel-Wert. Sie erzeugen nur Abgleich-Resultate.
3. **Mensch bestätigt.** Der Kunde klärt Abweichungen im Funnel, unsere Analysten bestätigen final in Salesforce. Jeder übernommene Wert hat eine dokumentierte Quelle.
4. **Kein Hard-Block ausser Identität.** Nur ein Identitäts-Konflikt (Dokument gehört nicht zur erfassten Person) blockiert den Abschluss. Alles andere kann der Kunde per Auswahl klären.

---

## 2. Schritt-4-Redesign (Unterlagen & Abschluss)

Aufbau der Seite von oben nach unten: (1) Upload-Bereich — unverändert, (2) Vollständigkeits-Karte — unverändert, (3) **neu:** Angaben-Zusammenfassung, (4) Dokument-Sektionen — neu zugeklappt, (5) Abschlussblock — umgebaut. Änderungen im Detail:

### 2.1 Angaben-Zusammenfassung nach dem Upload

Direkt **unter der Vollständigkeits-Karte** (vor den Dokument-Sektionen) kommt der Block **«Deine Angaben aus dem Fragepfad»**: kompakte Boxen pro Themenblock —
Anfrage (Art, Personentyp), Objekt (Art, PLZ/Ort, Nutzung), Finanzierung (Kaufpreis, Eigenmittel, Hypothekarbedarf), pro Person (Name, Erwerbsstatus, Einkommen), Tragbarkeit & Belehnung (berechnet).
Layout: Raster aus kompakten Karten (gleiches Karten-Styling wie die Dokument-Karten), pro Karte oben ein Label in Versalien + «Bearbeiten»-Link rechts, darunter der Hauptwert fett, darunter eine Detailzeile. Jede Box hat einen **«Bearbeiten»**-Link zurück in den jeweiligen Funnel-Schritt. Nach dem Ändern kehrt der Nutzer zu Schritt 4 zurück; bereits hochgeladene Dokumente und Erkennungen bleiben erhalten.

### 2.2 Aufklappbare Dokument-Sektionen

Die Sektionen («Zum Objekt», «Zur Person [Name]», «Weitere Dateien») sind **standardmässig zugeklappt**. Der Sektionskopf zeigt immer: Titel, Kurzinfo, Fortschritt (z. B. «5 / 10») und Badges («1 zu prüfen»). Sektionen mit offenen Punkten dürfen optional automatisch aufgeklappt starten. Zustand (auf/zu) muss beim Zurückkehren über den Magic-Link nicht persistiert werden.

### 2.3 «Nicht benötigt» wird Teil von «Weitere Dateien»

Die bisherige eigene Kategorie «Nicht benötigt» entfällt. Diese Dokumente wandern in die Sektion **«Weitere Dateien»** und behalten dort ihr Etikett (ÜBERZÄHLIG bzw. NICHT BENÖTIGT) **inklusive Begründung** (z. B. «nur nötig bei Lohnerhöhung im laufenden Jahr»). Verhalten unverändert: bleiben im Dossier, zählen nicht zur Vollständigkeit.

### 2.4 Abschlussblock

Im grünen Abschlussblock:

- **Links, prominent:** eine weisse, gerahmte Karte **«Fall-Dossier herunterladen»** mit PDF-Icon, Titel, Umfangsangabe (Anzahl Unterlagen, ca. Dateigrösse) und dunklem Download-Button. Die Karte ist optisch das dominante Element des Blocks.
- **Rechts:** Button **«Finanzierungsanfrage abschliessen →»**, darunter in klein: «Danach prüft HYPOTEQ den Fall durch — du wirst per E-Mail informiert.»

### 2.5 Bestätigungsseite nach dem Abschluss

Nach «Abschliessen» **keine** Weiterleitung zur Homepage, sondern eine eigene Bestätigungsseite:

- Erfolgsmeldung mit Fallbezeichnung.
- **Nächste Schritte** als 3 Punkte: (1) Fall-Durchsicht durch HYPOTEQ, Rückmeldung innert 1 Arbeitstag, (2) Bankanfrage bei passenden Finanzierungspartnern, (3) fehlende Unterlagen nachreichen — mit Anzahl und Hinweis, dass der Link aus der Bestätigungsmail jederzeit zurück zur Upload-Übersicht führt.
- Buttons: **«Fall-Dossier herunterladen (PDF)»** (primär) und «Zur HYPOTEQ-Startseite» (sekundär).

---

## 3. Abgleich-Seite für den Kunden (letzter Schritt vor dem Absenden)

Eigene Seite vor dem Absenden. Aufbau von oben nach unten: Titel + Lead (nennt die Anzahl Unterschiede), dann **eine Karte pro Konflikt**, danach eine Sammelkarte **«Bestätigte Angaben»** (kompakte Zeilenliste Feld → Wert mit grünem Haken), unten «Zurück» (sekundär) und der primäre Absenden-Button. Nur Felder mit Resultat **Konflikt** oder **Identitäts-Konflikt** werden als Karten gezeigt.

Layout einer Konflikt-Karte: Titel = Feldname + Badge «Unterschied gefunden»; darunter **zwei nebeneinanderliegende, klickbare Pills** — links «Ihre Eingabe im Formular» mit Wert, rechts «Laut [Dokument]» mit Wert und Link «Dokument ansehen →»; die gewählte Pill ist markiert (Rahmen + Haken), Funnel-Wert vorausgewählt; darunter eine Erklärbox mit dem Kundenhinweis (Kap. 10.5).

Pro Konflikt-Karte:

- Beide Werte als klickbare Pills: «Ihre Eingabe im Formular» vs. «Laut [Dokument]», Funnel-Wert vorausgewählt.
- Kundenfreundliche Erklärung, warum die Abweichung entstehen kann (aus Kap. 4, Spalte «Kundenhinweis»).
- Link «Dokument ansehen →» öffnet den Dokument-Viewer mit der Extraktion (bestehende Ansicht).
- Die Wahl des Kunden wird als `customerChoice` gespeichert (Kap. 6) — sie **ändert den Funnel-Wert**, der Originalwert bleibt protokolliert.

Identitäts-Konflikt-Karte (Sonderfall): bietet zwei Aktionen — **«[Name] als 2. Kreditnehmer/in erfassen»** (springt in den Personen-Schritt) oder **«Richtiges Dokument hochladen»**. Der Absenden-Button bleibt gesperrt, bis alle Konflikt-Karten geklärt sind; Fussnote erklärt das.

Sprachen: DE/EN/FR/IT wie der restliche Funnel.

---

## 4. Prüfmatrix

Vergleichslogik pro Feld. **Primärquelle** = massgebendes Dokument; Abweichung ⇒ **Konflikt**. **Sekundärquelle** = Plausibilisierung; Abweichung ⇒ **Hinweis** (nur intern/Analyst, kein Kunden-Konflikt). Konfidenz der Extraktion < 0.8 ⇒ Status **Zu prüfen** statt Konflikt.

**Normalisierung vor jedem Vergleich:** Trim, Gross-/Kleinschreibung, Umlaute/Akzente (é=e), Bindestrich-/Doppelnamen (enthält-Vergleich), Zahlen ohne Tausendertrennzeichen, Daten als ISO.

| Funnel-Feld | Primärquelle | Sekundärquellen | Regel / Toleranz | Kundenhinweis bei Abweichung |
|---|---|---|---|---|
| Vorname, Nachname (pro Kreditnehmer) | Pass / ID | Lohnausweis, Steuererklärung, Betreibungsauszug | Normalisiert exakt; Teilmatch bei Doppelnamen OK. **Kein Match ⇒ Identitäts-Konflikt (Hard Stop)** | «Das Dokument lautet auf einen anderen Namen — falsches Dokument oder zweite/r Kreditnehmer/in?» |
| Geburtsdatum | Pass / ID | Pensionskassenausweis | exakt | — |
| Nationalität / Aufenthaltsbewilligung | Pass / ID / Ausländerausweis | — | exakt (Kategorie) | — |
| Jahreseinkommen (brutto) | Lohnausweis (Ziffer 8 Bruttolohn; Jahr = letztes abgeschlossenes) | Monatslohnabrechnungen (×12/13 hochgerechnet), Steuererklärung | Toleranz ±5 %; grösser ⇒ Konflikt. Sekundär ±15 % ⇒ Hinweis | «Der Lohnausweis zeigt den Lohn ohne Bonus/Zulagen. Falls Ihr Einkommen inkl. Bonus höher ist, wählen Sie Ihre Eingabe und laden Sie optional einen Bonusnachweis hoch.» |
| Einkommen selbständig | Erfolgsrechnung (Ø letzte 3 Jahre, Geschäftsgewinn) | Steuererklärung | Toleranz ±10 % | «Massgebend ist der Durchschnitt der letzten Geschäftsjahre.» |
| Renteneinkommen | Rentenbescheinigung (PK/AHV) | Steuererklärung | Toleranz ±5 % | — |
| Eigenmittel total | Kontoauszüge (Summe) + 3a-Nachweise + PK-Bezug | Steuererklärung (Wertschriftenverzeichnis) | Toleranz ±10 % auf die Summe; nur unterschreitend ⇒ Konflikt (mehr Eigenmittel als angegeben ist kein Konflikt) | «Guthaben aus Säule 3a oder Pensionskasse sind auf dem Kontoauszug evtl. nicht enthalten.» |
| davon Säule 3a | 3a-Auszug | — | Toleranz ±5 % | — |
| davon PK-Vorbezug | PK-Ausweis (verfügbarer WEF-Bezug) | — | eingegeben ≤ verfügbar, sonst Konflikt | «Der PK-Ausweis zeigt einen tieferen verfügbaren Betrag.» |
| davon Schenkung / Darlehen / Erbvorbezug | Schenkungs-/Darlehens-/Erbvertrag | — | Toleranz ±5 % | — |
| Kaufpreis | Kaufvertrag (auch Entwurf) | Reservationsvertrag, Verkaufsdokumentation | exakt; Abweichung ⇒ Konflikt | «Massgebend ist der Kaufvertrag — stimmt die Version?» |
| Objekt-Adresse / PLZ-Ort | Grundbuchauszug | Kaufvertrag, Gebäudeversicherung, Verkaufsdoku | Normalisiert exakt (Strasse+Nr+PLZ) | «Die Dokumente nennen eine andere Adresse — richtiges Objekt hochgeladen?» |
| Bestehende Hypothek (Ablösung): Betrag | Aktuelle Produktvereinbarung / Hypothekarvertrag | Steuererklärung (Schuldenverzeichnis) | Toleranz ±2 % | — |
| Mietzins (Rendite-Objekt) | Mieterspiegel (Netto-Soll-Mietzins p. a.) | Steuererklärung | Toleranz ±5 % | — |
| Unterhaltszahlungen / Leasing / Kredite (Verpflichtungen) | jeweiliger Vertrag / Vereinbarung | Steuererklärung, Betreibungsauszug | Toleranz ±5 %; **im Dokument gefundene, im Funnel NICHT erfasste Verpflichtung ⇒ Hinweis an Analyst** | — |
| Baujahr / Kubatur | Gebäudeversicherungspolice | Verkaufsdoku | Baujahr exakt, Kubatur ±10 % | — |

**Wichtig — Richtung des Abgleichs:** Auch Dokument-Funde **ohne** Funnel-Eingabe werden gemeldet (z. B. Leasingrate in den Lohnabrechnungen sichtbar, aber kein Leasing erfasst). Diese erscheinen nicht beim Kunden, sondern nur als **Hinweis** im Analysten-JSON.

### 4.1 Extraktions-Prompts (pro Dokumenttyp)

Ein Prompt pro Dokumenttyp, versioniert, mit festem Output-Schema:

```json
{
  "docType": "lohnausweis",
  "promptVersion": "1.2",
  "fields": [
    {"key": "nachname", "value": "Mustermann", "confidence": 0.98, "sourceRef": "Seite 1, Feld A"},
    {"key": "bruttolohn", "value": 100000, "confidence": 0.95, "sourceRef": "Seite 1, Ziffer 8"},
    {"key": "nettolohn", "value": 80000, "confidence": 0.95, "sourceRef": "Seite 1, Ziffer 11"},
    {"key": "jahr", "value": 2025, "confidence": 0.99, "sourceRef": "Kopfzeile"}
  ]
}
```

Strukturierte Extraktion ist für **alle Dokumenttypen der Anforderungsliste** umzusetzen (das Tool ist im Aufbau — keine Alt-Ausnahmen). Regeln: nur definierte Keys, keine freien Interpretationen; `confidence` pro Feld; `sourceRef` menschenlesbar (für «Dokument ansehen»-Sprung). Zahlen als Zahl, Daten ISO. Was die KI nicht findet, fehlt im Output (kein Raten).


### 4.2 Konfidenz als Ampel

Pro extrahiertem Feld wird die Konfidenz als **Ampel** angezeigt (Analysten-Ansichten und Dokument-Detail; beim Kunden nur indirekt über die Konflikt-Logik):

| Ampel | Bedeutung | Schwelle (Startwerte, konfigurierbar) |
|---|---|---|
| 🟢 Grün | sicher erkannt — Wert wird normal abgeglichen | ≥ 0.90 |
| 🟡 Gelb | erkannt, aber bitte prüfen — Feld wird als «zu prüfen» markiert, nie als Konflikt gewertet | 0.60 – 0.89 |
| 🔴 Rot | unsicher / nicht erkannt — Wert wird nicht für den Abgleich verwendet | < 0.60 |

Es leuchtet nur die zutreffende Stufe. **Hover/Tap auf die Ampel** zeigt eine Erklärung (Text in Kap. 10.3): Es handelt sich um ein Wahrscheinlichkeitsmodell — die HYPOTEQ-Technologie ist gut, bleibt aber immer auf den Menschen angewiesen.

### 4.3 Toleranzen & Regeln als Konfiguration (Pflege in Salesforce)

Die Prüfmatrix (Toleranzen, Primär-/Sekundärquellen, Ampel-Schwellen, aktiv/inaktiv pro Regel) wird **nicht im Funnel-Code hart codiert**, sondern als Konfiguration in Salesforce gepflegt — dort, wo HYPOTEQ sie selbst nachjustieren kann (gleiches Muster wie die bestehende Cockpit-Konfiguration, z. B. Jahresgebühr-Betrag):

- HYPOTEQ stellt ein Konfigurations-Objekt bereit (eine Zeile pro Regel: Feld-Key, Primärquelle, Sekundärquellen, Toleranz %, Schwellen, aktiv).
- Der Funnel liest die Konfiguration über die bestehende API-Anbindung (Integration-User), **cacht sie** (z. B. 15 Min.) und hat die Startwerte aus Kap. 4 als eingebauten Fallback, falls die API nicht erreichbar ist.
- Änderungen an Toleranzen brauchen damit kein Funnel-Deployment.

---

## 5. Re-Upload-Flow

Auslöser: Analyst klickt in Salesforce «Re-Upload anfordern» (oder Kunde wählt im Funnel «Richtiges Dokument hochladen» — dann ohne Mail, direkt Upload).

1. **Dialog mit vorbereiteter E-Mail** (Sprache gemäss Fall): Empfänger-Logik — begleitete Anmeldung ⇒ Partner, Direktkunde ⇒ Kunde. Text editierbar, Versand via info@hypoteq.ch.
2. Mail enthält den **Magic-Link** auf die Upload-Seite; dort steht die Anforderung wieder auf **FEHLT** mit Grund («Neues Dokument angefordert: …»). Das alte Dokument wird **nicht gelöscht**, sondern nach «Weitere Dateien» verschoben.
3. **Erinnerungen automatisch** nach Tag 2 und Tag 5 ohne Upload — gleiche Mechanik wie die AE-Erinnerungen M4/M5, nur zwei neue Textbausteine (alle 4 Sprachen).
4. Nach neuem Upload: Extraktion läuft erneut, Abgleich aktualisiert sich, Salesforce erhält das aktualisierte JSON (Kap. 6); offener Task wird systemseitig geschlossen.

---

## 6. Schnittstelle zu Salesforce

### 6.1 Grundsatz

Wie bisher: Case-Erstellung mit den **Funnel-Werten** (führend). **Neu zusätzlich** ein Abgleich-JSON pro Case — Transport analog Dokumenten-Check-State (Feld-Update via Integration-User). Feldname wird von HYPOTEQ bereitgestellt (Long Text, z. B. `Funnel_Abgleich_State__c`).

### 6.2 JSON-Struktur

```json
{
  "version": 1,
  "submittedAt": "2026-10-23T09:14:00Z",
  "funnelPath": "schnellanmeldung",
  "fields": [
    {
      "key": "jahreseinkommen",
      "label": {"de": "Jahreseinkommen", "en": "Annual income", "fr": "Revenu annuel", "it": "Reddito annuo"},
      "funnelValue": 100000,
      "extracted": [
        {"docType": "lohnausweis", "docId": "…", "value": 80000, "confidence": 0.95, "sourceRef": "Ziffer 8", "role": "primary"},
        {"docType": "steuererklaerung", "docId": "…", "value": 94000, "confidence": 0.9, "sourceRef": "Einkünfte", "role": "secondary"}
      ],
      "result": "conflict",            // ok | hint | conflict | identity_conflict | unverified | to_check
      "customerChoice": {"value": 100000, "chosenSource": "funnel", "at": "2026-10-23T09:12:40Z"},
      "explanation": {"de": "…", "en": "…", "fr": "…", "it": "…"}
    }
  ],
  "summary": {"ok": 9, "hint": 1, "conflict": 2, "identityConflict": 0, "toCheck": 1},
  "reuploads": [
    {"requirement": "pass_id_kn1", "requestedAt": null, "resolvedAt": null}
  ]
}
```

- `customerChoice` dokumentiert, was der Kunde auf der Abgleich-Seite gewählt hat; der gewählte Wert ist zugleich der übermittelte Funnel-Wert.
- `result` ist das Resultat **nach** der Kundenwahl (geklärte Konflikte ⇒ `ok`, mit `customerChoice` als Beleg).
- Hinweise (`hint`) und Dokument-Funde ohne Funnel-Eingabe erscheinen nur hier, nicht beim Kunden.

### 6.3 Was HYPOTEQ-seitig damit passiert (nur zur Info)

Salesforce zeigt das JSON in einem eigenen Analysten-Panel «Daten-Review» auf dem Case: Feld für Feld bestätigen, Konflikte mit Erklärung, Re-Upload-Button, Audit-Protokoll. Erst die Analysten-Bestätigung schreibt Werte verbindlich. Baut HYPOTEQ selbst — von Edita wird nur das JSON gemäss 6.2 benötigt.

---

## 7. Mailtexte (neu, 4 Sprachen)

1. **Re-Upload-Anforderung** (variabler Grund-Baustein pro Anforderung).
2. **Re-Upload-Erinnerung** Tag 2 / Tag 5 (analog M4/M5).

Alle Texte liegen fertig in **Kapitel 10** vor (DE/EN/FR/IT). Versand und Header-Logik wie bestehende Funnel-Mails.


## 8. Automatisches Re-Naming der Dokumente

Hochgeladene Dateien ohne sprechenden Namen (`Scan_123.pdf`, `Image_4711.jpg`) werden beim Klassifizieren automatisch umbenannt. Der Klassifikations-Schritt der Extraktion liefert Dokumenttyp, Person und Dokumentdatum — daraus wird der Name gebaut.

### 8.1 Naming Convention

```
HQ-<FallNr>_<Kat>_<Dokumenttyp>_<Person-oder-Objekt>_<Dokumentdatum>.pdf
```

Beispiele:
- `HQ-01234_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf`
- `HQ-01234_03_Grundbuchauszug_Musterweg-1-Zuerich_2026-01-15.pdf`
- `HQ-01234_01_ZUSATZ_Leasingvertrag_Mustermann-Max_2024-06-05.pdf`

| Baustein | Inhalt | Regeln |
|---|---|---|
| `HQ-<FallNr>` | Fall-Nummer | eindeutige Zuordnung, auch ausserhalb des Systems |
| `<Kat>` | `00` HYPOTEQ-Formulare · `01` Kreditnehmer 1 · `02` Kreditnehmer 2 · `03` Objekt · `04` Finanzierung/bestehende Hypothek | sortiert das Dossier thematisch; `ZUSATZ` als Marker für Überzähliges/Nicht Benötigtes (wie heute) |
| `<Dokumenttyp>` | kanonischer Name aus der Anforderungsliste (z. B. `Lohnausweis`, `Grundbuchauszug`) | nie der Original-Dateiname; stammt aus der Klassifikation |
| `<Person-oder-Objekt>` | `Nachname-Vorname` bei Personendokumenten, `Strasse-Nr-Ort` beim Objekt | macht Dossiers mit 2 Kreditnehmern eindeutig |
| `<Dokumentdatum>` | ISO `JJJJ-MM-TT` — das Datum **des Dokuments** (Lohnausweis-Jahr, Ausstellungsdatum), Fallback: Upload-Datum | am Ende platziert, unterscheidet Versionen |

### 8.2 Technische Regeln

- Zeichensatz nur `A-Za-z0-9-_`; Umlaute transkribieren (ä→ae), keine Leerzeichen; max. ~100 Zeichen.
- Mehrere Dokumente gleichen Typs: Suffix `_2`, `_3`.
- **Originalname bleibt gespeichert** und in der UI sichtbar («Original: …», wie heute).
- «Namen ändern» bleibt als manuelle Korrektur erhalten; manuelle Namen werden nicht automatisch überschrieben.
- Das Fall-Dossier-PDF übernimmt die Reihenfolge `<Kat>` → `<Dokumenttyp>` → `<Dokumentdatum>`.

---

## 9. Fall-Dossier-PDF (Feedback 23.10.2026)

Änderungen am generierten Fall-Dossier:

1. **Dateiname beim Speichern:** `HYPOTEQ Fall-Dossier – <Vorname Nachname>.pdf` (z. B. `HYPOTEQ Fall-Dossier – Max Mustermann.pdf`). Hinweis: kein Doppelpunkt im Dateinamen (unter Windows unzulässig), darum Gedankenstrich.
2. **Kein «Entwurf» im Dokument** — nirgends: weder als Badge auf dem Cover, noch in der Kopfzeile («FALL-DOSSIER · ENTWURF · …»), noch im Footer («Entwurf · Datum»). Datum bleibt, nur ohne den Zusatz.
3. **Footer:** statt `hypoteq.ch` → **HYPOTEQ**.
4. **Sektion «Verlauf» entfernen.**
5. **Annex-Einleitungstext ersetzen:** Der technische Satz («… erkannt, zugeordnet und ausgelesen. Jede Anforderung zeigt ihre Herkunft (Trigger-Antwort) …») entfällt. Neu schlicht: **«Folgende <ANZAHL> Dokumente stehen zum Hypothekarfall zur Verfügung.»** (Anzahl = alle mitgeführten Dokumente; Formulierung in allen 4 Sprachen analog.)
6. **Vollständigkeits-Balken am Schluss entfernen.**

---

## 10. Alle Texte in DE / EN / FR / IT

Platzhalter: `{vorname}`, `{nachname}`, `{dokument}` (Anforderungsname in Fallsprache), `{grund}` (Baustein), `{link}` (Magic-Link), `{n}` (Anzahl), `{nameDok}` / `{nameAntrag}` (Namen beim Identitäts-Konflikt), `{fall}` (Fallbezeichnung).

### 10.1 Mail: Re-Upload-Anforderung

**DE** — Betreff: `Ihre Finanzierungsanfrage – ein Dokument wird neu benötigt`
> Guten Tag {vorname} {nachname}
>
> Wir haben Ihre Unterlagen geprüft. Beim Dokument **«{dokument}»** gibt es einen Punkt zu klären: {grund}
>
> Bitte laden Sie das Dokument über folgenden Link neu hoch – es dauert nur eine Minute: {link}
>
> Vielen Dank und freundliche Grüsse
> Ihr HYPOTEQ-Team

**EN** — Subject: `Your financing request – one document needs to be re-uploaded`
> Dear {vorname} {nachname}
>
> We have reviewed your documents. One item needs clarification for **"{dokument}"**: {grund}
>
> Please re-upload the document via the following link – it only takes a minute: {link}
>
> Thank you and kind regards
> Your HYPOTEQ team

**FR** — Objet : `Votre demande de financement – un document doit être rechargé`
> Bonjour {vorname} {nachname}
>
> Nous avons examiné vos documents. Un point est à clarifier concernant **«{dokument}»** : {grund}
>
> Merci de recharger le document via le lien suivant – cela ne prend qu'une minute : {link}
>
> Merci et meilleures salutations
> Votre équipe HYPOTEQ

**IT** — Oggetto: `La sua richiesta di finanziamento – un documento deve essere ricaricato`
> Buongiorno {vorname} {nachname}
>
> Abbiamo esaminato i suoi documenti. Per il documento **«{dokument}»** c'è un punto da chiarire: {grund}
>
> La preghiamo di ricaricare il documento tramite il seguente link – richiede solo un minuto: {link}
>
> Grazie e cordiali saluti
> Il suo team HYPOTEQ

*Partner-Variante (begleitete Anmeldung): gleiche Texte, Anrede an den Partner, erster Satz: DE «Zum Fall {fall} haben wir die Unterlagen geprüft.» / EN "We have reviewed the documents for case {fall}." / FR «Nous avons examiné les documents du dossier {fall}.» / IT «Abbiamo esaminato i documenti della pratica {fall}.»*

### 10.2 Mail: Erinnerungen (Tag 2 / Tag 5)

**DE** — Betreff Tag 2: `Erinnerung: ein Dokument fehlt noch` · Tag 5: `Zweite Erinnerung: Ihre Finanzierungsanfrage wartet`
> Guten Tag {vorname} {nachname}
>
> Für Ihre Finanzierungsanfrage fehlt noch das Dokument **«{dokument}»**. Sobald es vorliegt, können wir mit der Bankanfrage weiterfahren.
>
> Hier hochladen: {link}
>
> Freundliche Grüsse, Ihr HYPOTEQ-Team

**EN** — Subject day 2: `Reminder: one document is still missing` · day 5: `Second reminder: your financing request is waiting`
> Dear {vorname} {nachname}
>
> The document **"{dokument}"** is still missing for your financing request. As soon as we receive it, we can proceed with the bank enquiry.
>
> Upload here: {link}
>
> Kind regards, your HYPOTEQ team

**FR** — Objet jour 2 : `Rappel : un document manque encore` · jour 5 : `Deuxième rappel : votre demande de financement est en attente`
> Bonjour {vorname} {nachname}
>
> Le document **«{dokument}»** manque encore pour votre demande de financement. Dès réception, nous pourrons poursuivre la demande auprès des banques.
>
> Charger ici : {link}
>
> Meilleures salutations, votre équipe HYPOTEQ

**IT** — Oggetto giorno 2: `Promemoria: manca ancora un documento` · giorno 5: `Secondo promemoria: la sua richiesta di finanziamento è in attesa`
> Buongiorno {vorname} {nachname}
>
> Per la sua richiesta di finanziamento manca ancora il documento **«{dokument}»**. Non appena lo riceveremo, potremo procedere con la richiesta alle banche.
>
> Caricare qui: {link}
>
> Cordiali saluti, il suo team HYPOTEQ

### 10.3 UI-Texte: Abgleich-Seite (Kap. 3)

| Element | DE | EN | FR | IT |
|---|---|---|---|---|
| Titel | Fast geschafft – bitte prüfen Sie Ihre Angaben | Almost done – please review your details | Presque terminé – veuillez vérifier vos données | Quasi fatto – verifichi i suoi dati |
| Lead | Wir haben Ihre Eingaben mit den hochgeladenen Dokumenten verglichen. Bei {n} Angaben gibt es Unterschiede – bitte wählen Sie den korrekten Wert. | We compared your entries with the uploaded documents. {n} entries differ – please select the correct value. | Nous avons comparé vos saisies avec les documents chargés. {n} données diffèrent – veuillez choisir la valeur correcte. | Abbiamo confrontato i suoi dati con i documenti caricati. {n} dati differiscono – scelga il valore corretto. |
| Badge Konflikt | Unterschied gefunden | Difference found | Différence constatée | Differenza riscontrata |
| Badge OK | Stimmen überein | Matching | Concordant | Corrispondenti |
| Pill links | Ihre Eingabe im Formular | Your entry in the form | Votre saisie dans le formulaire | La sua indicazione nel modulo |
| Pill rechts | Laut {dokument} | According to {dokument} | Selon {dokument} | Secondo {dokument} |
| Link Dokument | Dokument ansehen → | View document → | Voir le document → | Vedi documento → |
| Karte Bestätigte | Bestätigte Angaben | Confirmed details | Données confirmées | Dati confermati |
| Button gesperrt (Fussnote) | Bitte klären Sie zuerst die markierten Unterschiede, dann können Sie absenden. | Please resolve the highlighted differences first, then you can submit. | Veuillez d'abord clarifier les différences signalées, puis vous pourrez envoyer. | Chiarisca prima le differenze segnalate, poi potrà inviare. |
| Button | Angaben bestätigen & absenden | Confirm details & submit | Confirmer les données & envoyer | Confermare i dati e inviare |
| Identitäts-Karte Text | Das hochgeladene Dokument lautet auf {nameDok} – Ihr Antrag auf {nameAntrag}. | The uploaded document is issued to {nameDok} – your application is in the name of {nameAntrag}. | Le document chargé est au nom de {nameDok} – votre demande au nom de {nameAntrag}. | Il documento caricato è intestato a {nameDok} – la sua richiesta a {nameAntrag}. |
| Identitäts-Aktion 1 | {nameDok} als 2. Kreditnehmer/in erfassen | Add {nameDok} as 2nd borrower | Ajouter {nameDok} comme 2e emprunteur/-euse | Aggiungere {nameDok} come 2° mutuatario/a |
| Identitäts-Aktion 2 | Richtiges Dokument hochladen | Upload the correct document | Charger le bon document | Caricare il documento corretto |
| Ampel-Hover (Kap. 4.2) | Automatische Erkennung durch ein Wahrscheinlichkeitsmodell. Die HYPOTEQ-Technologie ist gut – bleibt aber immer auf den Menschen angewiesen. Bitte Wert prüfen. | Automatic recognition by a probability model. HYPOTEQ's technology is good – but always relies on a human. Please verify the value. | Reconnaissance automatique par un modèle probabiliste. La technologie HYPOTEQ est performante – mais repose toujours sur l'humain. Veuillez vérifier la valeur. | Riconoscimento automatico tramite un modello probabilistico. La tecnologia HYPOTEQ è valida – ma si affida sempre all'essere umano. Verifichi il valore. |

### 10.4 UI-Texte: Bestätigungsseite (Kap. 2.5)

| Element | DE | EN | FR | IT |
|---|---|---|---|---|
| Titel | Anfrage eingereicht – vielen Dank! | Request submitted – thank you! | Demande envoyée – merci ! | Richiesta inviata – grazie! |
| Lead | Ihr Fall {fall} ist bei HYPOTEQ eingegangen. Eine Bestätigung mit dem Link zu dieser Übersicht ist unterwegs an Ihre E-Mail. | Your case {fall} has been received by HYPOTEQ. A confirmation with the link to this overview is on its way to your e-mail. | Votre dossier {fall} a bien été reçu par HYPOTEQ. Une confirmation avec le lien vers cet aperçu vous est envoyée par e-mail. | La sua pratica {fall} è stata ricevuta da HYPOTEQ. Una conferma con il link a questa panoramica è in arrivo via e-mail. |
| Schritt 1 | Fall-Durchsicht durch HYPOTEQ – bei Rückfragen melden wir uns innert 1 Arbeitstag. | Case review by HYPOTEQ – we will contact you within 1 working day if we have questions. | Examen du dossier par HYPOTEQ – nous vous contactons sous 1 jour ouvrable en cas de questions. | Verifica della pratica da parte di HYPOTEQ – in caso di domande la contattiamo entro 1 giorno lavorativo. |
| Schritt 2 | Bankanfrage bei den passenden Finanzierungspartnern. | Bank enquiry with the suitable financing partners. | Demande auprès des partenaires de financement appropriés. | Richiesta alle banche partner più adatte. |
| Schritt 3 | Fehlende Unterlagen nachreichen – der Link in der E-Mail führt jederzeit hierher zurück. | Submit missing documents – the link in the e-mail brings you back here at any time. | Compléter les documents manquants – le lien dans l'e-mail vous ramène ici à tout moment. | Inviare i documenti mancanti – il link nell'e-mail la riporta qui in qualsiasi momento. |
| Button 1 | Fall-Dossier herunterladen (PDF) | Download case dossier (PDF) | Télécharger le dossier (PDF) | Scaricare il dossier (PDF) |
| Button 2 | Zur HYPOTEQ-Startseite | Go to HYPOTEQ homepage | Vers la page d'accueil HYPOTEQ | Alla homepage HYPOTEQ |

### 10.5 Kundenhinweise der Prüfmatrix (Erklärboxen)

| Fall | DE | EN | FR | IT |
|---|---|---|---|---|
| Einkommen (Lohnausweis) | Der Lohnausweis zeigt den Lohn ohne Bonus/Zulagen. Falls Ihr Einkommen inkl. Bonus höher ist, wählen Sie Ihre Eingabe und laden Sie optional einen Bonusnachweis hoch. | The salary certificate shows the salary without bonus/allowances. If your income incl. bonus is higher, select your entry and optionally upload proof of bonus. | Le certificat de salaire indique le salaire sans bonus/indemnités. Si votre revenu bonus compris est plus élevé, choisissez votre saisie et chargez si possible un justificatif. | Il certificato di salario indica il salario senza bonus/indennità. Se il suo reddito incluso bonus è più alto, scelga la sua indicazione e carichi facoltativamente una prova del bonus. |
| Einkommen (selbständig) | Massgebend ist der Durchschnitt der letzten Geschäftsjahre. | The average of the last business years is decisive. | La moyenne des derniers exercices est déterminante. | Fa stato la media degli ultimi esercizi. |
| Eigenmittel | Guthaben aus Säule 3a oder Pensionskasse sind auf dem Kontoauszug evtl. nicht enthalten. | Pillar 3a or pension fund assets may not appear on the account statement. | Les avoirs du pilier 3a ou de la caisse de pension ne figurent pas forcément sur le relevé de compte. | Gli averi del pilastro 3a o della cassa pensioni potrebbero non figurare sull'estratto conto. |
| PK-Vorbezug | Der PK-Ausweis zeigt einen tieferen verfügbaren Betrag. | The pension fund statement shows a lower available amount. | Le certificat de caisse de pension indique un montant disponible inférieur. | Il certificato della cassa pensioni indica un importo disponibile inferiore. |
| Kaufpreis | Massgebend ist der Kaufvertrag – stimmt die Version? | The purchase agreement is decisive – is this the correct version? | Le contrat de vente est déterminant – est-ce la bonne version ? | Fa stato il contratto di compravendita – è la versione corretta? |
| Objekt-Adresse | Die Dokumente nennen eine andere Adresse – wurde das richtige Objekt hochgeladen? | The documents state a different address – was the correct property uploaded? | Les documents indiquent une autre adresse – le bon bien a-t-il été chargé ? | I documenti indicano un altro indirizzo – è stato caricato l'immobile corretto? |
| Identität | Das Dokument lautet auf einen anderen Namen – falsches Dokument oder zweite/r Kreditnehmer/in? | The document is issued to a different name – wrong document or a second borrower? | Le document est au nom d'une autre personne – mauvais document ou deuxième emprunteur/-euse ? | Il documento è intestato a un'altra persona – documento sbagliato o secondo/a mutuatario/a? |

### 10.6 Annex-Satz Fall-Dossier (Kap. 9)

| Sprache | Text |
|---|---|
| DE | Folgende {n} Dokumente stehen zum Hypothekarfall zur Verfügung. |
| EN | The following {n} documents are available for this mortgage case. |
| FR | Les {n} documents suivants sont disponibles pour ce dossier hypothécaire. |
| IT | I seguenti {n} documenti sono disponibili per questa pratica ipotecaria. |

---

*Nichts aus dieser Spezifikation löscht bestehende Funktionen; alle Änderungen sind additiv zum heutigen Schritt 4. Bei Fragen direkt an Fisnik.*
