// Tipos de documento admitidos en contexto de entidad (deben coincidir con los
// "kind: text" de classifyEvidence). Se usa para filtrar el contenido de ZIPs y
// derivar content-type cuando el origen no lo trae (entradas de un archivo zip).

export const SUPPORTED_CONTEXT_EXTENSIONS = [
  "pdf",
  "docx",
  "doc",
  "txt",
  "md",
] as const;

export type SupportedContextExtension =
  (typeof SUPPORTED_CONTEXT_EXTENSIONS)[number];

const CONTENT_TYPE_BY_EXTENSION: Record<SupportedContextExtension, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
};

export function getFileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isSupportedContextFilename(filename: string): boolean {
  return (SUPPORTED_CONTEXT_EXTENSIONS as readonly string[]).includes(
    getFileExtension(filename),
  );
}

export function contentTypeForFilename(filename: string): string {
  const ext = getFileExtension(filename) as SupportedContextExtension;
  return CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export function isZipFile(file: { name: string; type: string }): boolean {
  return (
    getFileExtension(file.name) === "zip" ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}
