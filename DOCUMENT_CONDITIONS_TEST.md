# Document Conditions Testing Checklist

## Test Date: December 2, 2025
## Server: http://localhost:3002/funnel

---

## ✅ NATÜRLICHE PERSON (Natural Person) - Test Scenarios

### Base Documents (Always Shown)
- [ ] Pass, Identitätskarte, Aufenthaltsbewilligung (aller Kreditnehmer)
- [ ] Aktuelle Aufstellung und Nachweis der Eigenmittel
- [ ] Aktuellste Steuererklärung

---

### Employment Status Tests

#### Test 1: Angestellt (Employed)
**Steps:**
1. Select "Natürliche Person"
2. Add borrower with status "Angestellt"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Aktueller Lohnausweis (inkl. Nachweis Bonuszahlungen der letzten 3 Jahre)
- [ ] Pensionskassenausweis und Rückkaufswerte von der 3. Säule

---

#### Test 2: Selbständig (Self-Employed)
**Steps:**
1. Select "Natürliche Person"
2. Add borrower with status "Selbständig"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Bilanz und Erfolgsrechnung (inkl. Revisionsbericht) der letzten 3 Jahre
- [ ] Pensionskassenausweis und Rückkaufswerte von der 3. Säule

---

#### Test 3: Rentner (Retiree)
**Steps:**
1. Select "Natürliche Person"
2. Add borrower with status "Rentner"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Rentenbeschenigung (PK, AHV)

---

### Age-Based Tests

#### Test 4: 50+ Years Old
**Steps:**
1. Select "Natürliche Person"
2. Add borrower with birthdate making them 50+ years old (e.g., 01.01.1975 or earlier)
3. Navigate to Documents step

**Expected Documents:**
- [ ] Rentenvorausberechnung (AHV)
- [ ] Pensionskassenausweis und Rückkaufswerte von der 3. Säule

---

### Property Type Tests

#### Test 5: Neubau (New Construction) - KAUF ONLY
**Steps:**
1. Select "Natürliche Person"
2. Select Projekt Art: "Kauf"
3. Select Art Immobilie: "Neubau"
4. Navigate to Documents step

**Expected Documents:**
- [ ] Verkaufsdokumentation (inkl. Fotos des Innen- und Aussenbereichs)
- [ ] Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
- [ ] Aktueller Grundbuchauszug falls vorhanden
- [ ] Kaufvertrag (Entwurf/original)
- [ ] Aktuelle Gebäudeversicherungspolice (inkl. Kubatur in m3), falls bereits vorhanden

**IMPORTANT:** These should NOT appear if "Ablösung" is selected!

---

#### Test 6: Neubau + Reserviert
**Steps:**
1. Select "Natürliche Person"
2. Select Projekt Art: "Kauf"
3. Select Art Immobilie: "Neubau"
4. Select Reserviert: "Ja"
5. Navigate to Documents step

**Expected ADDITIONAL Documents:**
- [ ] Renovationsvertrag
- [ ] Bankauszug Reservationszahlung

---

#### Test 7: Ablösung (Refinancing)
**Steps:**
1. Select "Natürliche Person"
2. Select Projekt Art: "Ablösung"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Baubeschrieb (inkl. Foto des Innen- und Aussenbereichs)
- [ ] Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
- [ ] Aktueller Grundbuchauszug (nicht älter als 6 Monate)
- [ ] Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)

**IMPORTANT:** Neubau section should NOT appear when Ablösung is selected!

---

#### Test 8: Stockwerkeigentum (Condominium)
**Steps:**
1. Select "Natürliche Person"
2. Select Art Liegenschaft: "Stockwerkeigentum"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
- [ ] Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
- [ ] Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds

---

#### Test 9: Renditeobjekt (Investment Property)
**Steps:**
1. Select "Natürliche Person"
2. Select Nutzung: "Rendite-Immobilie"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Aktueller Mieterspiegel inkl. Mietzinsaufstellung

---

### Financing Tests

#### Test 10: Andere Eigenmittel (Other Funds)
**Steps:**
1. Select "Natürliche Person"
2. In Financing step, enter value in "Schenkung" field (eigenmittel_schenkung > 0)
3. Navigate to Documents step

**Expected Documents:**
- [ ] Schenkungsvertrag
- [ ] Darlehensvertag
- [ ] Erbschaftbestätigung

---

### Construction/Renovation Tests

#### Test 11: Bauprojekt
**Steps:**
1. Select "Natürliche Person"
2. Select Projekt Art: "Kauf"
3. Select Art Immobilie: "Neubau"
4. Select Neubau Art: "Bauprojekt"
5. Navigate to Documents step

**Expected Documents:**
- [ ] Baubewilligung
- [ ] Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)

---

#### Test 12: Renovation
**Steps:**
1. Select "Natürliche Person"
2. Select Renovation: "Ja"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Baubewilligung
- [ ] Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)

---

## ✅ JURISTISCHE PERSON (Legal Entity) - Test Scenarios

### Base Documents (Always Shown)
- [ ] Handelsregisterauszug (aktuell)
- [ ] Pass oder Identitätskarte der Zeichnungsberechtigten Person
- [ ] Jahresabschlüsse (Bilanzen und Erfolgsrechnungen der letzten 3 Jahre)
- [ ] Aktuelle Zwischenbilanz (falls vorhanden)
- [ ] Aktuellste Steuererklärung (inkl. Schulden-, Wertschriten, Liegenschatsverzeichnis)
- [ ] Aufstellung und Nachweis der Eigenmittel
- [ ] Aktuellste Steuererklärung (inkl. Schulden-, Wertschriften, Liegenschaftsverzeichnis)

