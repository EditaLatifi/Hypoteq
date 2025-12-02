#!/usr/bin/env node

/**
 * URL Verification Script
 * Quickly verifies all URLs have been properly updated to German-style naming
 * Run with: node verify-urls.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const LOCALES = ['de', 'en', 'fr', 'it'];

// Expected German-style routes
const GERMAN_ROUTES = [
  'kontaktieren-sie-uns',
  'uber-uns',
  'hypothekenrechner',
  'partner-werden',
  'vorteile',
  'beratung',
];

// Old routes that should NOT exist
const FORBIDDEN_ROUTES = [
  'contact',
  'about',
  'calc',
  'partner',
  'advantages',
  'advisory',
];

let errors = 0;
let warnings = 0;
let passed = 0;

function log(type, message) {
  const colors = {
    pass: '\x1b[32m✓\x1b[0m',
    fail: '\x1b[31m✗\x1b[0m',
    warn: '\x1b[33m⚠\x1b[0m',
    info: '\x1b[36mℹ\x1b[0m',
  };
  console.log(`${colors[type] || ''} ${message}`);
}

function checkFolderStructure() {
  console.log('\n📁 Checking Folder Structure...\n');
  
  const localePath = path.join(PROJECT_ROOT, 'app', '[locale]');
  
  try {
    const folders = fs.readdirSync(localePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Check German routes exist
    GERMAN_ROUTES.forEach(route => {
      if (folders.includes(route)) {
        log('pass', `Found German route: app/[locale]/${route}/`);
        passed++;
      } else {
        log('fail', `Missing German route: app/[locale]/${route}/`);
        errors++;
      }
    });

    // Check old routes don't exist
    FORBIDDEN_ROUTES.forEach(route => {
      if (folders.includes(route)) {
        log('fail', `Old English route still exists: app/[locale]/${route}/`);
        errors++;
      } else {
        log('pass', `Old route removed: ${route}`);
        passed++;
      }
    });

    // Check root app/ folder
    const appFolders = fs.readdirSync(path.join(PROJECT_ROOT, 'app'), { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    FORBIDDEN_ROUTES.forEach(route => {
      if (appFolders.includes(route)) {
        log('fail', `Duplicate route in app/ root: app/${route}/`);
        errors++;
      }
    });

  } catch (error) {
    log('fail', `Error reading folder structure: ${error.message}`);
    errors++;
  }
}

function checkComponentLinks() {
  console.log('\n🔗 Checking Component Links...\n');

  const componentsToCheck = [
    { file: 'components/layout/Footer.tsx', expectedRoutes: ['kontaktieren-sie-uns', 'uber-uns', 'hypothekenrechner', 'partner-werden', 'beratung'] },
    { file: 'components/layout/Header.tsx', expectedRoutes: ['partner-werden', 'kontaktieren-sie-uns'] },
    { file: 'components/Hero.tsx', expectedRoutes: ['hypothekenrechner'] },
    { file: 'components/Advisory.tsx', expectedRoutes: ['kontaktieren-sie-uns'] },
    { file: 'components/Calculator.tsx', expectedRoutes: ['kontaktieren-sie-uns'] },
  ];

  componentsToCheck.forEach(({ file, expectedRoutes }) => {
    const filePath = path.join(PROJECT_ROOT, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for forbidden patterns
      let hasForbidden = false;
      FORBIDDEN_ROUTES.forEach(route => {
        const pattern1 = new RegExp(`pathLocale\\}/\/${route}["'\`]`, 'g');
        const pattern2 = new RegExp(`pathLocale\\}/${route}["'\`]`, 'g');
        
        if (pattern1.test(content) || pattern2.test(content)) {
          log('fail', `${file} contains old URL: /${route}`);
          errors++;
          hasForbidden = true;
        }
      });

      // Check for expected routes
      expectedRoutes.forEach(route => {
        if (content.includes(route)) {
          if (!hasForbidden) {
            passed++;
          }
        } else {
          log('warn', `${file} might be missing route: ${route}`);
          warnings++;
        }
      });

      if (!hasForbidden) {
        log('pass', `${file} - All links updated`);
      }

    } catch (error) {
      log('fail', `Error reading ${file}: ${error.message}`);
      errors++;
    }
  });
}

function checkSitemap() {
  console.log('\n🗺️  Checking Sitemap...\n');

  const sitemapPath = path.join(PROJECT_ROOT, 'app', 'sitemap.ts');
  
  try {
    const content = fs.readFileSync(sitemapPath, 'utf-8');

    GERMAN_ROUTES.forEach(route => {
      if (content.includes(`/${route}`)) {
        log('pass', `Sitemap contains: /${route}`);
        passed++;
      } else {
        log('fail', `Sitemap missing: /${route}`);
        errors++;
      }
    });

    FORBIDDEN_ROUTES.forEach(route => {
      const pattern = new RegExp(`["'\`]/${route}["'\`]`, 'g');
      if (pattern.test(content)) {
        log('fail', `Sitemap contains old route: /${route}`);
        errors++;
      }
    });

  } catch (error) {
    log('fail', `Error reading sitemap: ${error.message}`);
    errors++;
  }
}

function checkTranslations() {
  console.log('\n🌐 Checking Translation Files...\n');

  LOCALES.forEach(locale => {
    const translationPath = path.join(PROJECT_ROOT, 'messages', `${locale}.json`);
    
    try {
      const content = fs.readFileSync(translationPath, 'utf-8');
      const json = JSON.parse(content);

      if (json.partnerWerden?.faq5Link) {
        if (json.partnerWerden.faq5Link.includes('partner-werden')) {
          log('pass', `${locale}.json - faq5Link updated`);
          passed++;
        } else {
          log('fail', `${locale}.json - faq5Link not updated: ${json.partnerWerden.faq5Link}`);
          errors++;
        }
      }
    } catch (error) {
      log('warn', `Could not parse ${locale}.json: ${error.message}`);
      warnings++;
    }
  });
}

function checkManifest() {
  console.log('\n📱 Checking Manifest...\n');

  const manifestPath = path.join(PROJECT_ROOT, 'public', 'manifest.json');
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    const calculatorShortcut = manifest.shortcuts?.find(s => s.name === 'Hypothekenrechner');
    
    if (calculatorShortcut) {
      if (calculatorShortcut.url === '/de/hypothekenrechner') {
        log('pass', 'Manifest shortcut uses German URL');
        passed++;
      } else {
        log('fail', `Manifest shortcut uses wrong URL: ${calculatorShortcut.url}`);
        errors++;
      }
    }
  } catch (error) {
    log('warn', `Could not check manifest: ${error.message}`);
    warnings++;
  }
}

function checkPageFiles() {
  console.log('\n📄 Checking Page Files...\n');

  GERMAN_ROUTES.forEach(route => {
    const pagePath = path.join(PROJECT_ROOT, 'app', '[locale]', route, 'page.tsx');
    
    if (fs.existsSync(pagePath)) {
      log('pass', `Page exists: app/[locale]/${route}/page.tsx`);
      passed++;
    } else {
      log('fail', `Page missing: app/[locale]/${route}/page.tsx`);
      errors++;
    }
  });
}

function checkHeaderWhiteMenu() {
  console.log('\n🎨 Checking Header WhiteMenu Logic...\n');

  const headerPath = path.join(PROJECT_ROOT, 'components', 'layout', 'Header.tsx');
  
  try {
    const content = fs.readFileSync(headerPath, 'utf-8');

    if (content.includes('pathname.includes("/uber-uns")')) {
      log('pass', 'Header checks for /uber-uns');
      passed++;
    } else {
      log('fail', 'Header does not check for /uber-uns');
      errors++;
    }

    if (content.includes('pathname.includes("/about")')) {
      log('fail', 'Header still checks for old /about route');
      errors++;
    } else {
      log('pass', 'Header does not check for old /about route');
      passed++;
    }
  } catch (error) {
    log('fail', `Error reading Header: ${error.message}`);
    errors++;
  }
}

// Run all checks
console.log('\n🚀 Running URL Verification Tests...\n');
console.log('=' .repeat(60));

checkFolderStructure();
checkComponentLinks();
checkSitemap();
checkTranslations();
checkManifest();
checkPageFiles();
checkHeaderWhiteMenu();

// Summary
console.log('\n' + '='.repeat(60));
console.log('\n📊 Test Summary:\n');
console.log(`   \x1b[32m✓ Passed:  ${passed}\x1b[0m`);
console.log(`   \x1b[33m⚠ Warnings: ${warnings}\x1b[0m`);
console.log(`   \x1b[31m✗ Failed:  ${errors}\x1b[0m`);
console.log('');

if (errors === 0 && warnings === 0) {
  console.log('   \x1b[32m🎉 All URLs successfully updated to German-style naming!\x1b[0m\n');
  process.exit(0);
} else if (errors === 0) {
  console.log('   \x1b[33m⚠️  All critical checks passed, but there are some warnings.\x1b[0m\n');
  process.exit(0);
} else {
  console.log('   \x1b[31m❌ Some URL checks failed. Please review the errors above.\x1b[0m\n');
  process.exit(1);
}
