/**
 * URL Verification Test Suite
 * Tests all internal links and route structures to ensure German-style URLs are properly implemented
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.join(__dirname, '..');
const LOCALES = ['de', 'en', 'fr', 'it'];

// Expected German-style route names
const GERMAN_ROUTES = {
  'kontaktieren-sie-uns': 'Contact page',
  'uber-uns': 'About page',
  'hypothekenrechner': 'Calculator page',
  'partner-werden': 'Partner page',
  'vorteile': 'Advantages page',
  'beratung': 'Advisory page',
};

// Old English routes that should NOT exist
const FORBIDDEN_ROUTES = [
  'contact',
  'about',
  'calc',
  'partner', // Note: partner-werden is allowed
  'advantages',
  'advisory',
];

describe('URL Structure Verification', () => {
  describe('Folder Structure', () => {
    it('should have all German-style folders in app/[locale]/', () => {
      const localePath = path.join(PROJECT_ROOT, 'app', '[locale]');
      const folders = fs.readdirSync(localePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      Object.keys(GERMAN_ROUTES).forEach(route => {
        expect(folders).toContain(route);
      });
    });

    it('should NOT have old English-style folders in app/[locale]/', () => {
      const localePath = path.join(PROJECT_ROOT, 'app', '[locale]');
      const folders = fs.readdirSync(localePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      FORBIDDEN_ROUTES.forEach(route => {
        expect(folders).not.toContain(route);
      });
    });

    it('should NOT have duplicate folders in app/ root (non-localized)', () => {
      const appPath = path.join(PROJECT_ROOT, 'app');
      const folders = fs.readdirSync(appPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      FORBIDDEN_ROUTES.forEach(route => {
        expect(folders).not.toContain(route);
      });
    });
  });

  describe('Component Link Verification', () => {
    const componentsToCheck = [
      { file: 'components/layout/Footer.tsx', name: 'Footer' },
      { file: 'components/layout/Header.tsx', name: 'Header' },
      { file: 'components/Hero.tsx', name: 'Hero' },
      { file: 'components/Advisory.tsx', name: 'Advisory' },
      { file: 'components/Calculator.tsx', name: 'Calculator' },
      { file: 'components/PartnerWerdenSection.tsx', name: 'PartnerWerden' },
      { file: 'components/VorteileSection.tsx', name: 'Vorteile' },
    ];

    componentsToCheck.forEach(({ file, name }) => {
      it(`should not contain old English URLs in ${name}`, () => {
        const filePath = path.join(PROJECT_ROOT, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for forbidden URL patterns
        FORBIDDEN_ROUTES.forEach(route => {
          // Pattern: pathLocale}/contact or pathLocale}/about etc
          const pattern1 = new RegExp(`pathLocale\\}/\\/?(${route})["'\`]`, 'g');
          const pattern2 = new RegExp(`href=["'\`]/\\/?(${route})["'\`]`, 'g');
          
          expect(content).not.toMatch(pattern1);
          expect(content).not.toMatch(pattern2);
        });
      });

      it(`should contain German-style URLs in ${name}`, () => {
        const filePath = path.join(PROJECT_ROOT, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check if file should contain specific routes
        const expectedRoutes: { [key: string]: string[] } = {
          'Footer': ['kontaktieren-sie-uns', 'uber-uns', 'hypothekenrechner', 'partner-werden', 'beratung'],
          'Header': ['partner-werden', 'kontaktieren-sie-uns'],
          'Hero': ['hypothekenrechner'],
          'Advisory': ['kontaktieren-sie-uns'],
          'Calculator': ['kontaktieren-sie-uns'],
          'PartnerWerden': ['partner-werden'],
          'Vorteile': ['partner-werden'],
        };

        const routesToCheck = expectedRoutes[name] || [];
        routesToCheck.forEach(route => {
          expect(content).toContain(route);
        });
      });
    });
  });

  describe('Sitemap Verification', () => {
    it('should contain all German-style routes', () => {
      const sitemapPath = path.join(PROJECT_ROOT, 'app', 'sitemap.ts');
      const content = fs.readFileSync(sitemapPath, 'utf-8');

      Object.keys(GERMAN_ROUTES).forEach(route => {
        expect(content).toContain(`/${route}`);
      });
    });

    it('should NOT contain old English routes', () => {
      const sitemapPath = path.join(PROJECT_ROOT, 'app', 'sitemap.ts');
      const content = fs.readFileSync(sitemapPath, 'utf-8');

      FORBIDDEN_ROUTES.forEach(route => {
        // Avoid false positives from comments
        const pattern = new RegExp(`["\`]/${route}["\`]`, 'g');
        expect(content).not.toMatch(pattern);
      });
    });
  });

  describe('Translation Files Verification', () => {
    LOCALES.forEach(locale => {
      it(`should have updated faq5Link in ${locale}.json`, () => {
        const translationPath = path.join(PROJECT_ROOT, 'messages', `${locale}.json`);
        const content = fs.readFileSync(translationPath, 'utf-8');
        const json = JSON.parse(content);

        // Check that faq5Link contains partner-werden
        expect(json.partnerWerden?.faq5Link).toBeDefined();
        expect(json.partnerWerden.faq5Link).toContain('partner-werden');
        expect(json.partnerWerden.faq5Link).not.toContain('hypoteq.ch/partner"');
      });
    });
  });

  describe('Manifest.json Verification', () => {
    it('should use German-style URLs in shortcuts', () => {
      const manifestPath = path.join(PROJECT_ROOT, 'public', 'manifest.json');
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      const shortcuts = manifest.shortcuts || [];
      
      // Check that shortcuts use new URLs
      const calculatorShortcut = shortcuts.find((s: any) => s.name === 'Hypothekenrechner');
      expect(calculatorShortcut?.url).toBe('/de/hypothekenrechner');
      expect(calculatorShortcut?.url).not.toContain('/calc');
    });
  });

  describe('Page Component Existence', () => {
    Object.keys(GERMAN_ROUTES).forEach(route => {
      it(`should have page.tsx in app/[locale]/${route}/`, () => {
        const pagePath = path.join(PROJECT_ROOT, 'app', '[locale]', route, 'page.tsx');
        expect(fs.existsSync(pagePath)).toBe(true);
      });
    });
  });

  describe('Header White Menu Pathname Check', () => {
    it('should check for uber-uns instead of about in whiteMenu logic', () => {
      const headerPath = path.join(PROJECT_ROOT, 'components', 'layout', 'Header.tsx');
      const content = fs.readFileSync(headerPath, 'utf-8');

      // Should contain uber-uns check
      expect(content).toContain('pathname.includes("/uber-uns")');
      
      // Should NOT contain old about check
      expect(content).not.toContain('pathname.includes("/about")');
    });
  });

  describe('No Hardcoded Old URLs', () => {
    const filesToScan = [
      'components/layout/Footer.tsx',
      'components/layout/Header.tsx',
      'components/Hero.tsx',
      'components/Advisory.tsx',
      'components/Calculator.tsx',
      'components/PartnerWerdenSection.tsx',
      'components/VorteileSection.tsx',
    ];

    filesToScan.forEach(file => {
      it(`should not have hardcoded old URLs in ${file}`, () => {
        const filePath = path.join(PROJECT_ROOT, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for hardcoded old URLs
        const oldUrlPatterns = [
          /href=["']\/de\/contact["']/g,
          /href=["']\/de\/about["']/g,
          /href=["']\/de\/calc["']/g,
          /href=["']\/de\/partner["'](?!-werden)/g,
          /href=["']\/en\/contact["']/g,
          /href=["']\/en\/about["']/g,
          /href=["']\/en\/calc["']/g,
          /href=["']\/fr\/contact["']/g,
          /href=["']\/it\/contact["']/g,
        ];

        oldUrlPatterns.forEach(pattern => {
          expect(content).not.toMatch(pattern);
        });
      });
    });
  });

  describe('External Links Verification', () => {
    it('should use full German URLs in external links', () => {
      const partnerWerdenPath = path.join(PROJECT_ROOT, 'components', 'PartnerWerdenSection.tsx');
      const vorteilePath = path.join(PROJECT_ROOT, 'components', 'VorteileSection.tsx');

      const partnerContent = fs.readFileSync(partnerWerdenPath, 'utf-8');
      const vorteileContent = fs.readFileSync(vorteilePath, 'utf-8');

      // Should contain new partner-werden URL
      expect(partnerContent).toContain('hypoteq.ch/de/partner-werden');
      expect(vorteileContent).toContain('hypoteq.ch/de/partner-werden');

      // Should NOT contain old partner URL
      expect(partnerContent).not.toContain('hypoteq.ch/partner"');
      expect(vorteileContent).not.toContain('hypoteq.ch/partner"');
    });
  });
});

describe('Route Accessibility (Structure Check)', () => {
  const routes = Object.keys(GERMAN_ROUTES);
  
  routes.forEach(route => {
    LOCALES.forEach(locale => {
      it(`should have valid structure for /${locale}/${route}`, () => {
        const routePath = path.join(PROJECT_ROOT, 'app', '[locale]', route);
        const pagePath = path.join(routePath, 'page.tsx');
        
        expect(fs.existsSync(routePath)).toBe(true);
        expect(fs.existsSync(pagePath)).toBe(true);
        
        // Verify page.tsx has export default
        const pageContent = fs.readFileSync(pagePath, 'utf-8');
        expect(pageContent).toMatch(/export\s+default\s+/);
      });
    });
  });
});

describe('Comprehensive URL Pattern Audit', () => {
  it('should find all Link components use variables or German URLs', () => {
    const componentFiles = fs.readdirSync(path.join(PROJECT_ROOT, 'components'), { recursive: true })
      .filter((file: any) => typeof file === 'string' && file.endsWith('.tsx'));

    componentFiles.forEach((file: any) => {
      const filePath = path.join(PROJECT_ROOT, 'components', file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Find all Link href patterns
      const linkPattern = /<Link\s+href=["'`]([^"'`]+)["'`]/g;
      let match;

      while ((match = linkPattern.exec(content)) !== null) {
        const url = match[1];
        
        // Skip if it's a variable (${...}) or external URL (http/https)
        if (url.includes('${') || url.startsWith('http')) {
          continue;
        }

        // If it's a hardcoded internal URL, it should use German naming
        if (url.startsWith('/')) {
          FORBIDDEN_ROUTES.forEach(forbiddenRoute => {
            expect(url).not.toContain(`/${forbiddenRoute}`);
          });
        }
      }
    });
  });
});
