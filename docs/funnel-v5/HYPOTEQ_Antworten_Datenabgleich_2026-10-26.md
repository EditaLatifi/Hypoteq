# HYPOTEQ Antworten zur Spezifikation Datenabgleich (26.10.2026)

Antwort von Fisnik Salihu (HYPOTEQ) auf die Rückfragen zur Spezifikation «Datenabgleich, Schritt-4-Redesign & Re-Upload» v1.1 (`HYPOTEQ_Spezifikation_Datenabgleich_2026-10-23.md`). Die Nummern sind die der Rückfragen.

1. **Du/Sie:** Kunden durchgängig «du» (Abgleich-Seite 10.3, Mails 10.1/10.2 und Bestätigungsseite), Partner-Mails in «Sie». Die deutschen Texte aus Kap. 10 entsprechend anpassen, Sinn bleibt gleich.
2. **Dossier-Karte:** Keine Grössenangabe (das PDF enthält die Dokumente nicht). Neu: «Alle Angaben & 28 Unterlagen im Überblick · PDF».
3. **Abgleich-Seite:** erscheint nur bei Konflikten; ohne Konflikt wird direkt abgeschlossen. Die bestätigten Angaben stehen ohnehin in den Angaben-Boxen auf Schritt 4.
4. **Konfidenz:** die Ampel aus 4.2 gilt (≥ 0.90 Abgleich, 0.60–0.89 zu prüfen, < 0.60 nicht verwendet). Die 0.8 aus Kap. 4 ist hinfällig.
5. **Konfigurations-Objekt:** live. API-Name `Pruefregel__c`, mit allen 16 Regeln der Matrix als Startwerte. Felder: `Feld_Key__c` (eindeutiger Schlüssel, z. B. `jahreseinkommen`), `Primaerquelle__c`, `Sekundaerquellen__c` (kommagetrennt), `Toleranz_Prozent__c` (0 = exakt nach Normalisierung), `Schwelle_Gruen__c` / `Schwelle_Gelb__c` (Ampel), `Nur_Unterschreitung__c` (z. B. Eigenmittel: mehr ist kein Konflikt), `Severity__c` (`conflict` / `identity_conflict` / `hint`), `Aktiv__c`. Der Integration-User hat Lesezugriff: `SELECT … FROM Pruefregel__c WHERE Aktiv__c = true`. Der eingebaute Fallback bleibt.
6. **Keys je Dokumenttyp:** Wir machen die Liste (Matrix-Felder + was heute schon ausgelesen wird) und schicken sie zum Abnehmen. Die `Feld_Key__c`-Werte aus `Pruefregel__c` sind die Referenz für die Feldnamen.
7. **JSON-Feld:** live. `Case.Funnel_Abgleich_State__c` (Long Text, 131'072 Zeichen), Integration-User mit Schreibrecht. Struktur gemäss Kap. 6.2.
8. **Re-Upload:** Salesforce ruft unsere Schnittstelle auf; der Funnel verschickt die Mail über info@hypoteq.ch, stellt die Anforderung auf «FEHLT» und plant die Erinnerungen Tag 2/5. Wir liefern die Endpoint-Spezifikation (URL, Auth, Payload). HYPOTEQ liefert: Case-ID bzw. Fallnummer, Anforderungs-Key, Grund, bearbeiteter Mailtext, Empfängertyp Kunde/Partner.
9. **Empfänger:** massgebend ist, wer eingereicht hat — von einem Berater/Partner erfasst ⇒ Mail an den Partner, vom Kunden selbst ⇒ an den Kunden, unabhängig von Schnell- oder begleiteter Anmeldung.
10. **Fallnummer:** unsere Fallnummer `HQ-JJ-MM-NNNNNN` im Dateinamen, z. B. `HQ-26-10-000123_01_Lohnausweis_Mustermann-Max_2025-12-31.pdf`.
