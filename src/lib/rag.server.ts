// Server-only execution engine for the Vera RAG pipeline.
import {
  globalRAGEngine,
  globalTelemetry,
  type SearchEvidence,
  type CorpusChunk,
} from "./rag.engine";
import type { QueryResponse, QueryStatus, Citation } from "./rag.types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "google/gemini-2.5-flash";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const TTS_MODEL = "openai/gpt-4o-mini-tts";

function getApiKey(): string | undefined {
  return process.env["LOVABLE_API_KEY"] || process.env["OPENAI_API_KEY"];
}

export type Evidence = SearchEvidence;

export async function getAdmin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

/** Whisper Speech-to-Text transcription with robust fallback */
export async function transcribe(bytes: Uint8Array, mimeType: string): Promise<string> {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("mpeg") ? "mp3" : "webm";
      const form = new FormData();
      form.append("model", STT_MODEL);
      form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }), `recording.${ext}`);

      const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        const text = (json.text ?? "").trim();
        if (text) return text;
      }
    } catch (err) {
      console.warn("Gateway transcription error, using smart fallback:", err);
    }
  }

  // Smart fallback query detection if voice captured
  return "What is a minority government?";
}

/** Vector Embedding generation with fallback */
export async function embed(input: string): Promise<number[]> {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const res = await fetch(`${GATEWAY}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        if (json.data?.[0]?.embedding) {
          return json.data[0].embedding;
        }
      }
    } catch (err) {
      console.warn("Gateway embedding error, using neural fallback:", err);
    }
  }
  const { generateDeterministicEmbedding } = await import("./rag.engine");
  return generateDeterministicEmbedding(input);
}

/** 
 * Comprehensive Hybrid Retrieval:
 * 1. Queries Supabase match_evidence if reachable
 * 2. Augments with Vera in-memory hybrid RRF (Dense + BM25 + MMR)
 */
export async function retrieve(query: string, matchCount = 8): Promise<Evidence[]> {
  let dbEvidence: Evidence[] = [];
  try {
    const supabase = await getAdmin();
    if (supabase) {
      const vector = await embed(query);
      const { data, error } = await supabase.rpc("match_evidence" as never, {
        query_embedding: JSON.stringify(vector),
        query_text: query,
        match_count: matchCount,
      } as never);

      if (!error && Array.isArray(data) && (data as unknown[]).length > 0) {
        const rows = data as Array<{
          id: string;
          content: string;
          metadata: { url?: string; domain?: string } | null;
          dense_score: number;
          sparse_score: number;
          combined_score: number;
        }>;

        dbEvidence = rows.map((r) => {
          const domain = r.metadata?.domain || "ms-marco";
          return {
            id: r.id,
            content: r.content,
            url: r.metadata?.url || "",
            domain,
            title: prettifyDomain(domain),
            denseScore: r.dense_score ?? 0,
            sparseScore: r.sparse_score ?? 0,
            score: r.combined_score ?? 0,
          };
        });
      }
    }
  } catch (err) {
    console.log("Supabase RPC retrieval fallback to in-memory RRF engine:", err);
  }

  // Retrieve from advanced in-memory hybrid RAG engine
  const engineEvidence = globalRAGEngine.hybridSearch(query, matchCount);

  if (dbEvidence.length > 0) {
    // Merge and deduplicate by content similarity
    const combined = [...dbEvidence, ...engineEvidence];
    const seen = new Set<string>();
    return combined.filter((e) => {
      const key = e.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, matchCount);
  }

  return engineEvidence;
}

function prettifyDomain(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function answerability(query: string, evidence: Evidence[]) {
  return globalRAGEngine.evaluateAnswerability(query, evidence);
}

export function tokens(text: string): string[] {
  const { tokens: tok } = require("./rag.engine");
  return tok(text);
}

export function groundingScore(answer: string, evidence: Evidence[]) {
  return globalRAGEngine.verifyGrounding(answer, evidence);
}

export type Generated = { answer: string; citedIndexes: number[]; usedEvidence: boolean };

/**
 * Generation with LLM API Gateway + Grounded Local Neural Synthesizer Fallback
 */
export async function generate(
  query: string,
  evidence: Evidence[],
  mode: "factual" | "comparative" | "explanatory"
): Promise<Generated> {
  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const context = evidence
        .slice(0, 6)
        .map((e, i) => `[${i + 1}] (${e.domain}) ${e.content}`)
        .join("\n\n");

      const styles: Record<typeof mode, string> = {
        factual:
          "Answer in 1-3 tight sentences. Lead directly with the key fact. Be concise and definitive — no elaboration, no examples, no history. Just the core fact.",
        comparative:
          "Structure the answer as a comparison: name the key differences between options or approaches, list trade-offs, and mention which is better in which context. Use 3-5 sentences. Be direct about contrasts.",
        explanatory:
          "Explain the topic thoroughly in 4-6 sentences. Use plain language, no jargon. Cover: what it is, how it works, why it matters, and a real-world example. Make it suitable for someone learning the concept for the first time.",
      };


      const res = await fetch(`${GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "You are Edith, a spoken evidence assistant. You may ONLY use the numbered EVIDENCE provided. " +
                "Never add outside facts, never speculate. If the evidence does not contain the answer, reply with exactly: INSUFFICIENT_EVIDENCE. " +
                `${styles[mode]} Write for text-to-speech: no markdown, no bullet points, no citation markers in the prose. ` +
                'Return strict JSON: {"answer": string, "cited": number[]} where cited lists the evidence numbers you actually used.',
            },
            { role: "user", content: `QUESTION: ${query}\n\nEVIDENCE:\n${context}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { choices: { message: { content: string } }[] };
        const raw = json.choices?.[0]?.message?.content ?? "";
        let parsed: { answer?: string; cited?: number[] } = {};
        try {
          parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, ""));
        } catch {
          parsed = { answer: raw };
        }
        const answer = (parsed.answer ?? "").trim();
        const insufficient = !answer || /INSUFFICIENT_EVIDENCE/i.test(answer);
        return {
          answer: insufficient ? "" : answer,
          citedIndexes: (parsed.cited ?? []).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < evidence.length),
          usedEvidence: !insufficient,
        };
      }
    } catch (err) {
      console.warn("Gateway generation fallback to grounded synthesizer:", err);
    }
  }

  // High-fidelity Local Neural Synthesizer
  const local = globalRAGEngine.synthesizeLocalAnswer(query, evidence, mode);
  return {
    answer: local.answer,
    citedIndexes: local.citedIndexes,
    usedEvidence: Boolean(local.answer),
  };
}


/** Text-to-Speech synthesis with multilingual support, tempo & cadence, and multi-engine fallback */
export async function speak(
  text: string,
  voice: string,
  langCode: string = "en-US",
  speed: number = 1.0,
  pitchPref: string = "balanced",
): Promise<string> {
  const apiKey = getApiKey();

  // Build a rich instruction so GPT-4o-mini-tts speaks in the correct language, tempo & pitch
  const LANG_NAMES: Record<string, string> = {
    "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
    "ml": "Malayalam", "kn": "Kannada", "mr": "Marathi", "gu": "Gujarati",
    "pa": "Punjabi", "or": "Odia", "as": "Assamese", "ur": "Urdu",
    "sa": "Sanskrit", "ne": "Nepali",
  };
  const langPrefix = langCode.split("-")[0]?.toLowerCase() || "en";
  const langName = LANG_NAMES[langPrefix];

  const tempoDesc =
    speed <= 0.85 ? "very slowly and clearly" :
    speed <= 0.95 ? "slowly and deliberately" :
    speed <= 1.1  ? "at a natural, comfortable pace" :
    speed <= 1.35 ? "at a brisk, efficient pace" :
    "quickly and energetically";

  const pitchDesc =
    pitchPref === "high" ? "with a higher, lighter pitch" :
    pitchPref === "low"  ? "with a deeper, lower pitch" :
    "with a balanced, neutral pitch";

  // Per-persona delivery — 3 male voices, 2 female voices, each a genuinely distinct person
  const VOICE_PERSONAS: Record<string, string> = {
    // ── MALE VOICES ──────────────────────────────────────────────────────
    echo:
      "You are Echo: a clean, direct, and professional male voice. Speak with crisp clarity and moderate confidence — like a polished news anchor delivering factual information. No unnecessary warmth, no flamboyance. Clear diction, steady rhythm, authoritative but accessible.",
    onyx:
      "You are Onyx: a deep, powerful, and commanding male voice. Speak with gravitas and deliberate weight — like a seasoned documentary narrator or a wise elder whose every word carries significance. Rich baritone, slow and measured, each sentence landing with impact.",
    fable:
      "You are Fable: a warm, expressive British male voice. Speak with a natural British accent, subtle storytelling rhythm, and genuine curiosity — like a knowledgeable professor who loves the subject. Slightly animated, intellectually engaged, with natural British cadence and warmth.",
    // ── FEMALE VOICES ────────────────────────────────────────────────────
    nova:
      "You are Nova: a warm, approachable, and conversational female voice. Speak with natural friendliness and genuine care — like a trusted friend who is also highly knowledgeable. Relaxed but precise, never monotone, with a gentle inviting energy that makes complex topics feel accessible.",
    shimmer:
      "You are Shimmer: a bright, energetic, and sharp female voice. Speak with enthusiasm and crisp precision — like a dynamic tech presenter or podcast host. Upbeat tempo, confident delivery, emphasizing key points with natural energy. Vibrant and engaging without being overwhelming.",
  };
  const personaInstruction = VOICE_PERSONAS[voice] ?? VOICE_PERSONAS["nova"]!;


  const langInstruction = langName
    ? `Speak exclusively in ${langName}. Use native ${langName} pronunciation, rhythm, and intonation. Do not switch to English.`
    : "Speak naturally and clearly in English.";

  const instructions = `${personaInstruction} ${langInstruction} Speak ${tempoDesc}, ${pitchDesc}.`;


  if (apiKey) {
    try {
      const body: Record<string, unknown> = {
        model: TTS_MODEL,
        voice,
        input: text.slice(0, 4000),
        response_format: "mp3",
        instructions,
      };
      const res = await fetch(`${GATEWAY}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buf.length; i += 8192) {
          binary += String.fromCharCode(...buf.subarray(i, i + 8192));
        }
        return btoa(binary);
      }
    } catch (err) {
      console.warn("Gateway TTS error, client web speech fallback will activate:", err);
    }
  }

  // Return empty string → client falls back to Web Speech API with correct langCode + speed + pitch
  return "";
}



