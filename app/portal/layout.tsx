import type { Metadata } from "next";
import { I18nProvider } from "@/components/portal/I18n";
import { getLocale } from "@/lib/portal/i18n/server";

export const metadata: Metadata = {
  title: { absolute: "HYPOTEQ Partnerportal" },
  robots: { index: false, follow: false },
};

// Every portal page depends on the session cookie and live Salesforce data.
export const dynamic = "force-dynamic";

export default async function PortalRootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="min-h-screen bg-[#132219] text-[17px] leading-[1.35] text-white antialiased">
        {children}
      </div>
    </I18nProvider>
  );
}
