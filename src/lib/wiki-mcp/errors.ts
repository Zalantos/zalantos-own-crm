// Tipos de fallo que el agente debe poder distinguir. "Sin evidencia" no está
// aquí a propósito: es una respuesta válida de la Wiki, nunca un error.
export type WikiErrorKind =
  | "access_denied"
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_request"
  | "invalid_response";

// El mensaje nunca incluye texto remoto: se muestra al modelo y puede llegar a
// logs, y una respuesta de la Wiki o de Entra podría traer contenido sensible.
export class WikiMcpError extends Error {
  readonly kind: WikiErrorKind;

  constructor(kind: WikiErrorKind, message: string = kind) {
    super(message);
    this.name = "WikiMcpError";
    this.kind = kind;
  }
}