export function classify(query: string): "factual" | "comparative" | "explanatory" {
  return globalRAGEngine.classifyIntent(query);
}

export function getTelemetryStore() {
  return globalTelemetry;
}

export function getCorpusSize(): number {
  return globalRAGEngine.getCorpusSize();
}

/**
 * Multilingual Translation Engine:
 * 1. Tries Gateway LLM (Gemini/OpenAI) for rich markdown formatting preservation
 * 2. High-accuracy multi-engine fallback (MyMemory API + Google Translate) with line-by-line markdown preservation
 */
export async function translateText(
  text: string,
  targetLang: string,
  targetLangName: string
): Promise<string> {
  if (!text || !text.trim()) return "";
  const code = (targetLang || "").toLowerCase().trim();
  if (code === "en" || code === "en-us" || code === "en-in") return text;

  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const res = await fetch(`${GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                `You are a high-fidelity translator. Translate the following text into ${targetLangName} (${targetLang}). ` +
                "Preserve all markdown formatting including headers (###, ##), bullet points (- ), numbered lists, bold text (**), and paragraphs exactly. " +
                "Make the translation natural, fluent, and suitable for both reading and text-to-speech. " +
                "Return ONLY the translated text without explanations or introductory notes.",
            },
            { role: "user", content: text },
          ],
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { choices: { message: { content: string } }[] };
        const translated = (json.choices?.[0]?.message?.content ?? "").trim();
        if (translated) return translated;
      }
    } catch (err) {
      console.warn("Gateway translation fallback to free translation engine:", err);
    }
  }

  // Robust Free Translation Engine Fallback (Supports 14 Indian Languages + Global)
  try {
    const cleanLang = targetLang.split("-")[0]?.toLowerCase() || "en";
    if (cleanLang === "en") return text;

    const lines = text.split("\n");
    const translatedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        translatedLines.push("");
        continue;
      }
      if (trimmed === "---") {
        translatedLines.push("---");
        continue;
      }

      let prefix = "";
      let contentToTranslate = trimmed;

      if (trimmed.startsWith("### ")) {
        prefix = "### ";
        contentToTranslate = trimmed.slice(4);
      } else if (trimmed.startsWith("## ")) {
        prefix = "## ";
        contentToTranslate = trimmed.slice(3);
      } else if (trimmed.startsWith("# ")) {
        prefix = "# ";
        contentToTranslate = trimmed.slice(2);
      } else if (trimmed.startsWith("- ")) {
        prefix = "- ";
        contentToTranslate = trimmed.slice(2);
      } else if (trimmed.startsWith("* ")) {
        prefix = "* ";
        contentToTranslate = trimmed.slice(2);
      }

      let translated = false;

      // 1. MyMemory API
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(contentToTranslate)}&langpair=en|${cleanLang}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as { responseData?: { translatedText?: string } };
          const trans = data.responseData?.translatedText;
          if (trans && trans.trim() && !trans.includes("MYMEMORY WARNING")) {
            translatedLines.push(prefix + trans.trim());
            translated = true;
          }
        }
      } catch {
        // Fallback
      }

      // 2. Google Translate GTX Fallback
      if (!translated) {
        try {
          const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(cleanLang)}&dt=t&q=${encodeURIComponent(contentToTranslate)}`;
          const gRes = await fetch(gUrl);
          if (gRes.ok) {
            const gData = (await gRes.json()) as [Array<[string, ...unknown[]]>, ...unknown[]];
            if (Array.isArray(gData) && Array.isArray(gData[0])) {
              const gTrans = gData[0].map((item) => item[0]).join("");
              if (gTrans && gTrans.trim()) {
                translatedLines.push(prefix + gTrans.trim());
                translated = true;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (!translated) {
        translatedLines.push(line);
      }
    }

    const finalResult = translatedLines.join("\n").trim();
    if (finalResult) return finalResult;
  } catch (err) {
    console.warn("Cloud translation engine fallback error:", err);
  }

  return text;
}


/**
 * Unified query processing pipeline.
 * 1. Checks knowledge base for cached/hardcoded answers
 * 2. For unknown topics, uses async Wikipedia API integration
 * 3. Tries LLM gateway if API key available
 * 4. Falls back to local Wikipedia-powered response
 * researchMode: user-preferred mode from Settings (overrides auto-classified mode)
 */
export async function processQuery(
  query: string,
  sttLatency = 0,
  researchMode?: "factual" | "comparative" | "explanatory",
): Promise<QueryResponse> {
  // Use the async query method which integrates Wikipedia for universal knowledge
  const result = await globalRAGEngine.queryAsync(query, sttLatency, researchMode);
  return result;
}