---

#### Test 13: Juristische Person + Neubau
**Steps:**
1. Select "Juristische Person"
2. Select Projekt Art: "Kauf"
3. Select Art Immobilie: "Neubau"
4. Navigate to Documents step

**Expected Documents:**
- [ ] Verkaufsdokumentation (inkl. Fotos des Innen- und Aussenbereichs)
- [ ] Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
- [ ] Aktueller Grundbuchauszug falls vorhanden
- [ ] Kaufvertrag (Entwurf/original) oder/und Renovationsvertrag
- [ ] Aktuelle Gebäudeversicherungspolice (inkl. Kubatur in m3), falls bereits vorhanden

---

#### Test 14: Juristische Person + Ablösung
**Steps:**
1. Select "Juristische Person"
2. Select Projekt Art: "Ablösung"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Baubeschrieb (inkl. Foto des Innen- und Aussnebereichs)
- [ ] Bau-/Grundrisspläne inkl. Nettowohnfläche, Raumhöhe, Dachform, Bodenbeläge, Baubeschrieb
- [ ] Aktueller Grundbuchauszug (nicht älter als 6 Monate)
- [ ] Aktueller Hypothekenvertrag (bei Ablösung der Hypothek)

**IMPORTANT:** Neubau section should NOT appear!

---

#### Test 15: Juristische Person + Stockwerkeigentum
**Steps:**
1. Select "Juristische Person"
2. Select Art Liegenschaft: "Stockwerkeigentum"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Stockwerkeigentum-Begründungsakt mit Wertquotenaufteilung
- [ ] Nutzungs- und Verwaltungsreglement der STWE-Gemeinschaft
- [ ] Bei Stockwerkeigentum: Angaben über den Erneuerungsfonds

---

#### Test 16: Juristische Person + Andere Eigenmittel
**Steps:**
1. Select "Juristische Person"
2. In Financing step, enter value in "Schenkung" field
3. Navigate to Documents step

**Expected Documents:**
- [ ] Schenkungsvertrag
- [ ] Darlehensvertag
- [ ] Erbschafttsvertrag (Note: different spelling for Juristische Person)

---

#### Test 17: Juristische Person + Bauprojekt/Renovation
**Steps:**
1. Select "Juristische Person"
2. Select Bauprojekt OR Renovation: "Ja"
3. Navigate to Documents step

**Expected Documents:**
- [ ] Baubewilligung
- [ ] Projektplan, Baubeschrieb und Bauhandwerkerverzeichnis (inkl. Kostenvoranschlag und Kubatur)

---

## 🔍 Critical Tests (Most Important)

### ❌ Negative Test 1: Ablösung should NOT show Neubau documents
**Steps:**
1. Select Projekt Art: "Ablösung"
2. Navigate to Documents step
3. **VERIFY:** Neubau section does NOT appear
4. **VERIFY:** Reservation section does NOT appear

---

### ❌ Negative Test 2: Bauprojekt not selected
**Steps:**
1. Select Art Immobilie: "Neubau"
2. Select Neubau Art: "Bereits erstellt" (not Bauprojekt)
3. Navigate to Documents step
4. **VERIFY:** Bauprojekt/Renovation section does NOT appear

---

### ❌ Negative Test 3: Renovation = Nein
**Steps:**
1. Select Renovation: "Nein"
2. Navigate to Documents step
3. **VERIFY:** Bauprojekt/Renovation section does NOT appear

---

### ❌ Negative Test 4: No Schenkung entered
**Steps:**
1. Do not enter any value in "Schenkung" field (or enter 0)
2. Navigate to Documents step
3. **VERIFY:** Andere Eigenmittel section does NOT appear

---

## 📊 Test Results Summary

**Test Date:** __________________
**Tester:** __________________

| Test # | Scenario | Pass/Fail | Notes |
|--------|----------|-----------|-------|
| 1 | Angestellt | ☐ | |
| 2 | Selbständig | ☐ | |
| 3 | Rentner | ☐ | |
| 4 | Age 50+ | ☐ | |
| 5 | Neubau (Kauf) | ☐ | |
| 6 | Neubau + Reserviert | ☐ | |
| 7 | Ablösung | ☐ | |
| 8 | Stockwerkeigentum | ☐ | |
| 9 | Renditeobjekt | ☐ | |
| 10 | Andere Eigenmittel | ☐ | |
| 11 | Bauprojekt | ☐ | |
| 12 | Renovation | ☐ | |
| 13 | Jur + Neubau | ☐ | |
| 14 | Jur + Ablösung | ☐ | |
| 15 | Jur + Stockwerk | ☐ | |
| 16 | Jur + Andere EM | ☐ | |
| 17 | Jur + Bauprojekt | ☐ | |
| NEG 1 | Ablösung no Neubau | ☐ | |
| NEG 2 | No Bauprojekt | ☐ | |
| NEG 3 | Renovation Nein | ☐ | |
| NEG 4 | No Schenkung | ☐ | |

---

## 🐛 Issues Found

Record any issues discovered during testing:

1. _______________________________________________________________
2. _______________________________________________________________
3. _______________________________________________________________

---

## ✅ Console Debugging

Open browser DevTools (F12) and check console for debug output showing:
```
📄 Document Conditions: {
  isNeubau: true/false,
  isAblösung: true/false,
  isKauf: true/false,
  ...
}
```

This will help verify the conditions are being evaluated correctly.
