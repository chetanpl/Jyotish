"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VoiceRecorderOptions = {
  onTranscription: (text: string) => void;
};

type RecorderStatus = "idle" | "recording" | "processing" | "ready" | "error";

const SILENCE_TIMEOUT_MS = 10_000;
const VOICE_THRESHOLD = 0.018;
const BAR_COUNT = 16;

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Recording start nahi ho saki. Dobara try karein.";
  }

  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission blocked hai. Browser site settings mein mic allow karein.";

    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Microphone nahi mila. Apna microphone check karein.";

    case "NotReadableError":
    case "TrackStartError":
      return "Microphone busy hai ya kisi aur app mein use ho raha hai.";

    case "SecurityError":
      return "Microphone ke liye HTTPS ya localhost zaroori hai.";

    default:
      return (
        error.message || "Recording start nahi ho saki. Dobara try karein."
      );
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useVoiceRecorder({ onTranscription }: VoiceRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(0),
  );

  const onTranscriptionRef = useRef(onTranscription);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const mountedRef = useRef(false);
  const cancelledRef = useRef(false);
  const sessionRef = useRef(0);
  const statusRef = useRef<RecorderStatus>("idle");
  const voiceDetectedRef = useRef(false);
  const recorderFailedRef = useRef(false);
  const lastVoiceTimeRef = useRef(0);
  const recordingStartTimeRef = useRef(0);

  const isRecording = status === "recording";
  const isProcessing = status === "processing";

  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
  }, [onTranscription]);

  const updateStatus = useCallback((next: RecorderStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }, []);

  const cleanupResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const context = audioContextRef.current;
    audioContextRef.current = null;

    if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }

    const stream = streamRef.current;
    streamRef.current = null;
    stopStream(stream);

    if (mountedRef.current) {
      setAudioLevels(Array(BAR_COUNT).fill(0));
    }
  }, []);

  const transcribe = useCallback(
    async (blob: Blob, sessionId: number) => {
      if (cancelledRef.current || sessionId !== sessionRef.current) {
        return;
      }

      updateStatus("processing");
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const mimeType = blob.type || "audio/webm";
        const extension = mimeType.includes("mp4")
          ? "mp4"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";

        const audioFile = new File([blob], `voice.${extension}`, {
          type: mimeType,
        });

        const formData = new FormData();
        formData.append("audio", audioFile);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        const result = (await response.json()) as {
          text?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || "Voice transcription failed.");
        }

        if (cancelledRef.current || sessionId !== sessionRef.current) {
          return;
        }

        const text = result.text?.trim();

        if (!text) {
          setError("Koi speech samajh nahi aayi. Dobara bolkar try karein.");
          updateStatus("ready");
          return;
        }

        setTranscript(text);
        onTranscriptionRef.current(text);
        updateStatus("ready");
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") {
          return;
        }

        if (cancelledRef.current || sessionId !== sessionRef.current) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Voice transcription failed. Dobara try karein.",
        );
        updateStatus("error");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [updateStatus],
  );

  const startRecording = useCallback(async () => {
    if (
      statusRef.current === "recording" ||
      statusRef.current === "processing"
    ) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Voice recording supported nahi hai. HTTPS ya localhost par supported browser use karein.",
      );
      updateStatus("error");
      return;
    }

    const sessionId = ++sessionRef.current;
    cancelledRef.current = false;
    voiceDetectedRef.current = false;
    recorderFailedRef.current = false;
    lastVoiceTimeRef.current = 0;
    recordingStartTimeRef.current = 0;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const previousRecorder = recorderRef.current;
    recorderRef.current = null;

    if (previousRecorder && previousRecorder.state !== "inactive") {
      previousRecorder.onstop = null;
      previousRecorder.ondataavailable = null;
      previousRecorder.onerror = null;

      try {
        previousRecorder.stop();
      } catch {
        // Recorder may already have stopped.
      }
    }

    cleanupResources();
    setError(null);
    setTranscript("");
    updateStatus("idle");

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (
        !mountedRef.current ||
        cancelledRef.current ||
        sessionId !== sessionRef.current
      ) {
        stopStream(stream);
        return;
      }

      streamRef.current = stream;

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();

      if (cancelledRef.current || sessionId !== sessionRef.current) {
        cleanupResources();
        return;
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const chunks: BlobPart[] = [];

      recordingStartTimeRef.current = performance.now();
      lastVoiceTimeRef.current = recordingStartTimeRef.current;

      let finished = false;
      let lastLevelUpdate = 0;
      const finishRecording = () => {
        if (finished) return;
        finished = true;

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      const analyseAudio = () => {
        if (
          recorderRef.current !== recorder ||
          recorder.state !== "recording" ||
          cancelledRef.current ||
          sessionId !== sessionRef.current
        ) {
          return;
        }

        analyser.getByteTimeDomainData(samples);

        let sumSquares = 0;

        for (let i = 0; i < samples.length; i += 1) {
          const normalized = (samples[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / samples.length);
        const now = performance.now();

        if (rms >= VOICE_THRESHOLD) {
          voiceDetectedRef.current = true;
          lastVoiceTimeRef.current = now;
        }

        // Real frequency spectrum (insaani awaaz ~200Hz–5kHz)
        if (mountedRef.current && now - lastLevelUpdate >= 33) {
          lastLevelUpdate = now;
          analyser.getByteFrequencyData(freq);

          const FIRST_BIN = 2;
          const LAST_BIN = 56;
          const span = (LAST_BIN - FIRST_BIN) / BAR_COUNT;

          setAudioLevels(
            Array.from({ length: BAR_COUNT }, (_, i) => {
              const start = Math.floor(FIRST_BIN + i * span);
              const end = Math.max(
                start + 1,
                Math.floor(FIRST_BIN + (i + 1) * span),
              );

              let sum = 0;
              for (let k = start; k < end; k += 1) sum += freq[k];

              return Math.min(1, (sum / (end - start) / 255) * 1.6);
            }),
          );
        }

        const silenceDuration = voiceDetectedRef.current
          ? now - lastVoiceTimeRef.current
          : now - recordingStartTimeRef.current;

        if (silenceDuration >= SILENCE_TIMEOUT_MS) {
          finishRecording();
          return;
        }

        animationFrameRef.current = requestAnimationFrame(analyseAudio);
      };

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (sessionId !== sessionRef.current) return;

        recorderFailedRef.current = true;
        setError("Recording mein problem aayi. Mic dobara dabakar try karein.");

        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Cleanup continues below.
          }
        }

        cleanupResources();

        if (recorderRef.current === recorder) {
          recorderRef.current = null;
        }

        updateStatus("error");
      };

      recorder.onstop = () => {
        const wasCancelled =
          cancelledRef.current || sessionId !== sessionRef.current;

        cleanupResources();

        if (recorderRef.current === recorder) {
          recorderRef.current = null;
        }

        if (wasCancelled || recorderFailedRef.current) return;

        if (!voiceDetectedRef.current) {
          setError("Koi awaaz nahi mili. Dobara bolne ke liye mic dabayein.");
          updateStatus("ready");
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        if (blob.size === 0) {
          setError("Recording khaali thi. Dobara bolkar try karein.");
          updateStatus("ready");
          return;
        }

        void transcribe(blob, sessionId);
      };

      recorder.start(250);
      updateStatus("recording");
      animationFrameRef.current = requestAnimationFrame(analyseAudio);
    } catch (caught) {
      stopStream(stream);

      if (sessionId !== sessionRef.current) return;

      cleanupResources();

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;

        try {
          recorder.stop();
        } catch {
          // Ignore an already stopped recorder.
        }
      }

      setError(getErrorMessage(caught));
      updateStatus("error");
    }
  }, [cleanupResources, transcribe, updateStatus]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (
      !recorder ||
      recorder.state !== "recording" ||
      statusRef.current !== "recording"
    ) {
      return;
    }

    try {
      recorder.stop();
    } catch {
      setError("Recording stop nahi ho saki. Dobara try karein.");
      cleanupResources();
      recorderRef.current = null;
      updateStatus("error");
    }
  }, [cleanupResources, updateStatus]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    sessionRef.current += 1;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;

      try {
        recorder.stop();
      } catch {
        // It may already have stopped.
      }
    }

    cleanupResources();
    setError(null);
    setTranscript("");
    updateStatus("idle");
  }, [cleanupResources, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      sessionRef.current += 1;

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;

        try {
          recorder.stop();
        } catch {
          // Ignore an already stopped recorder.
        }
      }

      stopStream(streamRef.current);
      streamRef.current = null;

      const context = audioContextRef.current;
      audioContextRef.current = null;

      if (context && context.state !== "closed") {
        void context.close().catch(() => {});
      }
    };
  }, []);

  return {
    status,
    transcript,
    error,
    audioLevels,
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    cancel,
  };
}
