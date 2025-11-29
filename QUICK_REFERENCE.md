# 🚀 Quick Reference Card

## Installation
```bash
npm install
```

## Basic Hook Usage
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

const { locale, setLocale, t } = useLanguage();
```

## Get Translation
```tsx
const text = t("navigation.partnerWerden");
// Returns: "Partner werden" (DE), "Become a Partner" (EN), etc.
```

## Change Language
```tsx
setLocale("en");  // English
setLocale("de");  // German
setLocale("fr");  // French
setLocale("it");  // Italian
```

## Get Current Language
```tsx
console.log(locale);  // "en" | "de" | "fr" | "it"
```

## Add New Translation
1. Edit: `messages/de.json`
2. Add: `{ "section": { "key": "Wert" } }`
3. Repeat for: `en.json`, `fr.json`, `it.json`
4. Use: `t("section.key")`

## Translation Structure
```json
{
  "common": {},
  "navigation": {},
  "hero": {},
  "buttons": {},
  "footer": {},
  "calculator": {},
  "contact": {},
  "advantages": {},
  "testimonials": {}
}
```

## File Locations
| What | Where |
|------|-------|
| Translations | `messages/` |
| Main Hook | `hooks/useTranslation.ts` |
| Provider | `components/LanguageProvider.tsx` |
| Example | `components/TranslationExample.tsx` |
| Docs | `I18N_SETUP.md`, `VISUAL_GUIDE.md` |

## Supported Languages
| Code | Name |
|------|------|
| de | Deutsch |
| en | English |
| fr | Français |
| it | Italiano |

## Common Keys
```
t("common.home")           → Home
t("common.about")          → About
t("common.contact")        → Contact
t("common.partner")        → Partner
t("navigation.partnerWerden")     → Partner werden
t("navigation.hypothekAnfragen")  → Hypothek anfragen
t("hero.title")            → Ihre Hypothek, digital und einfach
t("buttons.learnMore")     → Mehr erfahren
t("footer.copyright")      → Alle Rechte vorbehalten
```

## Component Example
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function MyComponent() {
  const { t, locale, setLocale } = useLanguage();
  
  return (
    <div>
      <h1>{t("hero.title")}</h1>
      <p>Current: {locale}</p>
      <button onClick={() => setLocale("en")}>
        {t("common.language")}
      </button>
    </div>
  );
}
```

## Storage
- Language saved in: `localStorage["lang"]`
- Key format: `"de"`, `"en"`, `"fr"`, `"it"`
- Persists across sessions

## Troubleshooting

**Language not changing?**
- ✓ Component has `"use client"`
- ✓ Component uses `useLanguage` hook
- ✓ localStorage enabled

**Translation showing key instead of text?**
- ✓ Key exists in all 4 JSON files
- ✓ Path spelling matches
- ✓ Nested structure correct

**New language not appearing?**
- ✓ Added to all 4 JSON files
- ✓ Running `npm install` first

## Commands
```bash
npm install           # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm start            # Start production server
```

## Performance
- ✅ No network calls
- ✅ Translations cached in memory
- ✅ Instant language switching
- ✅ No page reload needed

## Key Points
1. Always add `"use client"` to components using hooks
2. Add translation to all 4 languages simultaneously
3. Use consistent key naming across all files
4. Test language switching after adding translations
5. Check localStorage for language persistence

## Files to Edit
To add translations: `messages/de.json`, `en.json`, `fr.json`, `it.json`
To use translations: Any client component with `useLanguage` hook

---

**Need More Help?**
- Read: `I18N_SETUP.md` (Complete guide)
- See: `VISUAL_GUIDE.md` (Architecture & flows)
- Example: `components/TranslationExample.tsx`
