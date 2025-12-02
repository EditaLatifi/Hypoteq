# Translation Fixes Summary

## Completed Fixes ✅

### 1. Logo Links to Home
- **File**: `app/funnel/FunnelSidebar.tsx`
- **Status**: ✅ FIXED
- **Change**: Made logo clickable and links to homepage (both mobile and desktop)

### 2. Step Translations in Progress Bar
- **File**: `components/ProgressBar.tsx`
- **Status**: ✅ FIXED
- **Change**: Added translation support for step labels using `funnel.stepGeneral`, `funnel.stepFinancing`, `funnel.stepCalculatorSummary`, `funnel.stepCompletion`

### 3. News Link Opens in New Tab
- **File**: `components/layout/Footer.tsx`
- **Status**: ✅ FIXED
- **Change**: Added `rel="noopener noreferrer"` to LinkedIn news link

## Pending Fixes 🔧

### 4. French Translation - Informal "Tu/Ton" Form
**Current Issue**: French translation inconsistently mixes formal "vous/votre" with informal "tu/ton"
**Required**: Change ALL occurrences to informal "tu/ton" form

**Key changes needed in `messages/fr.json`**:
- "vous" → "tu"
- "votre" → "ton/ta"
- "Votre" → "Ton/Ta"
- "Obtenez" → "Obtiens"
- "Comparez" → "Compare"
- "calculez" → "calcule"
- "lancez" → "lance"
- "décidez" → "décide"
- "accédez" → "accèdes"
- "Trouvez" → "Trouve"
- "Réservez" → "Réserve"
- "Inscris-toi" (already correct - keep)
- "Entre" (already correct - keep)

**Examples from the file**:
```json
"homeDescription": "Comparez les offres..." → "Compare les offres..."
"subtitle": "Obtenez Ton offre..." → "Obtiens ton offre..." (note: already has "Ton" but verb is formal)
"description": "Comparez différentes options, calculez Tes coûts..." → "Compare différentes options, calcule tes coûts..."
```

### 5. Italian Translation - "Ipoteca" vs "Mutuo"
**Current Issue**: Mixed use of "mutuo" and "ipoteca"  
**Required**: Use "ipoteca" consistently throughout

**Files to check**: 
- `messages/it.json` - Main translation file
- Search for "mutuo" and replace with "ipoteca"

**Current status**: Appears already correct in most places, but needs verification

### 6. URL Structure (ARCHITECTURAL CHANGE REQUIRED)
**Current Issue**: URLs use English abbreviations
- `/calc` instead of locale-specific names
- `/partner` instead of `/partner_werden` (DE)
- `/contact` instead of `/kontaktiere_uns` (DE)

**Proposed URL Structure**:

German (DE):
- `/de/hypothekenrechner` (currently `/de/calc`)
- `/de/partner_werden` (currently `/de/partner`)
- `/de/kontaktiere_uns` (currently `/de/contact`)

French (FR):
- `/fr/calculatrice_hypothecaire` (currently `/fr/calc`)
- `/fr/devenir_partenaire` (currently `/fr/partner`)
- `/fr/contactez_nous` (currently `/fr/contact`)

Italian (IT):
- `/it/calcolatore_ipoteche` (currently `/it/calc`)
- `/it/diventa_partner` (currently `/it/partner`)
- `/it/contattaci` (currently `/it/contact`)

**Implementation Steps Required**:
1. Create new route folders under `app/[locale]/`
2. Move existing page files to new folders
3. Update ALL internal links in components
4. Add redirects in `middleware.ts` or `next.config.mjs`
5. Update sitemap.ts
6. Update manifest.json

**Files to modify**:
- `app/[locale]/` - Create new route folders
- `components/Hero.tsx` - Update calc link
- `components/layout/Footer.tsx` - Update footer links
- `components/layout/Header.tsx` - Update navigation links
- All other components with hardcoded URLs
- `app/sitemap.ts`
- `middleware.ts` (potential redirects)
- `next.config.mjs` (potential redirects)

**⚠️ Warning**: This is a breaking change that affects:
- SEO (URLs will change)
- Existing bookmarks
- External links
- Analytics tracking

**Recommendation**: Implement URL redirects to maintain backward compatibility.

## Next Steps

### Immediate Actions:
1. ✅ Complete French translation consistency (tu/ton form)
2. ✅ Verify Italian translation (ipoteca consistency)
3. ⚠️ Discuss URL structure changes with team before implementing
4. Create redirects strategy for URL changes

### Testing Required:
- [ ] Test all funnel steps in French
- [ ] Test all funnel steps in Italian
- [ ] Verify logo links work on all pages
- [ ] Verify news link opens in new tab
- [ ] Test URL changes if implemented

## Implementation Priority

**High Priority** (Can be done immediately):
- ✅ Logo linking to home
- ✅ Step translations
- ✅ News link new tab
- 🔧 French informal form
- 🔧 Italian ipoteca consistency

**Medium Priority** (Requires coordination):
- ⚠️ URL structure changes (needs team discussion)

**Considerations**:
- URL changes impact SEO and should include 301 redirects
- Translation changes should be reviewed by native speakers
- All changes should be tested in each language before deployment
