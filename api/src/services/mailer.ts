import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

let _transporter: Transporter | null = null;

/** True when SMTP is configured; otherwise mails are logged, not sent. */
export function isMailEnabled(): boolean {
  return !!config.smtpHost;
}

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined,
    });
  }
  return _transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends a mail, or logs it when SMTP is not configured.
 *
 * Never throws: every caller sends mail as a side effect of a request that must
 * succeed on its own (registration, password reset), so a broken mail server
 * must not turn into a failed sign-up. Callers log the returned false.
 */
export async function sendMail(mail: MailInput): Promise<boolean> {
  if (!isMailEnabled()) {
    console.info(`[mailer] SMTP not configured — would send "${mail.subject}" to ${mail.to}`);
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: config.smtpFrom,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch {
    return false;
  }
}
