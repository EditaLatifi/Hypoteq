# Abgleich-JSON für den Pre-Check — so liefert der Funnel

**Für:** Fisnik Salihu (HYPOTEQ) · **Von:** Edita Latifi · **Stand:** 04.11.2026
**Bezug:** Spezifikation Datenabgleich v1.1 Kap. 6.2 · «Pre-Check und Rücklieferung» vom 03.11.2026 · Handover «Pre-Check-Felder» vom 04.11.2026

## 1. Bitte zuerst prüfen: die Feldnamen

Der Funnel schreibt das JSON in `Case.Funnel_Abgleich_State__c` **nach Kap. 6.2 der Spezifikation** (so seit 26.10. umgesetzt). Euer Handover vom 04.11. (Kap. 3) beschreibt andere Namen. Wenn euer Prüf-Panel auf das synthetische JSON von HQ-ZZTEST (Case 00001478) gebaut ist, zeigt es echte Fälle womöglich leer an.

| Inhalt | Der Funnel liefert (Kap. 6.2) | Handover 04.11., Kap. 3 |
|---|---|---|
| Wert aus dem Funnel | `fields[].funnelValue` | `funnel.value` |
| Wert aus dem Dokument | `fields[].extracted[]` mit `value`, `confidence`, `sourceRef`, `docType`, `docId`, `role`, `ampel` | `dokument.value`, `confidence`, `source_doc` |
| Ergebnis | `fields[].result`: `ok` · `hint` · `conflict` · `identity_conflict` · `to_check` · `unverified` | `status`: `match` · `conflict` · `unsicher` |
| Erklärung | `fields[].explanation` (DE/EN/FR/IT) | `hinweis` |
| Wahl des Kunden | `fields[].customerChoice` (ein Objekt pro Feld) | `customerChoice[]` (Liste) |
| Dokumentstatus | `documents[]` (neu, siehe 2.3) | `documents[]` |

Entsprechung der Ergebnisse: `ok` = match · `conflict` und `identity_conflict` = conflict · `to_check` = unsicher (gelb) · `hint` = Hinweis nur für den Analysten · `unverified` = kein verwertbarer Dokumentwert.

**Echtes Beispiel im Org:** Case **00001459** (HQ-26-10-639165, «Max ZZTEST Muster») trägt das JSON so, wie der Funnel es schreibt. Bitte öffnet diesen Case im Prüf-Panel.

**Bitte entscheidet:** Liest das Panel die Namen aus Kap. 6.2 (dann ändert sich bei uns nichts), oder sollen wir die Namen aus dem Handover zusätzlich mitliefern? Beides geht. Die bisherigen Namen bleiben dabei bestehen, damit nichts bricht.

## 2. Was seit dem 03./04.11. dazugekommen ist

Alle Ergänzungen kommen zu den bisherigen Feldern hinzu, es fällt nichts weg.

1. **`Funnel_Abgleich_Status__c = "Offen"`** wird beim Erstellen des Case gesetzt, zusammen mit dem JSON. Danach schreibt der Funnel das Feld nie mehr: Nachreichung und Re-Upload aktualisieren nur das JSON.
2. **`fields[].source`** pro Feld: `funnel` (im Formular eingegeben), `chat` (in HYPO beantwortet), `dokument` (aus einem Dokument vorbelegt, auf der Abgleich-Seite übernommen, oder ein Feld ohne Funnel-Angabe wie Baujahr). `entry_channel: "chat"` wie bisher.
3. **`documents[]`**: ein Eintrag pro Anforderung der Fallliste, danach jede Datei ausserhalb der Liste:
   - `typ`: Name nach Naming Convention, bis zur gemeinsamen Taxonomie
   - `requirement`: genau der Schlüssel, den eure Re-Upload-Schnittstelle annimmt; `null` ausserhalb der Liste
   - `code`, `label` (4 Sprachen), `person`
   - `benoetigt`: laut Soll-Logik; `false` für optionale Anforderungen und Dateien ausserhalb der Liste
   - `erhalten`
   - `datei` / `dateien`: gespeicherte Dateinamen
   - `status`: `missing` · `analysing` · `partial` · `ok` · `outdated` · `skipped`; `extra` ausserhalb der Liste
   - `kategorie` (nur ausserhalb der Liste): `relevant` · `surplus` · `duplicate` · `notneeded` · `unknown`
   - `hinweis`, `unsicher`
