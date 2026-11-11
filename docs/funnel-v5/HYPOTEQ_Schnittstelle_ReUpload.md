# Schnittstelle «Re-Upload anfordern» (Salesforce → Funnel)

**Für:** Fisnik Salihu (HYPOTEQ) · **Von:** Edita Latifi · **Stand:** 05.11.2026 (erste Fassung 26.10.2026)
**Bezug:** Spezifikation Datenabgleich Kap. 5, Antworten 8 und 9 vom 26.10.2026; Pre-Check vom 03./04.11.2026.

Salesforce ruft beim Klick auf «Re-Upload anfordern» diese Schnittstelle auf. Der Funnel stellt die Anforderung wieder auf «FEHLT», verschickt die Mail über info@hypoteq.ch mit dem Magic-Link, erinnert nach 2 und 5 Tagen und meldet den Eingang des neuen Dokuments im Abgleich-JSON (`Case.Funnel_Abgleich_State__c`, `reuploads[]`).

## 1. Aufruf

```
POST https://www.hypoteq.com/api/funnel/reupload
Authorization: Bearer <Token>
Content-Type: application/json
```

- **Umgebung:** Bis zum Go-live auf der Preview, also derselben Adresse, auf der ihr den Funnel testet, mit dem Pfad `/api/funnel/reupload`. Auf `www.hypoteq.com` gibt es sie mit dem Go-live (gleicher Pfad).
- **Testen auf der Preview:** Dort gilt der Test-Modus. Seit 11.11. legt jede Anfrage auf der Preview ihren Case normal an (kein ZZTEST mehr); bestehende Cases ändert die Preview nur, wenn sie sie selbst angelegt hat (oder ältere ZZTEST-Cases) — nie einen Kunden-Case. Mails sind mit «[TEST]» markiert. Die Preview arbeitet auf derselben Datenbank wie die Produktion: Ein ausgeführter Aufruf verschiebt die Dokumente des Falls wirklich nach «Weitere Dateien», deshalb auf der Preview nur Fälle von der Preview. Die Erinnerungen nach 2 und 5 Tagen laufen im täglichen Cron, den Vercel nur in der Produktion ausführt; auf der Preview kommen sie nicht.
- **`preview` ist ein Feld pro Aufruf, nicht die Umgebung:** `"preview": true` gibt nur den Mailentwurf für euren Dialog zurück und ändert nichts. Es wird keine Mail verschickt und kein Dokument verschoben. Der eigentliche Aufruf (auch im End-to-End-Test) geht **ohne** `preview` bzw. mit `"preview": false`.
- **Mehrere Dokumente:** ein Aufruf pro Dokument. Jedes hat seinen eigenen Grund, seine eigenen Erinnerungen und optional seinen eigenen Task. Der Kunde bekommt pro Dokument eine Mail mit demselben Wiedereinstiegs-Link.
- **Token:** Wir erzeugen einen zufälligen Token (mindestens 24 Zeichen), hinterlegen ihn bei uns als `REUPLOAD_API_TOKEN` und geben ihn euch über einen sicheren Kanal. Bei euch liegt er in einer Named Credential, nie im Code oder in einer Mail.
- **Ohne Token-Konfiguration** antwortet die Schnittstelle mit 503, **mit falschem Token** mit 401.

## 2. Felder

| Feld | Pflicht | Inhalt |
|---|---|---|
| `caseId` | ja (oder `caseNumber`) | Salesforce Case-Id (15 oder 18 Zeichen). |
| `caseNumber` | ja (oder `caseId`) | Fallnummer des Funnels, z. B. `HQ-26-10-000123`. |
| `requirement` | ja | Die Anforderung: am besten `documents[].requirement` aus dem Abgleich-JSON (`Funnel_Abgleich_State__c`), also genau der Schlüssel der Zeile im Pre-Check-Panel; dasselbe wie die `id` aus `Dokumenten_Check_State__c` → `requirements[]` (z. B. `lohnausweise#<Kreditnehmer-Id>`, `grundbuch`). Ebenso möglich: der Code mit Kreditnehmer (`P2`, `P2_kn2`), unsere Typ-Id (`lohnausweise_kn1`) oder euer Schlüssel aus `Pruefregel__c` (`pass_id_kn1`, `grundbuchauszug`). |
| `reason` | ja | Der Grund bzw. die Nachricht an den Kunden, wie sie in der Mail stehen soll (bis 1000 Zeichen), z. B. «Die zweite Seite fehlt.» |
| `recipient` | nein | `kunde` oder `partner`. Massgebend ist, wer eingereicht hat (Antwort 9). Fehlt das Feld, nimmt der Funnel den Partner, wenn ein Berater eingereicht hat, sonst den Kunden. |
| `mailText` | nein | Der Mailtext, wie ihn der Dialog bearbeitet hat (reiner Text, Absätze durch Leerzeile). `{link}` wird durch den Magic-Link ersetzt; fehlt `{link}`, steht darunter der Button «Dokument hochladen». Ohne `mailText` gilt der Text aus Kap. 10.1. |
| `lang` | nein | `de`, `en`, `fr` oder `it`. Ohne Angabe die Sprache des Falls. |
| `taskId` | nein | Ein Salesforce-Task, den der Funnel auf «Completed» setzt, sobald das neue Dokument da ist. |
| `preview` | nein | `true`: nur die vorbereitete Mail zurückgeben (für den Dialog), nichts ändern, keine Mail. Für die Ausführung weglassen oder `false`. |

