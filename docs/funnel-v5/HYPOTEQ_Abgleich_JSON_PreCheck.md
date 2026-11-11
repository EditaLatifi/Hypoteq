# Abgleich-JSON für den Pre-Check — so liefert der Funnel

**Für:** Fisnik Salihu (HYPOTEQ) · **Von:** Edita Latifi · **Stand:** 05.11.2026 — das Format gilt als Vertrag zwischen Funnel und Salesforce (am Testfall HQ-26-11-093160 verifiziert)
**Bezug:** Spezifikation Datenabgleich v1.1 Kap. 6.2 · «Pre-Check und Rücklieferung» vom 03.11.2026 · Handover «Pre-Check-Felder» vom 04.11.2026

## 1. Format

Der Funnel schreibt das JSON in `Case.Funnel_Abgleich_State__c` **strikt nach dem Feldschlüssel-Mapping der Spezifikation (Kap. 6.2)**, wie von euch am 04.11. entschieden: `fields[]` mit `key`, `label`, `funnelValue`, `extracted[]`, `result`, `customerChoice`, `explanation`, dazu `summary` und `reuploads`.

Entsprechung der Ergebnisse für das Panel: `ok` = match · `conflict` und `identity_conflict` = conflict · `to_check` = unsicher (gelb) · `hint` = Hinweis nur für den Analysten · `unverified` = kein verwertbarer Dokumentwert.

## 2. Ergänzungen (additiv, es fällt nichts weg)

1. **`Funnel_Abgleich_Status__c = "Offen"`** beim Erstellen des Case; danach schreibt der Funnel das Feld nie mehr.
2. **`fields[].source`**: `funnel` · `chat` · `dokument`. `entry_channel: "chat"` wie bisher.
3. **`documents[]`**: pro Anforderung `typ` (Naming Convention), `requirement` (Schlüssel der Re-Upload-Schnittstelle), `code`, `label`, `person`, `benoetigt`, `erhalten`, `datei`/`dateien`, `status`; Dateien ausserhalb der Liste mit `kategorie` (`relevant` · `surplus` · `duplicate` · `notneeded` · `unknown`).
4. **Unterschrift als unsicheres Feld**: `fields[]` enthält `unterschrift_auskunftsermaechtigung` (`ok` oder `to_check` mit AI-Hinweis), die Auskunftsermächtigung in `documents[]` mit `unsicher: true`. Sie blockiert die Einreichung nie.
5. **`plausibility[]`**: die eine weiche Warnung, Belehnung über 100 % (`feld`, `code: "overValue"`, `hinweis`). Fehlt, wenn es keine gibt.
6. **`objektwert: { value, prefilled }`**: `prefilled: true`, wenn der Objektwert die Vorbelegung Kaufpreis + Renovation ist und der Kunde ihn nicht angefasst hat.

## 3. Beispiel (gekürzt)

Zwei Felder und vier Dokumente; Labels und Erklärungen sind auf DE gekürzt.

