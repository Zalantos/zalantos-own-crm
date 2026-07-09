import { unzip, type Unzipped, type UnzipFileInfo } from "fflate";
import {
  contentTypeForFilename,
  isSupportedContextFilename,
} from "@/lib/entity-context/file-types";

// Rutas de metadata que agregan macOS/algunos zippers y no son documentos.
function isJunkEntry(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  return (
    path.startsWith("__MACOSX/") ||
    path.includes("/__MACOSX/") ||
    base.startsWith("._") ||
    base === ".DS_Store"
  );
}

// Solo interesan archivos soportados; las carpetas terminan en "/" y se saltan.
// El filtro corre antes de descomprimir cada entrada para no gastar trabajo en
// lo que se va a descartar.
function shouldExtract(entry: UnzipFileInfo): boolean {
  const path = entry.name;
  if (path.endsWith("/")) return false;
  if (isJunkEntry(path)) return false;
  return isSupportedContextFilename(path);
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter: shouldExtract }, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

// Descomprime un ZIP en el navegador y devuelve un File por cada documento
// soportado, recorriendo subcarpetas. El nombre conserva la ruta interna
// (ej. "Empresa/2024/propuesta.pdf") para dar contexto de la carpeta de origen.
export async function extractSupportedFilesFromZip(
  zip: File,
): Promise<File[]> {
  const buffer = new Uint8Array(await zip.arrayBuffer());
  const entries = await unzipAsync(buffer);

  const files: File[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    if (bytes.length === 0) continue;
    const contentType = contentTypeForFilename(path);
    // El slice evita compartir el buffer subyacente entre varios File.
    files.push(
      new File([bytes.slice()], path, {
        type: contentType,
        lastModified: zip.lastModified,
      }),
    );
  }
  return files;
}
