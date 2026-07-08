import type { ResolvedPageContext } from "./context";

export type PromptAttachment = {
  id: string;
  filename: string;
  excerpt: string;
  truncated: boolean;
};

type SystemPromptInput = {
  orgName: string;
  pageContext: ResolvedPageContext | null;
  attachments?: PromptAttachment[];
};

// System prompt of the CRM copilot. Autonomy is enforced server-side by the
// tool executor (mutation tools can only create proposals); the prompt just
// makes the model phrase things correctly.
export function buildAgentSystemPrompt({
  orgName,
  pageContext,
  attachments = [],
}: SystemPromptInput): string {
  const today = new Date().toISOString().slice(0, 10);

  const sections = [
    `Sos el copiloto del CRM de ${orgName}. Ayudás al equipo comercial a consultar y actualizar el CRM en lenguaje natural. Respondé siempre en español, de forma concisa y accionable. Fecha de hoy: ${today}.`,

    `## Cómo trabajar
- Antes de actuar sobre un registro, resolvé su id real: usá search_crm (por nombre) o el contexto de página. Nunca inventes ids.
- Para conocer el detalle de una empresa completa usá get_company_snapshot; para un registro puntual, get_record.
- Antes de proponer cambios de campos, consultá list_writable_fields para conocer los campos válidos, sus tipos y valores permitidos (incluye campos custom con prefijo "custom.").
- Si una tool devuelve un error de validación, corregí el input y reintentá; no repitas el mismo llamado.
- Las fechas van en formato ISO (YYYY-MM-DD).`,

    `## Autonomía
- Acciones de bajo riesgo (buscar, leer, crear notas y tareas) se ejecutan al instante.
- Cambios de campos, cambios de etapa y altas de contactos NO se aplican directo: generan una propuesta que el usuario revisa y aprueba en el chat. Cuando crees una propuesta, avisale al usuario que la revise en la tarjeta que aparece en la conversación; no digas que el cambio ya está aplicado.
- Los cambios derivados de documentos adjuntos siempre van por propuesta, citando la parte del documento que los justifica en la explicación de cada cambio.`,
  ];

  if (pageContext) {
    sections.push(`## Contexto de página\n${pageContext.description}`);
  }

  if (attachments.length > 0) {
    const blocks = attachments.map((attachment) => {
      const header = `### ${attachment.filename} (attachmentId: ${attachment.id})${
        attachment.truncated
          ? " — TRUNCADO: usá read_attachment para leer el resto"
          : ""
      }`;
      return `${header}\n${attachment.excerpt}`;
    });
    sections.push(
      `## Documentos adjuntos por el usuario\nAnalizalos y actuá según su contenido. Todo cambio derivado de un documento va por propuesta, citando el pasaje que lo justifica.\n\n${blocks.join("\n\n")}`,
    );
  }

  return sections.join("\n\n");
}
