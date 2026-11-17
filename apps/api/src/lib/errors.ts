/** Erro com mensagem pronta para mostrar à pessoa, em linguagem simples. */
export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details);
export const unauthorized = (message = "Entre na sua conta para continuar.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "Você não tem permissão para isso.") => new ApiError(403, "forbidden", message);
export const notFound = (what = "Registro") => new ApiError(404, "not_found", `${what} não encontrado.`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const unprocessable = (code: string, message: string, details?: unknown) => new ApiError(422, code, message, details);
export const tooMany = (message = "Muitas tentativas. Espere um pouco e tente de novo.") => new ApiError(429, "rate_limited", message);
