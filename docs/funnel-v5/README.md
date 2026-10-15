# HYPOTEQ Finanzierungsfunnel – Entwicklungspaket

Stand: 14.10.2026 · Prototyp v5 · Für: Edita · Freigabe: Marco Circelli

## Ordner

| Ordner | Inhalt | Verbindlich? |
|---|---|---|
| `01_Logik/HYPOTEQ_Handover_Edita.md` | Funnel-Schritte, Felder, Bedingungen, Dokumentenregeln, Berechnung, Auskunftsermächtigung, E-Mail-Logik, offene Punkte | **Ja – Hauptdokument** |
| `01_Logik/HYPOTEQ_Funnel_Spezifikation.md` | Grundlagen: Partner-Erkennung, Dokument-Zustände, Umbenennung, JSON-Schema, Mehrsprachigkeit | Ja, bei Widerspruch gilt das Handover |
| `02_Salesforce/…Mapping_Vorschlag.csv` | Feld-Mapping Funnel → Salesforce | Vorschlag – bestehendes Mapping hat Vorrang |
| `03_Texte/` | Alle UI-Texte DE / EN / FR / IT (JSON für den Code, CSV zum Gegenlesen) | Ja, nach Review |
| `04_Prototyp/` | Klickbarer Prototyp + Beispiel Fall-Dossier | Referenz für Verhalten und Design |

Reihenfolge zum Lesen: README → Prototyp einmal durchklicken → Handover → Spezifikation → Mapping.

## Zum Testfall Gary Gerber

Der Prototyp ist mit einem echten Fall (Gary Gerber, Ablösung mit Erhöhung, STWE Wädenswil) vorbereitet.

- **Für das Produkt:** nicht nötig. Der Funnel startet leer; es gibt keine Demo-Daten im Code.
- **Für die Entwicklung:** nützlich als **Referenz-Testfall** – er deckt Ablösung, Erhöhung, STWE, Unterhalt, Privatkredit, Leasing, Säule 3a, veralteten Grundbuchauszug, Duplikate und überzählige Dateien ab. Erwartete Ergebnisse:
  - Dokumentenliste wächst 13 → 16 → 18 → 21 → 23 (Handover Kap. 4)
  - Gesamtfinanzierung CHF 650'000 · Belehnung und Tragbarkeit gemäss Homepage-Rechner
  - Hinweise an die Bank: veralteter Grundbuchauszug, Privatkredit, Leasing, verpfändete 3a-Police
  - Ausgabe: Fall-Dossier wie `04_Prototyp/HYPOTEQ_Fall-Dossier_Gerber.html`
- Die Extraktion im Prototyp ist für diesen Fall **vorbereitet, nicht echt**. Die echte Erkennung muss beliebige Dokumente lesen.

**Datenschutz:** Prototyp und Dossier enthalten echte Kundendaten. Nur intern weitergeben. Die Original-Dokumente des Falls sind bewusst nicht im Paket – bei Bedarf separat und gesichert übergeben.

## Vor dem Start klären (Marco)

Handover Kap. 10 – vor allem: Formel des Homepage-Rechners, 5 %-Schwelle Bonus/Lohnerhöhung, Salesforce-Feld Renovationsbetrag, Wording Startscreen.
