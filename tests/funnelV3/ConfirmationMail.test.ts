import { describe, it, expect } from "@jest/globals";
import {
  AUTO_RESPONSE_CONTENT,
  AUTO_RESPONSE_SUBJECT,
  autoResponseSubject,
  generateFunnelAutoResponseHTML,
} from "@/components/funnelAutoResponse";

const CASE = "HQ-26-10-123456";
const URL = "https://hypoteq.com/fr/nachreichen/abc-token";

describe("confirmation mail (spec 3 Schritt 6, DECISIONS D9 / D20)", () => {
  it("v3: Fallnummer in the subject and the body, a link back to the inquiry", () => {
    expect(autoResponseSubject("de", CASE)).toBe("Deine Hypothekaranfrage ist eingegangen – Fallnummer HQ-26-10-123456");
    expect(autoResponseSubject("fr", CASE)).toContain("Numéro de dossier HQ-26-10-123456");
    expect(autoResponseSubject("it", CASE)).toContain("Numero di pratica HQ-26-10-123456");
    expect(autoResponseSubject("en", CASE)).toContain("Case number HQ-26-10-123456");

    const html = generateFunnelAutoResponseHTML("Gary", "de", { caseNumber: CASE, returnUrl: URL });
    expect(html).toContain("Hi Gary,");
    expect(html).toContain("Fallnummer <strong>HQ-26-10-123456</strong>");
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain("Zur Anfrage");
  });

  it("legacy call: unchanged — no case line, no link", () => {
    expect(autoResponseSubject("de")).toBe(AUTO_RESPONSE_SUBJECT.de);
    const html = generateFunnelAutoResponseHTML("Gary", "de");
    expect(html).not.toContain("Fallnummer");
    expect(html).not.toContain("href=");
    // A case number without a link (token not minted) still names the case.
    expect(generateFunnelAutoResponseHTML("Gary", "en", { caseNumber: CASE })).toContain("Case number <strong>HQ-26-10-123456</strong>");
  });

  it("D9: FR «vous», IT «Lei», DE «du»", () => {
    const fr = JSON.stringify(AUTO_RESPONSE_CONTENT.fr) + autoResponseSubject("fr", CASE) + generateFunnelAutoResponseHTML("Marie", "fr", { caseNumber: CASE, returnUrl: URL });
    expect(fr).not.toMatch(/\b(ta|ton|tes|tu|salut)\b/i);
    expect(fr).toContain("Votre demande d'hypothèque a été reçue");
    expect(fr).toContain("Bonjour Marie,");
    expect(fr).toContain("Votre équipe HYPOTEQ");
    expect(fr).toContain("Vos experts hypothécaires");

    const it_ = JSON.stringify(AUTO_RESPONSE_CONTENT.it) + autoResponseSubject("it", CASE) + generateFunnelAutoResponseHTML("Marco", "it", { caseNumber: CASE, returnUrl: URL });
    expect(it_).not.toMatch(/\b(tua|tuo|tuoi|tue|ti|ciao)\b/i);
    expect(it_).toContain("La Sua richiesta ipotecaria è stata ricevuta");
    expect(it_).toContain("Buongiorno Marco,");
    expect(it_).toContain("Il Suo team HYPOTEQ");
    expect(it_).toContain("I Suoi esperti ipotecari");

    expect(generateFunnelAutoResponseHTML("Gary", "de")).toContain("Danke für deine Anfrage");
    expect(AUTO_RESPONSE_CONTENT.en.body).toBe("Thanks for your request and your trust in HYPOTEQ. We've received all the information and will get back to you soon (business days) to discuss the next steps.");
  });

  it("escapes what the customer typed", () => {
    expect(generateFunnelAutoResponseHTML("<b>x</b>", "en")).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
    expect(generateFunnelAutoResponseHTML("Gary", "en", { returnUrl: 'https://x/"><script>' })).toContain('href="https://x/&quot;&gt;&lt;script&gt;"');
  });
});