4. **Unterschrift als unsicheres Feld:** `fields[]` enthält `unterschrift_auskunftsermaechtigung`. Das Ergebnis ist `ok`, wenn die KI die Unterschrift erkennt, und `to_check` mit dem AI-Hinweis, wenn sie zweifelt. Die Auskunftsermächtigung steht in `documents[]` mit `unsicher: true`. **Sie blockiert die Einreichung nie mehr** (Befund 1).
5. **`plausibility[]`**: die Plausibilitätshinweise zu den Beträgen, so wie der Kunde sie gesehen hat (`feld`, `code`, `hinweis`). Das Feld fehlt, wenn es keine gibt.

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
    { "feld": "val", "code": "overValue", "hinweis": "Die Hypothek (CHF 800'000) ist höher als der Objektwert (CHF 400'000). Bitte prüfe den Objektwert." }
  ],
  "reuploads": []
}
```

## 4. Offene Punkte für euch

1. **Feldnamen** (Abschnitt 1): Liest euer Panel Kap. 6.2, oder sollen wir die Namen aus dem Handover zusätzlich liefern?
2. **ZZTEST-Modus:** Umgesetzt mit dem Schalter `HYPOTEQ_TEST_SALESFORCE` auf der Preview. Nur Anfragen, deren Nachname (oder Firma) «ZZTEST» enthält, erzeugen einen echten Case; alle anderen Preview-Anfragen bleiben ohne Case, Mails tragen weiter «[TEST]». Folge-Updates (Nachreichung, Re-Upload) schreibt die Preview nur auf einen Case, den Salesforce selbst als ZZTEST ausweist. Passt das so? Und denkt daran: Testfälle löschen kann nur ein Admin (der Integration-User darf nicht löschen).
3. **Unterschrift:** Neben der fehlenden Unterschrift blockieren jetzt auch «anderer Name» und «anderes Formular» nicht mehr; alle drei erscheinen gelb und gehen in den Pre-Check. Einverstanden?
4. **Plausibilitätsgrenzen** (Befunde 4/5), Startwerte, nur als Hinweis unter dem Feld, die Eingabe bleibt möglich:
   - Kaufpreis, Objektwert, Hypothek, Renovation, Eigenmittel: über CHF 50 Mio. → Hinweis
   - Kaufpreis und Objektwert: unter CHF 100'000 → Hinweis
   - Einkommen und Mietertrag: über CHF 5 Mio. pro Jahr → Hinweis
   - Hypothek höher als der Objektwert → Hinweis
   - Objektwert unter 50 % des Kaufpreises → Hinweis
   - Renovation höher als der Kaufpreis → Hinweis

   Stimmen die Grenzen? Soll etwas davon die Eingabe blockieren?
5. **Vorbelegung Objektwert** (Befund 5): Heute ist das Feld beim Kauf leer und zeigt Kaufpreis plus Renovation als Platzhalter; die Rechnung nimmt diesen Wert. Ein zu tiefer Wert (z.B. CHF 1) löst jetzt den Hinweis aus. Soll das Feld zusätzlich vorbelegt werden?
   - mit dem Kaufpreis oder mit Kaufpreis plus Renovation? Nur mit dem Kaufpreis wäre die Belehnung bei einer Renovation wieder zu hoch (V20).
   - Soll ein unveränderter vorbelegter Wert in `Geschaetzter_Objektwert__c` gehen? Heute geht nur ein eingegebener Wert dorthin (V60).
6. **Betreibungsauszug bei Privatpersonen** (Befund 2): Wird er hochgeladen, heisst er jetzt «Fallrelevant» statt «Überzählig». Verlangt wird er weiterhin nur bei Firmen. Soll er auch bei Privatpersonen Pflicht sein?
7. **Screenshots** zu Befund 1 (die zwei Auskunftsermächtigungen) und E05 (Passwort-Reset): Bitte schickt sie. Die Unterschriftserkennung ist jetzt grosszügiger; mit euren zwei Dokumenten können wir sie gezielt prüfen. Beim Passwort-Reset finden wir im Code keinen Fehler, ohne Screenshot wissen wir nicht, was am Button nicht stimmt.
