import type { Metadata } from "next";
import { I18nProvider } from "@/components/portal/I18n";
import { getLocale } from "@/lib/portal/i18n/server";
import LegacyRoot, { legacyMetadata } from "@/components/legacy/LegacyRoot";
import "./portal.css";

// The portal's root layout since the new website has its own (app/(site)): the previous root
// document and metadata, with the portal's on top.
export const metadata: Metadata = {
  ...legacyMetadata,
  title: { absolute: "HYPOTEQ Partnerportal" },
  robots: { index: false, follow: false },
};

// Every portal page depends on the session cookie and live Salesforce data.
export const dynamic = "force-dynamic";

export default async function PortalRootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <LegacyRoot>
      <I18nProvider locale={locale}>
        <div lang={locale} className="hq-portal min-h-screen bg-[#132219] text-[17px] leading-[1.35] text-white antialiased">
          {children}
        </div>
      </I18nProvider>
    </LegacyRoot>
  );
}
