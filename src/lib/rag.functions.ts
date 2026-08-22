import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Analytics, QueryResponse } from "@/lib/rag.types";

/** Voice -> text. Speech recognition through gateway or audio bridge. */
export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        audioBase64: z.string().min(16, "Recording data required"),
        mimeType: z.string().default("audio/wav"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ transcript: string; latency: number }> => {
    const { transcribe } = await import("@/lib/rag.server");
    const started = Date.now();
    let bytes: Uint8Array;
    try {
      const binary = atob(data.audioBase64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      bytes = new Uint8Array(2048);
    }
    const transcript = await transcribe(bytes, data.mimeType);
    return { transcript: transcript || "", latency: Date.now() - started };
  });

/**
 * Grounded enterprise RAG query handler.
 * Uses the full async pipeline: classify → retrieve → generate → ground.
 * Falls back to local knowledge base + Wikipedia API for universal coverage.
 */
export const answerQuery = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        query: z.string().min(1).max(500),
        sttLatency: z.number().min(0).max(60000).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<QueryResponse> => {
    const { processQuery } = await import("@/lib/rag.server");
    const res = await processQuery(data.query, data.sttLatency);
    return res;
  });

/** Text -> speech for the spoken answer. */
export const synthesizeSpeech = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        voice: z.enum(["alloy", "shimmer", "verse", "sage", "ballad"]).default("shimmer"),
        langCode: z.string().default("en-US"),
        speed: z.number().min(0.5).max(2.0).default(1.0),
        pitchPref: z.string().default("balanced"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ audioBase64: string; mimeType: string }> => {
    const { speak } = await import("@/lib/rag.server");
    const audioBase64 = await speak(data.text, data.voice, data.langCode, data.speed, data.pitchPref);
    return { audioBase64, mimeType: "audio/mpeg" };
  });

/** Multilingual translation for verified responses. */
export const translateContent = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        text: z.string().min(1),
        targetLang: z.string().default("en"),
        targetLangName: z.string().default("English"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ translatedText: string }> => {
    const { translateText } = await import("@/lib/rag.server");
    const translatedText = await translateText(data.text, data.targetLang, data.targetLangName);
    return { translatedText };
  });

/** Real analytics computed from telemetry store and logged traffic. */
export const getAnalytics = createServerFn({ method: "GET" }).handler(async (): Promise<Analytics> => {
  const { globalTelemetry, globalRAGEngine } = await import("@/lib/rag.engine");
  const corpusSize = globalRAGEngine.getCorpusSize();
  return globalTelemetry.getAnalytics(corpusSize);
});

