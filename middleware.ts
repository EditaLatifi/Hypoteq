import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALES, pickLocale } from "@/lib/locale";

const SUPPORTED_LOCALES: readonly string[] = LOCALES;

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if the pathname already has a locale
  const pathnameHasLocale = SUPPORTED_LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    // Extract locale from path and set cookie
    const locale = pathname.split("/")[1];
    const response = NextResponse.next();
    response.cookies.set("NEXT_LOCALE", locale);
    return response;
  }

  // Root: the saved language (NEXT_LOCALE), else the browser language (Accept-Language), else
  // German — spec 7 «automatisch aus der Browsersprache bzw. der URL».
  if (pathname === "/") {
    const locale = pickLocale(request.cookies.get("NEXT_LOCALE")?.value, request.headers.get("accept-language"));
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // If no locale and not root, allow it to proceed (for API routes, etc)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api
    "/((?!_next|api|public|favicon.ico|robots.txt|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.webp).*)",
  ],
};