## 3. Beispiel

```json
{
  "caseId": "500AA000001xyzQAAQ",
  "requirement": "pass_id_kn1",
  "reason": "Der Pass ist abgelaufen.",
  "recipient": "kunde",
  "taskId": "00TAA000001abcdEAA"
}
```

Antwort `200`:

```json
{
  "ok": true,
  "id": "…",
  "inquiryId": "…",
  "requirement": "id#…",
  "document": "Pass / Identitätskarte – Max Mustermann",
  "recipient": "kunde",
  "mailSent": true,
  "movedDocuments": 1,
  "reminders": ["2026-10-28", "2026-10-31"]
}
```

Mit `"preview": true` kommen stattdessen `to`, `subject` und `text` der Mail zurück. Das ist der Vorschlag für den editierbaren Dialog; ist noch kein Magic-Link vorhanden, steht im Text `{link}`.

## 4. Antworten

| Status | Bedeutung |
|---|---|
| 200 | Ausgeführt (oder Vorschau). |
| 400 | Feld fehlt oder ist ungültig (`error` nennt es). |
| 401 | Token fehlt oder ist falsch. |
| 404 | Kein Fall mit dieser Case-Id / Fallnummer. |
| 409 | Der Fall ist kein Funnel-v5-Fall. |
| 413 | Anfrage zu gross. |
| 422 | Anforderung nicht auf der Liste des Falls (`requirements[]` nennt die gültigen mit `id`, `code` und Bezeichnung), oder keine E-Mail-Adresse für den Empfänger. |
| 503 | Schnittstelle bei uns noch nicht eingerichtet. |
| 500 | Unerwarteter Fehler (bei uns protokolliert). |

## 5. Was der Funnel tut

1. Die Dokumente der Anforderung wandern nach «Weitere Dateien» (Etikett «Überzählig»). Sie werden nicht gelöscht, und am Dokument steht der Grund.
2. Die Anforderung steht wieder auf «FEHLT»: auf der Upload-Seite des Magic-Links mit «Neues Dokument angefordert: {Grund}», im Fall-Dossier und am Case (`Dok_*__c`, `Documents_completed__c`, `Dokumenten_Check_State__c`).
3. Die Mail (Kap. 10.1) geht an den Kunden (in «du») oder an den Partner (in «Sie», erster Satz «Zum Fall {Fallnummer} …»), mit dem Magic-Link. Der Link wird bei Bedarf neu ausgestellt oder verlängert.
4. Kommt nach 2 und nach 5 Tagen (Kalendertage Zürich) kein neues Dokument, gehen die Erinnerungen aus Kap. 10.2. Das ist dieselbe tägliche Mechanik wie bei M4/M5.
5. Lädt der Kunde oder Partner das neue Dokument hoch, läuft die Erkennung erneut und der Abgleich aktualisiert sich. `reuploads[].resolvedAt` wird gesetzt, der `taskId`-Task geschlossen, und die Erinnerungen enden.
6. Eine zweite Anforderung für dasselbe Dokument erneuert die erste: neuer Grund, die Erinnerungen zählen von vorn.

Im Abgleich-JSON stehen die Anforderungen so:

```json
"reuploads": [
  { "requirement": "id#…", "requestedAt": "2026-10-26T09:00:00.000Z", "resolvedAt": null }
]
```

## 6. Einrichtung

| Wer | Was |
|---|---|
| Edita | Tabelle `InquiryReupload` anlegen (`prisma/sql/2026-10-26-inquiry-reupload.sql`), Token erzeugen und als `REUPLOAD_API_TOKEN` hinterlegen. |
| HYPOTEQ | Named Credential mit dem Token, Button «Re-Upload anfordern» mit Dialog (Vorschau über `preview: true`, dann der Aufruf ohne `preview`, mit `mailText`). |

Die Authentifizierung läuft über das bestehende Token (`REUPLOAD_API_TOKEN`, seit 26.10. in eurer Named Credential); zum Go-live wird es rotiert und das neue nur direkt übergeben.
