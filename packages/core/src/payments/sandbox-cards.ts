/** Números de cartão de teste -> token. Usado só no navegador, pelo campo simulado do provedor. */
export const SANDBOX_CARD_NUMBERS: Record<string, string> = {
  "4242424242424242": "tok_test_approved",
  "4000000000009995": "tok_test_insufficient_funds",
  "4000000000000002": "tok_test_declined",
  "4100000000000019": "tok_test_fraud",
};
