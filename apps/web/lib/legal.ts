import { TERMS_VERSION } from "@domma/core";

/**
 * Dados da empresa que aparecem nos termos. Vêm de variáveis do site (LEGAL_…), para a empresa
 * preencher sem mexer no código. Enquanto faltar algum, os documentos avisam que estão em revisão.
 */
export const COMPANY = {
  name: process.env.LEGAL_COMPANY_NAME || null,
  cnpj: process.env.LEGAL_COMPANY_CNPJ || null,
  address: process.env.LEGAL_COMPANY_ADDRESS || null,
  contactEmail: process.env.LEGAL_CONTACT_EMAIL || null,
  dpoName: process.env.LEGAL_DPO_NAME || null,
  dpoEmail: process.env.LEGAL_DPO_EMAIL || null,
};

export const COMPANY_COMPLETE = Boolean(COMPANY.name && COMPANY.cnpj && COMPANY.address && COMPANY.contactEmail && COMPANY.dpoEmail);
/** Os documentos só deixam de avisar "em revisão" quando a empresa confirma que um advogado revisou. */
export const LEGAL_REVIEWED = process.env.LEGAL_REVIEWED === "true";
export const LEGAL_VERSION = TERMS_VERSION;
export const LEGAL_DATE = new Date(`${TERMS_VERSION}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

export const companyLine = () =>
  COMPANY.name ? `${COMPANY.name}${COMPANY.cnpj ? `, inscrita no CNPJ sob o nº ${COMPANY.cnpj}` : ""}${COMPANY.address ? `, com sede em ${COMPANY.address}` : ""}` : "a empresa responsável pelo Domma Mart";
export const contactLine = () => (COMPANY.contactEmail ? `pelo e-mail ${COMPANY.contactEmail} ou pela página de Ajuda` : "pela página de Ajuda");
export const dpoLine = () => (COMPANY.dpoEmail ? `${COMPANY.dpoName ? `${COMPANY.dpoName}, ` : ""}pelo e-mail ${COMPANY.dpoEmail}` : "pela página de Ajuda");
