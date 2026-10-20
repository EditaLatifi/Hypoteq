/**
 * The v5 closing mails (Handover 7): one mail per recipient — customer, Berater, HYPOTEQ intern.
 * Used by /api/inquiry for v5 submissions; older payloads keep the mails in the route.
 */

export { buildClosingMails, sendClosingMails, internalMailTo, authorizationDataFor, closingPartner } from "./closing";
export type { ClosingMail, ClosingMailsInput, ClosingSendResult, MailAttachment } from "./closing";
export { buildCaseSummary, closingFacts, closingSignature, closingSubject, isV5Payload, missingDocuments } from "./summary";
export type { CaseSummary, SummaryBlock, SummaryRow } from "./summary";
export { renderClosingMail, type SalesforceOutcome } from "./render";
export { salesforceCaseUrl } from "./caseLink";
export { closingMailTransport, graphTransport, smtpTransport } from "./transport";
export type { MailTransport, OutgoingMail } from "./transport";
export { MAIL_TEXTS, type Audience } from "./texts";
