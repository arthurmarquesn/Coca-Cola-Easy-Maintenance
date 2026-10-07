/* =========================================================
   DOMÍNIO DE E-MAIL

   Só e-mails corporativos (@kof.com) entram e são
   cadastrados. ALLOWED_EMAIL_DOMAINS (lista separada por
   vírgula) troca a lista; em desenvolvimento ela inclui
   example.com para as contas de teste de
   database/migrations/20261005_seed_test_users.sql.
   scripts/create-user.mjs aplica a mesma regra.
========================================================= */

const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["kof.com"];

export function getAllowedEmailDomains(): string[] {
  const configured = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  return configured.length > 0
    ? configured
    : DEFAULT_ALLOWED_EMAIL_DOMAINS;
}

/* Compara o domínio inteiro: "x@kof.com.br" e
   "x@mail.kof.com" não passam. */
export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");

  if (at < 1) {
    return false;
  }

  const domain = email.slice(at + 1).trim().toLowerCase();

  return getAllowedEmailDomains().includes(domain);
}

export function emailDomainMessage(): string {
  /* A mensagem mostra só o domínio corporativo: os de
     desenvolvimento não aparecem para o usuário. */
  const corporate = getAllowedEmailDomains().find((domain) =>
    DEFAULT_ALLOWED_EMAIL_DOMAINS.includes(domain),
  ) ?? getAllowedEmailDomains()[0];

  return `Use seu e-mail corporativo @${corporate}.`;
}
