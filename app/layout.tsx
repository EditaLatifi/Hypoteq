import type { Metadata } from "next";
import "@/styles/globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  title: "Hypoteq",
  description: "Mortgage platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
  <html lang="de" className="font-sf">

      <body
        className="font-sfpro bg-white text-[#132219] overflow-visible"
        suppressHydrationWarning
      >
        <LanguageProvider>
          <main className="pt-0 overflow-visible">{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
