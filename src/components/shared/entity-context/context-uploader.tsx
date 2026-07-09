"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UploadProgressBar } from "@/components/shared/meeting/meeting-processing-progress";
import {
  processContextSources,
  registerContextSource,
} from "@/app/(dashboard)/entity-context/actions";
import {
  isSupportedContextFilename,
  isZipFile,
} from "@/lib/entity-context/file-types";
import { extractSupportedFilesFromZip } from "@/lib/entity-context/zip";
import type { ContextEntityType } from "@/lib/entity-context/types";

type UploadState = {
  currentFileName: string;
  currentFileIndex: number;
  totalFiles: number;
  percent: number;
};

// Expande ZIPs a sus documentos internos (recorriendo subcarpetas) y descarta
// lo que no sea PDF/DOCX/DOC/TXT/MD.
async function expandSelection(files: File[]): Promise<File[]> {
  const expanded: File[] = [];
  for (const file of files) {
    if (isZipFile(file)) {
      expanded.push(...(await extractSupportedFilesFromZip(file)));
      continue;
    }
    if (isSupportedContextFilename(file.name)) {
      expanded.push(file);
    }
  }
  return expanded;
}

export function ContextUploader({
  entityType,
  entityId,
}: {
  entityType: ContextEntityType;
  entityId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  function uploadToR2({
    url,
    file,
    contentType,
    onProgress,
  }: {
    url: string;
    file: File;
    contentType: string;
    onProgress: (percent: number) => void;
  }) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("content-type", contentType);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(new Error("La subida a R2 falló"));
      };
      xhr.onerror = () => reject(new Error("La subida a R2 falló"));
      xhr.send(file);
    });
  }

  async function uploadFile(file: File, index: number, totalFiles: number) {
    const contentType = file.type || "application/octet-stream";
    setUploadState({
      currentFileName: file.name,
      currentFileIndex: index,
      totalFiles,
      percent: 0,
    });

    const presignRes = await fetch("/api/entity-context/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        filename: file.name,
        contentType,
      }),
    });
    if (!presignRes.ok) {
      const payload = (await presignRes.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "No se pudo generar la URL de subida");
    }
    const { url, key } = (await presignRes.json()) as {
      url: string;
      key: string;
    };

    await uploadToR2({
      url,
      file,
      contentType,
      onProgress: (percent) =>
        setUploadState({
          currentFileName: file.name,
          currentFileIndex: index,
          totalFiles,
          percent,
        }),
    });

    const { sourceId } = await registerContextSource({
      entityType,
      entityId,
      filename: file.name,
      mimeType: contentType,
      storagePath: key,
      sizeBytes: file.size,
      // El análisis se dispara una sola vez con el lote completo.
      deferProcessing: true,
    });
    return sourceId;
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);

    let fileArray: File[];
    try {
      const selection = Array.from(files);
      if (selection.some((file) => isZipFile(file))) {
        setPreparing(true);
        toast.info("Descomprimiendo ZIP…");
      }
      fileArray = await expandSelection(selection);
    } catch {
      toast.error("No se pudo leer el ZIP.");
      setUploading(false);
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    } finally {
      setPreparing(false);
    }

    if (fileArray.length === 0) {
      toast.error("No se encontraron documentos PDF, DOCX, DOC, TXT o MD.");
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const sourceIds: string[] = [];
    try {
      for (const [index, file] of fileArray.entries()) {
        const sourceId = await uploadFile(file, index + 1, fileArray.length);
        sourceIds.push(sourceId);
        toast.success(`"${file.name}" subido.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    }
    try {
      // Aunque falle una subida intermedia, se analiza lo que sí se subió.
      if (sourceIds.length > 0) {
        await processContextSources({ entityType, entityId, sourceIds });
        toast.success(
          sourceIds.length === 1
            ? "Analizando el documento…"
            : `Analizando ${sourceIds.length} documentos en conjunto…`,
        );
        router.refresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al iniciar el análisis",
      );
    } finally {
      setUploading(false);
      setUploadState(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-md border border-dashed p-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.md,.zip,application/pdf,text/*,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          PDF, DOCX, TXT, Markdown o un ZIP con carpetas. La IA genera un perfil
          y propone campos.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading && <Loader2Icon className="animate-spin" />}
          {preparing
            ? "Descomprimiendo..."
            : uploading
              ? "Subiendo..."
              : "Subir documento"}
        </Button>
      </div>
      {uploadState && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate">
              {uploadState.currentFileIndex}/{uploadState.totalFiles} ·{" "}
              {uploadState.currentFileName}
            </span>
            <span className="text-muted-foreground">
              {uploadState.percent}%
            </span>
          </div>
          <UploadProgressBar value={uploadState.percent} />
        </div>
      )}
    </div>
  );
}
