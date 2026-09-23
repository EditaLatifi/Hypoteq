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
  | "message_sent"
  | "profile_confirmed"
  | "view_as_started"
  | "view_as_ended"
  | "case_assigned"
  | "case_unassigned";

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
  message_sent: "Nachricht gesendet",
  profile_confirmed: "Angaben bestätigt",
  view_as_started: "Als Partner angesehen",
  view_as_ended: "Partneransicht beendet",
  case_assigned: "Case zugeordnet",
  case_unassigned: "Zuordnung entfernt",
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
