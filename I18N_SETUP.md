# Internationalization (i18n) Setup Guide

This project now supports 4 languages: **German (DE)**, **English (EN)**, **French (FR)**, and **Italian (IT)**.

## 📁 File Structure

```
messages/
  ├── de.json          # German translations
  ├── en.json          # English translations
  ├── fr.json          # French translations
  └── it.json          # Italian translations

hooks/
  ├── useTranslation.ts     # Client-side translation hook
  ├── useLangText.ts        # Simplified translation utility
  └── types.ts              # TypeScript types for translations

components/
  ├── LanguageProvider.tsx   # Language context provider
  └── layout/
      └── Header.tsx         # Updated with language selector

middleware.ts                 # Language routing middleware
i18n.config.ts               # i18n configuration
```

## 🚀 How to Use

### 1. Using Translations in Client Components

Use the `useLanguage` hook to access translations and change language:

```tsx
"use client";

import { useLanguage } from "@/components/LanguageProvider";

export function MyComponent() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div>
      <h1>{t("hero.title")}</h1>
      <p>{t("hero.subtitle")}</p>
      
      <button onClick={() => setLocale("en")}>
        Switch to English
      </button>
    </div>
  );
}
```

### 2. Using the Simplified Hook

For quick translations without full context:

```tsx
"use client";

import { useLangText } from "@/hooks/useLangText";

export function SimpleComponent() {
  const title = useLangText("common.home");
  return <h1>{title}</h1>;
}
```

### 3. Adding New Translations

1. Open the relevant JSON file in the `messages/` folder (e.g., `de.json`)
2. Add your translation key following the nested structure
3. Add the same key to all 4 language files (de.json, en.json, fr.json, it.json)

Example structure:
```json
{
  "pages": {
    "home": {
      "title": "Welcome to Hypoteq"
    }
  }
}
```

Then use it:
```tsx
const title = t("pages.home.title");
```

## 🌍 Supported Languages

| Code | Language | File |
|------|----------|------|
| de   | Deutsch  | de.json |
| en   | English  | en.json |
| fr   | Français | fr.json |
| it   | Italiano | it.json |

## 💾 How Language Preference is Stored

- Language preference is saved to **localStorage** with the key `"lang"`
- On first visit, the default language is **German (DE)**
- The middleware will handle language-based routing if you implement locale paths

## ⚙️ Current Implementation

### Language Selector (Header)
The language selector button in the Header component allows users to switch languages in real-time without page reload.

### Automatic Language Detection
The middleware checks the `Accept-Language` header and can redirect to the preferred language (optional feature).

## 📝 Translation Key Naming Convention

Follow this convention for consistency:

```json
{
  "common": { },              // Common terms
  "navigation": { },          // Navigation labels
  "hero": { },                // Hero section content
  "buttons": { },             // Button labels
  "footer": { },              // Footer content
  "calculator": { },          // Calculator section
  "contact": { },             // Contact form
  "advantages": { },          // Advantages section
  "testimonials": { }         // Testimonials
}
```

## 🔧 Updating Existing Components

To add translation support to existing components:

1. Add `"use client"` at the top if not already present
2. Import the hook: `import { useLanguage } from "@/components/LanguageProvider"`
3. Use it in the component: `const { t } = useLanguage()`
4. Replace hardcoded German text with `t("key.path")`

Example:
```tsx
// Before
<h1>Hypotheken Rechner</h1>

// After
<h1>{t("calculator.title")}</h1>
```

## 🎯 Features

✅ 4 Languages: German, English, French, Italian
✅ Client-side translation caching
✅ localStorage for language persistence
✅ Middleware for language routing support
✅ TypeScript support with nested key typing
✅ Easy-to-use hooks and providers
✅ No layout/line changes to existing components
✅ Fallback to key name if translation missing
✅ Real-time language switching without page reload

## 🐛 Troubleshooting

### Translation key not found
Make sure the key is spelled correctly and exists in all 4 JSON files.

### Language not persisting
Check browser's localStorage is enabled. The app uses `localStorage` with key `"lang"`.

### Component not updating on language change
Ensure you're using the `useLanguage` hook and wrapped in `LanguageProvider` via the root layout.

## 📦 Dependencies Added

- `next-intl` (v3.18.0) - Official Next.js internationalization library

Install dependencies with:
```bash
npm install
```
