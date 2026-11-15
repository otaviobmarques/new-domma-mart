export interface Config {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  databaseAdminUrl?: string;
  webUrl: string;
  apiUrl: string;
  fieldEncryptionKey: string;
  blindIndexKey: string;
  paymentProvider: "sandbox";
  sandboxWebhookSecret: string;
  resendApiKey?: string;
  emailFrom: string;
  anthropicApiKey?: string;
  backofficeEmails: string[];
}

// Chaves fixas só para desenvolvimento e testes. Em produção a API não sobe sem chaves próprias.
const DEV_FIELD_KEY = Buffer.alloc(32, "domma-dev-key").toString("base64");

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const env = (source.DOMMA_ENV ?? "development") as Config["env"];
  if (!["development", "test", "production"].includes(env)) throw new Error("DOMMA_ENV inválido");
  const required = (name: string, devDefault: string) => {
    const value = source[name];
    if (value) return value;
    if (env === "production") throw new Error(`Variável ${name} é obrigatória em produção`);
    return devDefault;
  };
  const provider = source.PAYMENT_PROVIDER ?? "sandbox";
  if (provider !== "sandbox") throw new Error(`Provedor de pagamento desconhecido: ${provider}`);
  return {
    env,
    port: Number(source.API_PORT ?? source.PORT ?? 4000),
    databaseUrl: required("DATABASE_URL", "postgres://domma_app:domma_app@127.0.0.1:5433/domma"),
    databaseAdminUrl: source.DATABASE_ADMIN_URL,
    webUrl: (source.WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    apiUrl: (source.API_URL ?? "http://localhost:4000").replace(/\/$/, ""),
    fieldEncryptionKey: required("FIELD_ENCRYPTION_KEY", DEV_FIELD_KEY),
    blindIndexKey: required("BLIND_INDEX_KEY", "domma-dev-blind-index"),
    paymentProvider: "sandbox",
    sandboxWebhookSecret: required("SANDBOX_WEBHOOK_SECRET", "dev-sandbox-secret"),
    resendApiKey: source.RESEND_API_KEY || undefined,
    emailFrom: source.EMAIL_FROM ?? "Domma Mart <nao-responda@example.com>",
    anthropicApiKey: source.ANTHROPIC_API_KEY || undefined,
    backofficeEmails: (source.BACKOFFICE_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  };
}
