import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "login"
  | "login_failed"
  | "login_blocked"
  | "magic_link_requested"
  | "magic_link_login"
  | "logout"
  | "access_activated"
  | "password_reset_requested"
  | "password_reset"
  | "case_opened"
  | "access_denied"
  | "partner_invited"
  | "invite_resent"
  | "partner_disabled"
  | "partner_enabled"
  | "document_uploaded"
  | "document_downloaded"
  | "document_viewed"
  | "message_sent"
  | "profile_confirmed"
  | "photo_updated"
  | "photo_removed"
  | "logo_updated"
  | "logo_removed"
  | "logo_display_changed"
  | "change_requested"
  | "change_request_decided"
  | "partner_document_uploaded"
  | "partner_document_status"
  | "view_as_started"
  | "view_as_ended"
  | "case_assigned"
  | "case_unassigned"
  | "special_submitted"
  | "support_ticket_created"
  | "support_status_changed";

export const AUDIT_LABELS: Record<string, string> = {
  login: "Login",
  login_failed: "Login fehlgeschlagen",
  login_blocked: "Login gesperrt",
  magic_link_requested: "Magic Link angefordert",
  magic_link_login: "Login per Magic Link",
  logout: "Abgemeldet",
  access_activated: "Zugang aktiviert",
  password_reset_requested: "Passwort-Reset angefordert",
  password_reset: "Passwort geändert",
  case_opened: "Case geöffnet",
  access_denied: "Zugriff verweigert",
  partner_invited: "Partner eingeladen",
  invite_resent: "Einladung erneut gesendet",
  partner_disabled: "Partner deaktiviert",
  partner_enabled: "Partner reaktiviert",
  document_uploaded: "Dokument hochgeladen",
  document_downloaded: "Dokument heruntergeladen",
  document_viewed: "Dokument angesehen",
  message_sent: "Nachricht gesendet",
  profile_confirmed: "Angaben bestätigt",
  photo_updated: "Profilfoto geändert",
  photo_removed: "Profilfoto entfernt",
  logo_updated: "Firmenlogo geändert",
  logo_removed: "Firmenlogo entfernt",
  logo_display_changed: "Logo-Darstellung geändert",
  change_requested: "Änderung Partnerdaten beantragt",
  change_request_decided: "Änderungsantrag entschieden",
  partner_document_uploaded: "Firmendokument hochgeladen",
  partner_document_status: "Status Firmendokument gesetzt",
  view_as_started: "Als Partner angesehen",
  view_as_ended: "Partneransicht beendet",
  case_assigned: "Case zugeordnet",
  case_unassigned: "Zuordnung entfernt",
  special_submitted: "Spezialfinanzierung eingereicht",
  support_ticket_created: "Support-Meldung erstellt",
  support_status_changed: "Status einer Support-Meldung geändert",
};

/** Never throws: a failed audit write must not break the action being audited. */
export async function audit(entry: {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  target?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.portalAuditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        target: entry.target ? entry.target.slice(0, 500) : null,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[portal] audit write failed", entry.action, err);
  }
}
