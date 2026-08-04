import type { MailInput } from "./mailer.js";

export type MailLocale = "de" | "en";

export function normalizeLocale(locale?: string): MailLocale {
  return locale?.toLowerCase().startsWith("en") ? "en" : "de";
}

export interface MailDetail {
  label: string;
  value: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDetails(details: MailDetail[]): string {
  if (details.length === 0) return "";
  const rows = details
    .map(
      (d) =>
        `<tr><td style="padding:6px 16px 6px 0;font-size:14px;color:#6b7280;">${escapeHtml(d.label)}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(d.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;padding:8px 0;">${rows}</table>`;
}

/**
 * Mail clients ignore <style> blocks and external CSS inconsistently, so the
 * layout is deliberately plain with inline styles only.
 */
function layout(
  heading: string,
  body: string,
  buttonLabel: string,
  url: string,
  footer: string,
  details: MailDetail[] = [],
): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:600;">LearnForge</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${heading}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${body}</p>
        ${renderDetails(details)}
        <p style="margin:0 0 24px;">
          <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">${buttonLabel}</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6;">${footer}</p>
        <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all;">${url}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

interface MailCopy {
  subject: string;
  heading: string;
  body: string;
  button: string;
  footer: string;
  textIntro: string;
  textOutro: string;
}

const COPY: Record<"verify" | "reset", Record<MailLocale, MailCopy>> = {
  verify: {
    de: {
      subject: "Bestätige deine E-Mail-Adresse",
      heading: "Willkommen bei LearnForge",
      body: "Bitte bestätige deine E-Mail-Adresse, um dein Konto vollständig zu aktivieren.",
      button: "E-Mail bestätigen",
      footer: "Der Link ist 24 Stunden gültig. Falls du dich nicht registriert hast, kannst du diese Mail ignorieren. Funktioniert der Button nicht, öffne diesen Link:",
      textIntro: "Bitte bestätige deine E-Mail-Adresse für LearnForge:",
      textOutro: "Der Link ist 24 Stunden gültig. Falls du dich nicht registriert hast, ignoriere diese Mail.",
    },
    en: {
      subject: "Confirm your e-mail address",
      heading: "Welcome to LearnForge",
      body: "Please confirm your e-mail address to fully activate your account.",
      button: "Confirm e-mail",
      footer: "This link is valid for 24 hours. If you did not sign up, you can ignore this mail. If the button does not work, open this link:",
      textIntro: "Please confirm your e-mail address for LearnForge:",
      textOutro: "This link is valid for 24 hours. If you did not sign up, please ignore this mail.",
    },
  },
  reset: {
    de: {
      subject: "Passwort zurücksetzen",
      heading: "Passwort zurücksetzen",
      body: "Für dein LearnForge-Konto wurde ein neues Passwort angefordert. Klicke auf den Button, um ein neues Passwort zu setzen.",
      button: "Neues Passwort setzen",
      footer: "Der Link ist 1 Stunde gültig und kann nur einmal verwendet werden. Falls du das nicht warst, ändert sich nichts an deinem Konto — du kannst diese Mail ignorieren. Funktioniert der Button nicht, öffne diesen Link:",
      textIntro: "Für dein LearnForge-Konto wurde ein neues Passwort angefordert. Neues Passwort setzen:",
      textOutro: "Der Link ist 1 Stunde gültig und nur einmal verwendbar. Falls du das nicht warst, ignoriere diese Mail — dein Konto bleibt unverändert.",
    },
    en: {
      subject: "Reset your password",
      heading: "Reset your password",
      body: "A password reset was requested for your LearnForge account. Click the button below to set a new password.",
      button: "Set new password",
      footer: "This link is valid for 1 hour and can only be used once. If this wasn't you, nothing changes on your account — you can ignore this mail. If the button does not work, open this link:",
      textIntro: "A password reset was requested for your LearnForge account. Set a new password:",
      textOutro: "This link is valid for 1 hour and can only be used once. If this wasn't you, ignore this mail — your account stays unchanged.",
    },
  },
};

function build(copy: MailCopy, to: string, url: string): MailInput {
  return {
    to,
    subject: copy.subject,
    html: layout(copy.heading, copy.body, copy.button, url, copy.footer),
    text: `${copy.textIntro}\n\n${url}\n\n${copy.textOutro}`,
  };
}

export function buildVerificationMail(to: string, url: string, locale: MailLocale): MailInput {
  return build(COPY.verify[locale], to, url);
}

export function buildPasswordResetMail(to: string, url: string, locale: MailLocale): MailInput {
  return build(COPY.reset[locale], to, url);
}

// ── Subscription lifecycle ─────────────────────────────────────────────────

export function formatMailDate(date: Date, locale: MailLocale): string {
  return date.toLocaleDateString(locale === "de" ? "de-AT" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Vienna",
  });
}

export function formatMailAmount(
  amountMinor: number,
  currency: string,
  locale: MailLocale,
): string {
  return new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

export interface SubscriptionMailData {
  /** Localized plan name, e.g. "Monatlich". Omitted from the mail when null. */
  planLabel?: string | null;
  /** Preformatted via formatMailAmount. */
  amount?: string | null;
  /** Preformatted via formatMailDate — next billing date, or last day of access. */
  date?: string | null;
  /** Where the button points: Stripe customer portal, or the app for a re-subscribe. */
  actionUrl: string;
  /** Base app URL, used for the AGB link in the legal footnote. */
  appUrl: string;
}

const SUBSCRIPTION_COPY = {
  confirmed: {
    de: {
      subject: "Dein LearnForge-Abo ist aktiv",
      heading: "Willkommen an Bord",
      body: "Danke für dein Abo — dein Zugang ist ab sofort freigeschaltet. Hier die Eckdaten deines Vertrags:",
      button: "Abo verwalten",
      labelPlan: "Plan",
      labelAmount: "Betrag",
      labelDate: "Nächste Abrechnung",
      footer: "Über den Button kommst du jederzeit ins Kundenportal, wo du Zahlungsmittel ändern, Rechnungen abrufen und kündigen kannst. Die Rechnung schickt dir Stripe separat. Es gelten unsere AGB inklusive Widerrufsbelehrung:",
      textIntro: "Danke für dein LearnForge-Abo — dein Zugang ist freigeschaltet.",
      textOutro: "Im Kundenportal kannst du dein Abo jederzeit verwalten oder kündigen. Es gelten unsere AGB inklusive Widerrufsbelehrung.",
    },
    en: {
      subject: "Your LearnForge subscription is active",
      heading: "Welcome aboard",
      body: "Thanks for subscribing — your access is unlocked. Here are the details of your contract:",
      button: "Manage subscription",
      labelPlan: "Plan",
      labelAmount: "Amount",
      labelDate: "Next billing date",
      footer: "The button takes you to the customer portal any time, where you can change your payment method, download invoices and cancel. Stripe sends the invoice separately. Our terms, including the right of withdrawal, apply:",
      textIntro: "Thanks for subscribing to LearnForge — your access is unlocked.",
      textOutro: "You can manage or cancel your subscription in the customer portal at any time. Our terms, including the right of withdrawal, apply.",
    },
  },
  canceled: {
    de: {
      subject: "Deine Kündigung ist bestätigt",
      heading: "Kündigung bestätigt",
      body: "Wir haben deine Kündigung erhalten. Dein Zugang bleibt bis zum Ende der bezahlten Periode vollständig erhalten — es wird nichts mehr abgebucht.",
      button: "Abo verwalten",
      labelPlan: "Plan",
      labelAmount: "Betrag",
      labelDate: "Zugang bis",
      footer: "Du hast es dir anders überlegt? Im Kundenportal kannst du die Kündigung bis zum Ablaufdatum wieder zurücknehmen. Deine Karten und Lernfortschritte bleiben in jedem Fall erhalten:",
      textIntro: "Wir haben deine Kündigung erhalten. Dein Zugang bleibt bis zum Ende der bezahlten Periode erhalten.",
      textOutro: "Im Kundenportal kannst du die Kündigung bis zum Ablaufdatum zurücknehmen. Deine Karten und Lernfortschritte bleiben erhalten.",
    },
    en: {
      subject: "Your cancellation is confirmed",
      heading: "Cancellation confirmed",
      body: "We received your cancellation. Your access stays fully intact until the end of the period you already paid for — nothing further will be charged.",
      button: "Manage subscription",
      labelPlan: "Plan",
      labelAmount: "Amount",
      labelDate: "Access until",
      footer: "Changed your mind? You can undo the cancellation in the customer portal up until that date. Your cards and learning progress are kept either way:",
      textIntro: "We received your cancellation. Your access stays intact until the end of the period you already paid for.",
      textOutro: "You can undo the cancellation in the customer portal until that date. Your cards and learning progress are kept either way.",
    },
  },
  ended: {
    de: {
      subject: "Dein LearnForge-Abo ist beendet",
      heading: "Dein Abo ist beendet",
      body: "Die bezahlte Periode ist abgelaufen, dein Abo wurde beendet. Deine Themen, Karten und Lernfortschritte bleiben vollständig gespeichert — du kannst sie weiterhin ansehen, aber keine neuen Karten mehr anlegen oder bearbeiten.",
      button: "Abo erneut abschließen",
      labelPlan: "Plan",
      labelAmount: "Betrag",
      labelDate: "Beendet am",
      footer: "Schade, dass du gehst. Wenn du zurückkommen möchtest, ist dein alter Lernstand genau so da, wie du ihn verlassen hast:",
      textIntro: "Die bezahlte Periode ist abgelaufen, dein LearnForge-Abo wurde beendet.",
      textOutro: "Deine Themen, Karten und Lernfortschritte bleiben gespeichert. Du kannst jederzeit wieder abschließen.",
    },
    en: {
      subject: "Your LearnForge subscription has ended",
      heading: "Your subscription has ended",
      body: "The period you paid for has run out and your subscription has ended. Your topics, cards and learning progress are kept in full — you can still view them, but you cannot create or edit cards any more.",
      button: "Subscribe again",
      labelPlan: "Plan",
      labelAmount: "Amount",
      labelDate: "Ended on",
      footer: "Sorry to see you go. If you come back, your learning progress will be exactly where you left it:",
      textIntro: "The period you paid for has run out and your LearnForge subscription has ended.",
      textOutro: "Your topics, cards and learning progress are kept. You can subscribe again at any time.",
    },
  },
} as const;

type SubscriptionMailKind = keyof typeof SUBSCRIPTION_COPY;

function buildSubscriptionMail(
  kind: SubscriptionMailKind,
  to: string,
  data: SubscriptionMailData,
  locale: MailLocale,
): MailInput {
  const copy = SUBSCRIPTION_COPY[kind][locale];
  const agbUrl = `${data.appUrl}/${locale === "de" ? "agb" : "terms"}`;

  const details: MailDetail[] = [];
  if (data.planLabel) details.push({ label: copy.labelPlan, value: data.planLabel });
  if (data.amount) details.push({ label: copy.labelAmount, value: data.amount });
  if (data.date) details.push({ label: copy.labelDate, value: data.date });

  const textDetails = details.map((d) => `${d.label}: ${d.value}`).join("\n");

  return {
    to,
    subject: copy.subject,
    html: layout(copy.heading, copy.body, copy.button, data.actionUrl, `${copy.footer} ${agbUrl}`, details),
    text: [copy.textIntro, textDetails, data.actionUrl, copy.textOutro, agbUrl]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function buildSubscriptionConfirmedMail(
  to: string,
  data: SubscriptionMailData,
  locale: MailLocale,
): MailInput {
  return buildSubscriptionMail("confirmed", to, data, locale);
}

export function buildSubscriptionCanceledMail(
  to: string,
  data: SubscriptionMailData,
  locale: MailLocale,
): MailInput {
  return buildSubscriptionMail("canceled", to, data, locale);
}

export function buildSubscriptionEndedMail(
  to: string,
  data: SubscriptionMailData,
  locale: MailLocale,
): MailInput {
  return buildSubscriptionMail("ended", to, data, locale);
}