```json
{
  "version": 1,
  "submittedAt": "2026-11-04T10:00:00.000Z",
  "funnelPath": "begleitete_anmeldung",
  "submittedBy": "kunde",
  "rulesFrom": "salesforce",
  "fields": [
    {
      "key": "jahreseinkommen",
      "borrower": 1,
      "person": "Lea ZZTEST Muster",
      "label": { "de": "Jahreseinkommen" },
      "funnelValue": 120000,
      "source": "funnel",
      "extracted": [
        { "docType": "lohnausweis", "docId": "…", "value": 100000, "confidence": 0.95, "sourceRef": "Seite 1, Ziffer 8", "role": "primary", "ampel": "green", "field": "Bruttolohn" }
      ],
      "result": "conflict",
      "explanation": { "de": "Der Lohnausweis zeigt den Lohn ohne Bonus/Zulagen. …" }
    },
    {
      "key": "unterschrift_auskunftsermaechtigung",
      "label": { "de": "Unterschrift Auskunftsermächtigung" },
      "funnelValue": null,
      "source": "dokument",
      "extracted": [
        { "docType": "auskunftsermaechtigung", "docId": "…", "value": "fehlt", "confidence": 0.62, "sourceRef": null, "role": "primary", "ampel": "yellow", "field": "Unterschrift" }
      ],
      "result": "to_check",
      "explanation": { "de": "AI-Hinweis: Unterschrift nicht erkannt – manuell prüfen" }
    }
  ],
  "summary": { "ok": 0, "hint": 1, "conflict": 1, "identityConflict": 0, "toCheck": 1, "unverified": 3 },
  "documents": [
    { "typ": "Grundbuchauszug", "requirement": "grundbuch", "code": "O4", "label": { "de": "Aktueller Grundbuchauszug (max. 6 Monate)" }, "benoetigt": true, "erhalten": false, "datei": null, "status": "missing" },
    { "typ": "Auskunftsermaechtigung", "requirement": "vollmacht", "code": "P0", "label": { "de": "HYPOTEQ Auskunftsermächtigung" }, "person": "Lea ZZTEST Muster", "benoetigt": true, "erhalten": true, "datei": "HQ-26-11-000000_00_Auskunftsermaechtigung_ZZTEST-Muster-Lea_2026-11-04.pdf", "status": "ok", "hinweis": "AI-Hinweis: Unterschrift nicht erkannt – manuell prüfen", "unsicher": true },
    { "typ": "Lohnausweis", "requirement": "lohnausweise#b1", "code": "P2", "label": { "de": "Aktueller Lohnausweis – Lea ZZTEST Muster" }, "person": "Lea ZZTEST Muster", "benoetigt": true, "erhalten": true, "datei": "HQ-26-11-000000_01_Lohnausweis_ZZTEST-Muster-Lea_2025-12-31.pdf", "status": "ok" },
    { "typ": "Leasingvertrag", "requirement": null, "label": { "de": "Leasingverträge" }, "benoetigt": false, "erhalten": true, "datei": "HQ-26-11-000000_01_ZUSATZ_Leasingvertrag_ZZTEST-Muster-Lea_2024-06-05.pdf", "status": "extra", "kategorie": "relevant", "hinweis": "Von den Antworten nicht verlangt – fallrelevant, bitte prüfen." }
  ],
  "plausibility": [
    { "feld": "val", "code": "overValue", "hinweis": "Belehnung über 100 %: Hypothek CHF 1'100'000 höher als der Objektwert CHF 1'000'000 – der Kunde hat den Hinweis gesehen und weitergemacht." }
  ],
  "objektwert": { "value": 1000000, "prefilled": false },
  "reuploads": []
}
```

## 4. Umgesetzt nach euren Entscheiden vom 04.11.

1. **Format:** bleibt bei Kap. 6.2 (Abschnitt 1).
2. **Testfälle (seit 11.11. ohne ZZTEST):** jede Preview-Anfrage erzeugt ihren Case normal; HYPOTEQ kennt die Tester und löscht die Cases. Bis 10.11. galt der Namens-Match (Nachname ZZTEST und «+test»-Mailadresse); Nachreichung und Re-Upload schreiben im Testmodus nur auf Cases, die Salesforce als ZZTEST ausweist.
3. **Unterschrift, Name, Formular:** blockieren nie, gehen als Ampel in den Pre-Check. Harte Pflicht bleibt der Upload der Auskunftsermächtigung (oder «Später nachreichen» wie bisher).
4. **Beträge:** «Weiter» gesperrt nur bei Kaufpreis, Objektwert oder bestehender Hypothek unter CHF 10'000 / über CHF 100 Mio., bei Erhöhung, Renovation oder einer Eigenmittel-Zeile über CHF 100 Mio. und bei einer Hypothek über Objektwert plus Renovation. Einzige weiche Warnung: Belehnung über 100 %; sie steht als `hinweis` im JSON. Keine Einkommensgrenzen. Ohne Renovation (Ablösung) fällt «über 100 %» mit dem harten Stopp zusammen.
5. **Objektwert:** beim Kauf vorbelegt mit Kaufpreis + Renovation, editierbar; unverändert mit `prefilled: true` (Abschnitt 2.6). `Geschaetzter_Objektwert__c` bekommt den Wert.
6. **Betreibungsauszug:** im Funnel immer Pflicht — für jeden Kreditnehmer einer Privatperson und wie bisher für Firmen. Erneuerungen bestehender Kunden laufen intern in Salesforce.

**Stand 05.11.:** alles geklärt. Feldrecht für `Funnel_Abgleich_Status__c` ist gesetzt, E05 ist geschlossen, Befund 1 ist mit V99 behoben (die Unterschrift blockiert nie) und die Namensprüfung erkennt die Person jetzt auch auf dem älteren Formular mit getrennten Feldern «Vorname» / «Name».
