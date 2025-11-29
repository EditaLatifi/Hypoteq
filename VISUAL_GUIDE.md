# Visual Guide: Multi-Language Implementation

## 🌍 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Your App Layout                 │
│  (app/layout.tsx - Wrapped with LanguageProvider)│
└────────────────┬────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │ LanguageProvider│
        │  (Context API)  │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──┐    ┌───▼──┐    ┌───▼──┐
│Header│    │ Hero │    │Other  │
│      │    │      │    │Pages  │
└─┬────┘    └───┬──┘    └───┬──┘
  │             │           │
  └─────────────┼───────────┘
                │
      ┌─────────▼─────────┐
      │  useLanguage()    │
      │  Hook             │
      └─────────┬─────────┘
                │
      ┌─────────▼─────────┐
      │  Get Translated   │
      │  Text from JSON   │
      └─────────┬─────────┘
                │
    ┌───────────┼───────────┐
    │           │           │
┌───▼──┐   ┌───▼──┐   ┌───▼──┐
│de.json│   │en.json│   │fr.json│
│it.json│   │       │   │       │
└───────┘   └───────┘   └───────┘
```

---

## 📊 Component Flow

```
User Clicks Language Button
         │
         ▼
Header Component (Header.tsx)
    - Calls setLocale("en")
    - Via useLanguage hook
         │
         ▼
LanguageProvider Updates State
    - Saves to localStorage
    - Updates locale state
         │
         ▼
All Child Components Re-render
    - useLanguage hook returns new locale
    - t("key") gets new language text
         │
         ▼
UI Displays New Language
    - Instantly, no page reload
```

---

## 🎯 Translation Key Mapping

```
messages/de.json
└── navigation
    └── partnerWerden: "Partner werden"

messages/en.json
└── navigation
    └── partnerWerden: "Become a Partner"

messages/fr.json
└── navigation
    └── partnerWerden: "Devenir Partenaire"

messages/it.json
└── navigation
    └── partnerWerden: "Diventa Partner"

Usage in Component:
const title = t("navigation.partnerWerden");
// Output depends on current locale
// EN: "Become a Partner"
// DE: "Partner werden"
```

---

## 📝 Adding a New Translation

### Step 1: Identify the Key Path
```
Feature: "Contact Form"
Component: "Button Label"
Path: contact.submit
```

### Step 2: Add to All JSON Files

**messages/de.json:**
```json
{
  "contact": {
    "submit": "Senden"
  }
}
```

**messages/en.json:**
```json
{
  "contact": {
    "submit": "Submit"
  }
}
```

**messages/fr.json:**
```json
{
  "contact": {
    "submit": "Envoyer"
  }
}
```

**messages/it.json:**
```json
{
  "contact": {
    "submit": "Invia"
  }
}
```

### Step 3: Use in Component
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function ContactForm() {
  const { t } = useLanguage();
  
  return (
    <form>
      <button type="submit">
        {t("contact.submit")}
      </button>
    </form>
  );
}
```

---

## 🔄 Language Persistence Flow

```
User Opens App
    │
    ▼
useEffect in LanguageProvider
    │
    ├─ Check localStorage["lang"]
    │
    └─ If exists: Use stored language
       If not: Use default "de"
    │
    ▼
localStorage: { "lang": "en" }
    │
    ▼
Next Visit
    │
    └─ App loads with "en" language
```

---

## 📱 Language Selector UI

```
┌─────────────────────────────────────────┐
│ Logo          [Menu]    [Phone] [🌐 DE] │◄── Language Button
└─────────────────────────────────────────┘

User clicks 🌐 DE button
         │
         ▼
    ┌─────────┐
    │ EN      │
    │ FR      │
    │ IT      │
    │ DE ✓    │
    └─────────┘

User selects EN
    │
    ▼
Header updates
locale = "en"

localStorage.setItem("lang", "en")
    │
    ▼
All content switches to English
```

---

## 🔧 Hook Usage Patterns

### Pattern 1: Simple Translation
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function Button() {
  const { t } = useLanguage();
  return <button>{t("buttons.submit")}</button>;
}
```

### Pattern 2: Language Switching
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  
  return (
    <div>
      <p>Current: {locale}</p>
      <button onClick={() => setLocale("en")}>
        English
      </button>
    </div>
  );
}
```

### Pattern 3: Conditional Content
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function Content() {
  const { locale, t } = useLanguage();
  
  return (
    <div>
      <h1>{t("hero.title")}</h1>
      {locale === "en" && (
        <p>Only shown in English</p>
      )}
    </div>
  );
}
```

---

## 📊 File Structure Visualization

```
messages/
├── de.json (2.5 KB)
│   └── Contains ~18 keys
├── en.json (2.5 KB)
│   └── Contains ~18 keys
├── fr.json (2.5 KB)
│   └── Contains ~18 keys
└── it.json (2.5 KB)
    └── Contains ~18 keys

hooks/
├── useTranslation.ts (1.5 KB)
│   └── Browser translation cache
├── useLangText.ts (0.3 KB)
│   └── Simplified hook
└── types.ts (0.3 KB)
    └── TypeScript types

components/
├── LanguageProvider.tsx (2.2 KB)
│   └── Context & Provider
└── TranslationExample.tsx (1.8 KB)
    └── Example implementation
```

---

## ✨ Key Benefits

```
✅ No Breaking Changes
   - Existing code remains unchanged
   - Can migrate gradually

✅ Performance
   - Translations cached in memory
   - No network calls needed

✅ Storage
   - Language preference in localStorage
   - Persists across sessions

✅ Real-time
   - No page reload required
   - Instant language switching

✅ Type Safety
   - TypeScript support
   - Nested key autocomplete (with IDE support)

✅ Maintainable
   - Single JSON per language
   - Easy to add/update translations
```

---

## 🎯 Common Tasks

### Task 1: Add a New Language String
1. Open `messages/de.json`
2. Find appropriate section or create new one
3. Add key-value pair
4. Repeat for en.json, fr.json, it.json
5. Use in component: `t("section.key")`

### Task 2: Change Language Programmatically
```tsx
const { setLocale } = useLanguage();

// User clicks button
onClick={() => setLocale("fr")}
```

### Task 3: Get Current Language
```tsx
const { locale } = useLanguage();
console.log(locale); // "en", "de", "fr", "it"
```

### Task 4: Migrate Existing Component
1. Add `"use client"` at top
2. Import `useLanguage`
3. Call `const { t } = useLanguage()`
4. Replace hardcoded text with `t("key.path")`

---

## 📈 Scalability

```
Current Setup:
- 4 Languages
- ~18 keys per language
- 4 JSON files = ~10 KB total

Can Easily Scale To:
- 10+ Languages
- 100+ keys per language
- Lazy load translations if needed
```

---

## 🆘 Debugging

```
Language not changing?
└─ Check: 1) Component uses "use client"
          2) useLanguage called
          3) localStorage enabled
          4) LanguageProvider wraps app

Translation key showing instead of text?
└─ Check: 1) Key exists in all JSON files
          2) Path spelling matches exactly
          3) Nested structure correct

Performance issues?
└─ Translations cached in memory by default
   No optimization needed for current setup
```

---

## 🚀 Next Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Test Language Switching**
   - Run `npm run dev`
   - Click language button in header

3. **Add More Translations**
   - Edit files in `messages/` folder
   - Use in components with `t("key")`

4. **Migrate Components Gradually**
   - Start with important UI elements
   - Replace German text with translations
   - Test thoroughly after each change

---

This visual guide should help you understand and maintain the multi-language system! 🎉
