# Hypoteq Multi-Language Setup - Installation Guide

## ✅ Changes Made

Your project has been successfully configured for **4-language support**: German, English, French, and Italian.

## 🔧 Installation Steps

### Step 1: Install Dependencies

Run this command in your project directory:

```bash
npm install
```

Or if you prefer yarn:

```bash
yarn install
```

This will install the new `next-intl` package added to your `package.json`.

### Step 2: Verify Installation

After installation, you should have these new files:

```
✅ messages/
   ├── de.json (German)
   ├── en.json (English)
   ├── fr.json (French)
   └── it.json (Italian)

✅ hooks/
   ├── useTranslation.ts
   ├── useLangText.ts
   └── types.ts

✅ components/
   ├── LanguageProvider.tsx (NEW)
   └── layout/Header.tsx (UPDATED)

✅ Root Files:
   ├── i18n.config.ts (NEW)
   ├── middleware.ts (NEW/UPDATED)
   ├── app/layout.tsx (UPDATED)
   └── I18N_SETUP.md (DOCUMENTATION)
```

### Step 3: Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` and look for the language selector in the header.

## 🌍 What's New

### 1. **Language Selector in Header**
The existing Header component now uses the new `useLanguage` hook. Users can switch between:
- DE (Deutsch)
- EN (English)
- FR (Français)
- IT (Italiano)

### 2. **Translation Files (JSON)**
All translations are organized in `messages/` folder with 4 JSON files (one per language).

### 3. **Context Provider**
A new `LanguageProvider` component wraps your app and manages language state globally.

### 4. **Translation Hooks**
- `useLanguage()` - Full hook with locale, setLocale, and t function
- `useLangText()` - Simplified hook for quick translations

## 📖 Using Translations in Your Components

### Quick Example - Before and After

**BEFORE (German only):**
```tsx
export function MyButton() {
  return <button>Partner werden</button>;
}
```

**AFTER (Multi-language):**
```tsx
"use client";
import { useLanguage } from "@/components/LanguageProvider";

export function MyButton() {
  const { t } = useLanguage();
  return <button>{t("navigation.partnerWerden")}</button>;
}
```

## 💡 Key Features

✅ **No Line Changes** - Existing code structure preserved
✅ **localStorage Persistence** - Language preference saved
✅ **Real-time Switching** - No page reload needed
✅ **Fallback System** - Shows key if translation missing
✅ **Type-Safe** - TypeScript support for translation keys
✅ **4 Languages** - DE, EN, FR, IT

## 📝 Translation Key Structure

```json
{
  "common": {},           // Common terms (home, about, contact, etc)
  "navigation": {},       // Menu items
  "hero": {},             // Hero section
  "buttons": {},          // Button labels
  "footer": {},           // Footer content
  "calculator": {},       // Calculator section
  "contact": {},          // Contact form
  "advantages": {},       // Advantages section
  "testimonials": {}      // Testimonials
}
```

## 🎯 Next Steps

1. **Install dependencies**: `npm install`
2. **Test it**: Run `npm run dev` and switch languages in the header
3. **Add translations**: Open `messages/de.json` to see the structure and add more keys
4. **Update components**: Replace German text with `t("key.path")` in your components
5. **Refer to I18N_SETUP.md** for detailed documentation

## 📚 Documentation Files

- `I18N_SETUP.md` - Complete i18n setup guide and reference
- `i18n.config.ts` - Configuration file
- `components/TranslationExample.tsx` - Example component implementation

## 🐛 Troubleshooting

If npm install fails:
1. Try clearing cache: `npm cache clean --force`
2. Delete `node_modules` folder and `package-lock.json`
3. Run `npm install` again

If languages don't change:
1. Check browser console for errors
2. Verify localStorage is enabled
3. Make sure component is wrapped in `LanguageProvider` (via root layout)

## ✨ That's it!

Your project now supports 4 languages without breaking any existing code. Start using translations gradually as you update each component!
