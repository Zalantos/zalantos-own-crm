"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const LEVEL_COUNT = 64;
const SAMPLE_INTERVAL_MS = 50;
const ELAPSED_INTERVAL_MS = 200;
const STATIC_LEVELS = Array.from({ length: LEVEL_COUNT }, () => 0.16);

type VoiceDictateResult = {
  recording: boolean;
  transcribing: boolean;
  voiceAvailable: boolean;
  levels: number[];
  elapsedMs: number;
  toggleRecording: () => void;
  cancelRecording: () => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function statusHasAvailability(
  payload: unknown,
): payload is { available: boolean } {
  if (!payload || typeof payload !== "object" || !("available" in payload)) {
    return false;
  }
  return typeof payload.available === "boolean";
}

export function useVoiceDictate(
  onText: (text: string) => void,
): VoiceDictateResult {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [levels, setLevels] = useState<number[]>(STATIC_LEVELS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const levelsRef = useRef<number[]>(STATIC_LEVELS);
  const startedAtRef = useRef(0);
  const shouldTranscribeRef = useRef(false);
  const mountedRef = useRef(true);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const resetLevels = useCallback(() => {
    levelsRef.current = STATIC_LEVELS;
    if (mountedRef.current) setLevels(STATIC_LEVELS);
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const cleanupRecordingResources = useCallback(() => {
    clearElapsedTimer();
    stopAudioAnalysis();
    stopStream();
  }, [clearElapsedTimer, stopAudioAnalysis, stopStream]);

  const transcribe = useCallback(async (audio: Blob) => {
    const controller = new AbortController();
    transcribeAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("audio", audio, "dictado.webm");
      const response = await fetch("/api/portal/voice/transcribe", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      const error =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : null;
      const text =
        payload &&
        typeof payload === "object" &&
        "text" in payload &&
        typeof payload.text === "string"
          ? payload.text.trim()
          : "";

      if (!response.ok || !text) {
        if (mountedRef.current) {
          toast.error(error ?? "No se pudo transcribir el dictado.");
        }
        return;
      }

      if (mountedRef.current) onTextRef.current(text);
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        toast.error("No se pudo transcribir el dictado.");
      }
    } finally {
      if (transcribeAbortRef.current === controller) {
        transcribeAbortRef.current = null;
      }
      if (mountedRef.current) setTranscribing(false);
    }
  }, []);

  const startAudioAnalysis = useCallback(
    (stream: MediaStream) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        resetLevels();
        return;
      }

      try {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.55;
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
        sourceRef.current = source;
        void context.resume().catch(() => undefined);

        const samples = new Uint8Array(analyser.fftSize);
        sampleTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 6);
          const next = [...levelsRef.current.slice(1), level];
          levelsRef.current = next;
          if (mountedRef.current) setLevels(next);
        }, SAMPLE_INTERVAL_MS);
      } catch {
        // Metering is visual feedback only. Recording remains available.
        resetLevels();
      }
    },
    [resetLevels],
  );

  const stopRecorder = useCallback((discard: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    shouldTranscribeRef.current = !discard;
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    if (transcribing) return;
    shouldTranscribeRef.current = false;
    stopRecorder(true);
  }, [stopRecorder, transcribing]);

  const startRecording = useCallback(async () => {
    if (!voiceAvailable) {
      toast.error("El dictado no está disponible en este momento.");
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Tu navegador no permite grabar audio.");
      return;
    }

    let capturedStream: MediaStream | null = null;
    try {
      capturedStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const stream = capturedStream;
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      shouldTranscribeRef.current = false;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      resetLevels();
      startAudioAnalysis(stream);
      clearElapsedTimer();
      elapsedTimerRef.current = window.setInterval(() => {
        if (mountedRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current);
        }
      }, ELAPSED_INTERVAL_MS);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const shouldTranscribe = shouldTranscribeRef.current;
        const mimeType = recorder.mimeType || "audio/webm";
        const audio = new Blob(chunksRef.current, { type: mimeType });
        recorderRef.current = null;
        chunksRef.current = [];
        cleanupRecordingResources();
        resetLevels();

        if (!mountedRef.current) return;
        setRecording(false);
        setElapsedMs(0);
        if (!shouldTranscribe) {
          setTranscribing(false);
          return;
        }
        if (audio.size === 0) {
          setTranscribing(false);
          toast.error("No se registró audio. Intentá nuevamente.");
          return;
        }
        void transcribe(audio);
      };
      recorder.start();
    } catch {
      capturedStream?.getTracks().forEach((track) => track.stop());
      cleanupRecordingResources();
      if (mountedRef.current) {
        setRecording(false);
        toast.error("No se pudo acceder al micrófono.");
      }
    }
  }, [
    cleanupRecordingResources,
    clearElapsedTimer,
    resetLevels,
    startAudioAnalysis,
    transcribe,
    voiceAvailable,
  ]);

  const toggleRecording = useCallback(() => {
    if (transcribing) return;
    if (recorderRef.current?.state === "recording") {
      shouldTranscribeRef.current = true;
      setTranscribing(true);
      stopRecorder(false);
      return;
    }
    void startRecording();
  }, [startRecording, stopRecorder, transcribing]);

  useEffect(() => {
    let cancelled = false;
    const locallyEnabled =
      window.localStorage.getItem("voiceEnabled") !== "false";
    if (!locallyEnabled) return;

    void fetch("/api/portal/voice/status")
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const available =
          response.ok && statusHasAvailability(payload) && payload.available;
        if (!cancelled) setVoiceAvailable(available);
      })
      .catch(() => {
        if (!cancelled) setVoiceAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelRecording();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRecording, recording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      shouldTranscribeRef.current = false;
      transcribeAbortRef.current?.abort();
      clearElapsedTimer();
      stopAudioAnalysis();
      stopStream();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, [clearElapsedTimer, stopAudioAnalysis, stopStream]);

  return {
    recording,
    transcribing,
    voiceAvailable,
    levels,
    elapsedMs,
    toggleRecording,
    cancelRecording,
  };
}
