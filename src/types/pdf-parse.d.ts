// pdf-parse ships no types and its package index runs debug code on import,
// so we import the internal entrypoint. Declare it here.
declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfParseResult = { text: string; numpages: number; info: unknown };
  export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
