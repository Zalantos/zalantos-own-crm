"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  registerEvidence,
  reprocessMeeting,
} from "@/app/(dashboard)/meetings/evidence-actions";

export function EvidenceUploader({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File) {
    // 1. Ask the server for a presigned R2 URL.
    const presignRes = await fetch("/api/evidence/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        meetingId,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    });
    if (!presignRes.ok) throw new Error("No se pudo generar la URL de subida");
    const { url, key } = (await presignRes.json()) as {
      url: string;
      key: string;
    };

    // 2. Upload straight to R2.
    const putRes = await fetch(url, {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("La subida a R2 falló");

    // 3. Register the evidence and kick off the pipeline.
    await registerEvidence({
      meetingId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      storagePath: key,
      sizeBytes: file.size,
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file);
        toast.success(`"${file.name}" subido.`);
      }
      // Trigger the pipeline once, after all files are registered.
      await reprocessMeeting(meetingId);
      toast.success("Procesando evidencia con IA...");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-md border border-dashed p-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/*,video/*,.pdf,.docx,.doc,.txt,.md"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Audio, video, PDF, DOCX, TXT o Markdown. Se procesa automáticamente.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Subiendo..." : "Subir evidencia"}
        </Button>
      </div>
    </div>
  );
}
