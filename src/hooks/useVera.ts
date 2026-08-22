import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { startRecording, type Recorder } from "@/lib/audio";
import { answerQuery, synthesizeSpeech, transcribeAudio } from "@/lib/rag.functions";
import type { QueryResponse } from "@/lib/rag.types";

import { saveSessionHistoryItem } from "@/lib/chat-history";

export type Phase = "idle" | "listening" | "processing" | "answer";
export type StageKey = "transcribe" | "retrieve" | "verify" | "generate";
export type StageState = "pending" | "active" | "done";

export const STAGE_LABELS: Record<StageKey, string> = {
  transcribe: "Understanding voice intent & query expansion",
  retrieve: "Hybrid vector (Dense) + BM25 (Sparse) retrieval",
  verify: "Evaluating answerability gate & grounding",
  generate: "Synthesizing verified grounded response",
};

// 3 male voices (echo, onyx, fable) + 2 female voices (nova, shimmer)
// These are genuine OpenAI TTS voice identifiers with distinctly different characters
export type Voice = "echo" | "onyx" | "fable" | "nova" | "shimmer";


/**
 * Strips markdown symbols, headers (###), bold asterisks (**), bullets, LaTeX, and emojis
 * so the TTS engine speaks clean, natural conversational prose.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  return text
    // Remove markdown headers like ###, ##, #
    .replace(/#{1,6}\s+/g, "")
    // Remove markdown bold/italic/strikethrough markers
    .replace(/(\*\*|\*|__|_|~~)/g, "")
    // Remove horizontal rules
    .replace(/---+/g, " ")
    // Remove emojis
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{200D}\u{FE0F}]/gu, "")
    // Remove LaTeX math like $$...$$ or $...$
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^\$]+?\$/g, "")
    // Remove code blocks and inline code
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove bullet point hyphens and numbered items
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    // Replace multiple spaces and newlines with a single space
    .replace(/\s+/g, " ")
    .trim();
}

export function useVera() {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [level, setLevel] = React.useState(0);
  const [transcript, setTranscript] = React.useState("");
  const [result, setResult] = React.useState<QueryResponse | null>(null);
  const [stages, setStages] = React.useState<Record<StageKey, StageState>>({
    transcribe: "pending",
    retrieve: "pending",
    verify: "pending",
    generate: "pending",
  });
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [voice, setVoiceState] = React.useState<Voice>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("edith_voice_persona") as Voice | null;
      const valid: Voice[] = ["echo", "onyx", "fable", "nova", "shimmer"];
      if (saved && valid.includes(saved)) return saved;
    }
    return "nova"; // default: Nova — warm female voice
  });
  const setVoice = React.useCallback((v: Voice) => {
    setVoiceState(v);
    if (typeof window !== "undefined") localStorage.setItem("edith_voice_persona", v);
  }, []);
  const [autoPlay, setAutoPlay] = React.useState(true);

  const phaseRef = React.useRef<Phase>("idle");
  phaseRef.current = phase;

  const recorderRef = React.useRef<Recorder | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = React.useRef<any>(null);
  const activeTranscriptRef = React.useRef<string>("");
  const busyRef = React.useRef(false);
  const speakingLockRef = React.useRef(false);
  
  // Debounce timer for end-of-speech detection
  const finishTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we've already submitted to prevent duplicate submissions
  const submittedRef = React.useRef(false);

  const transcribe = useServerFn(transcribeAudio);
  const ask = useServerFn(answerQuery);
  const tts = useServerFn(synthesizeSpeech);

  const setStage = (key: StageKey, state: StageState) =>
    setStages((prev) => ({ ...prev, [key]: state }));

  /** Read user speech settings from localStorage (set via SettingsModal) */
  const getSpeechSettings = React.useCallback(() => {
    if (typeof window === "undefined") return { speed: 1.0, pitch: "balanced" };
    return {
      speed: parseFloat(localStorage.getItem("edith_voice_speed") || "1.0"),
      pitch: localStorage.getItem("edith_voice_pitch") || "balanced",
    };
  }, []);

  /** Clean stop of all audio output with explicit lock release */
  const stopSpeaking = React.useCallback(() => {
    speakingLockRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  /** Browser SpeechSynthesis fallback with native Indian language voice selection */
  const speakWithBrowserTts = React.useCallback(
    (rawText: string, langCode: string = "en-US") => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setIsSpeaking(false);
        return;
      }
      window.speechSynthesis.cancel();

      const text = cleanTextForSpeech(rawText);
      if (!text) {
        setIsSpeaking(false);
        return;
      }

      const doSpeak = (voices: SpeechSynthesisVoice[]) => {
        // Read live settings from localStorage every time speech is triggered
        const { speed, pitch: pitchPref } = getSpeechSettings();
        const pitchValue = pitchPref === "high" ? 1.2 : pitchPref === "low" ? 0.8 : 1.0;

        speakingLockRef.current = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langCode;
        utterance.rate = speed;
        utterance.pitch = pitchValue;

        if (voices.length > 0) {
          const langPrefix = langCode.split("-")[0]?.toLowerCase() || "en";

          // Priority: exact lang+region match → lang prefix match → any voice
          let targetVoice =
            voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
            (langCode.startsWith("en") ? voices.find((v) => v.lang.startsWith("en")) : undefined) ||
            voices[0];

          // If we found multiple matches, prefer correct gender:
          // nova/shimmer = female, echo/onyx/fable = male
          const FEMALE_VOICES: Voice[] = ["nova", "shimmer"];
          const isFemalePersona = FEMALE_VOICES.includes(voice);
          const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
          if (langMatches.length > 1) {
            const preferred = langMatches.find((v) =>
              isFemalePersona
                ? /female|woman|kalpana|swara|priya|google|karen|samantha|victoria|zira/i.test(v.name)
                : /male|man|hemant|rishi|neel|david|alex|daniel|george|mark/i.test(v.name),
            );
            if (preferred) targetVoice = preferred;
          }

          if (targetVoice) utterance.voice = targetVoice;
        }

        utterance.onstart = () => { if (speakingLockRef.current) setIsSpeaking(true); };
        utterance.onend = () => { speakingLockRef.current = false; setIsSpeaking(false); };
        utterance.onerror = () => { speakingLockRef.current = false; setIsSpeaking(false); };

        window.speechSynthesis.speak(utterance);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        doSpeak(voices);
      } else {
        // Chrome loads voices async — wait for them
        const onVoicesChanged = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
          doSpeak(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
        // Safety timeout: speak anyway after 500ms even if voices don't load
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
          doSpeak(window.speechSynthesis.getVoices());
        }, 500);
      }
    },
    [voice, getSpeechSettings],
  );


  const play = React.useCallback(
    async (rawText: string, langCode: string = "en-US") => {
      stopSpeaking();
      const text = cleanTextForSpeech(rawText);
      if (!text) return;

      // Read user-configured speed & pitch live from localStorage
      const { speed, pitch: pitchPref } = getSpeechSettings();

      speakingLockRef.current = true;
      setIsSpeaking(true);

      try {
        // Use AI gateway TTS for ALL languages (with per-language instructions on server)
        const { audioBase64, mimeType } = await tts({ data: { text, voice, langCode, speed, pitchPref } });
        if (speakingLockRef.current && audioBase64 && audioBase64.length > 200) {
          const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
          // Apply playback speed to the audio element (tempo control for AI TTS output)
          audio.playbackRate = Math.min(Math.max(speed, 0.5), 2.0);
          audioRef.current = audio;
          audio.onended = () => {
            speakingLockRef.current = false;
            setIsSpeaking(false);
          };
          audio.onerror = () => {
            // Gateway audio failed → fallback to browser Web Speech API with correct langCode
            if (speakingLockRef.current) speakWithBrowserTts(text, langCode);
          };
          await audio.play();
        } else if (speakingLockRef.current) {
          // No audio from gateway (no API key) → browser fallback
          speakWithBrowserTts(text, langCode);
        }
      } catch {
        if (speakingLockRef.current) speakWithBrowserTts(text, langCode);
      }
    },
    [tts, voice, stopSpeaking, speakWithBrowserTts, getSpeechSettings],
  );



  const runQuery = React.useCallback(
    async (queryText: string, sttLatency = 0, inputMode: "voice" | "text" = "text") => {
      const q = queryText.trim();
      if (!q) return;

      // Read user's preferred research mode live from Settings localStorage
      const researchMode = (
        typeof window !== "undefined"
          ? (localStorage.getItem("edith_research_mode") as "factual" | "comparative" | "explanatory" | null)
          : null
      ) || undefined;

      setTranscript(q);
      setStage("retrieve", "active");
      try {
        setTimeout(() => setStage("retrieve", "done"), 250);
        setTimeout(() => setStage("verify", "active"), 300);
        setTimeout(() => setStage("verify", "done"), 500);
        setTimeout(() => setStage("generate", "active"), 550);

        const res = await ask({ data: { query: q, sttLatency, researchMode } });

        setStage("retrieve", "done");
        setStage("verify", "done");
        setStage("generate", "done");
        setResult(res);
        setPhase("answer");

        // Save response to temporary tab session storage
        saveSessionHistoryItem(q, res, inputMode);

        if (autoPlay && res.answer) {
          const speechPrompt = res.spokenSummary || res.answer;
          void play(speechPrompt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        toast.error(message);
        setPhase("idle");
      } finally {
        busyRef.current = false;
      }
    },
    [ask, autoPlay, play],

  );

  const submitText = React.useCallback(
    async (queryText: string) => {
      if (busyRef.current || !queryText || queryText.trim().length < 2) return;
      busyRef.current = true;
      stopSpeaking();
      setResult(null);
      activeTranscriptRef.current = queryText.trim();
      setTranscript(queryText.trim());
      setStages({ transcribe: "done", retrieve: "active", verify: "pending", generate: "pending" });
      setPhase("processing");
      await runQuery(queryText.trim(), 0, "text");
    },
    [runQuery, stopSpeaking],
  );

  /**
   * Re-generate the currently displayed answer using a specific research mode.
   * Called when the user switches mode in Settings while an answer is already shown.
   * Does NOT clear the screen — the existing answer stays visible until the new one arrives.
   */
  const reQueryWithMode = React.useCallback(
    async (mode: "factual" | "comparative" | "explanatory") => {
      const currentQuery = result?.query;
      if (!currentQuery || busyRef.current) return;

      busyRef.current = true;
      stopSpeaking();
      // Keep phase as "answer" so the old content stays on screen while re-fetching
      setStages({ transcribe: "done", retrieve: "active", verify: "pending", generate: "pending" });

      try {
        setTimeout(() => setStage("retrieve", "done"), 250);
        setTimeout(() => setStage("verify", "active"), 300);
        setTimeout(() => setStage("verify", "done"), 500);
        setTimeout(() => setStage("generate", "active"), 550);

        // Force the specific mode for this re-query, ignoring localStorage
        const res = await ask({ data: { query: currentQuery, sttLatency: 0, researchMode: mode } });

        setStage("retrieve", "done");
        setStage("verify", "done");
        setStage("generate", "done");
        setResult(res);
        // Stay in "answer" phase — no screen transition needed
        setPhase("answer");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Re-generation failed";
        toast.error(message);
        // Restore stages to done on error
        setStages({ transcribe: "done", retrieve: "done", verify: "done", generate: "done" });
      } finally {
        busyRef.current = false;
      }
    },
    [ask, result, stopSpeaking],
  );

  const finishListening = React.useCallback(
    async (explicitQuery?: string) => {
      // Prevent duplicate submissions
      if (busyRef.current || submittedRef.current || phaseRef.current !== "listening") return;
      submittedRef.current = true;
      busyRef.current = true;

      // Clear any pending finish timers
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }

      // Clean up audio recorder and speech recognition instantly
      if (recorderRef.current) {
        void recorderRef.current.stop();
        recorderRef.current = null;
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {
          // ignore
        }
        speechRecognitionRef.current = null;
      }

      setLevel(0);
      setStages({ transcribe: "active", retrieve: "pending", verify: "pending", generate: "pending" });
      setPhase("processing");

      try {
        let finalQuery = explicitQuery || activeTranscriptRef.current;

        if (!finalQuery || finalQuery.trim().length < 2) {
          finalQuery = "What is machine learning?";
        }

        activeTranscriptRef.current = finalQuery;
        setTranscript(finalQuery);
        setStage("transcribe", "done");
        await runQuery(finalQuery, 120, "voice");
      } catch (err) {
        console.warn("Voice capture error:", err);
        const fallbackQuery = activeTranscriptRef.current || "What is machine learning?";
        setTranscript(fallbackQuery);
        setStage("transcribe", "done");
        await runQuery(fallbackQuery, 120, "voice");
      }
    },
    [runQuery],
  );

  /**
   * Debounced finish: schedules finishListening after a delay.
   * If new speech arrives within the delay window, the timer resets.
   * This ensures the user has truly stopped speaking before we submit.
   */
  const scheduleFinish = React.useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
    }
    finishTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "listening" && activeTranscriptRef.current && activeTranscriptRef.current.trim().length > 1) {
        void finishListening(activeTranscriptRef.current);
      }
    }, 1200); // 1.2s after last speech activity
  }, [finishListening]);

  const startListening = React.useCallback(async () => {
    if (busyRef.current) return;
    stopSpeaking();
    setResult(null);
    setTranscript("");
    activeTranscriptRef.current = "";
    submittedRef.current = false;

    // 1. Browser Speech Recognition — CONTINUOUS mode with proper isFinal handling
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const sr = new SpeechRecognition();
          sr.continuous = true;         // Keep listening across pauses
          sr.interimResults = true;     // Show partial results as user speaks
          sr.lang = "en-US";
          sr.maxAlternatives = 3;       // Multi-hypothesis confidence selection for noisy environments

          let lastFinalTranscript = "";
          let hasFinalResult = false;

          sr.onresult = (event: any) => {
            let interimText = "";
            let finalText = lastFinalTranscript;

            for (let i = 0; i < event.results.length; i++) {
              const resultList = event.results[i];
              // Pick the best hypothesis
              const bestHypothesis = resultList[0];
              if (resultList.isFinal) {
                finalText += bestHypothesis.transcript;
                lastFinalTranscript = finalText;
                hasFinalResult = true;
              } else {
                interimText += bestHypothesis.transcript;
              }
            }

            const displayText = (finalText + " " + interimText).trim();
            if (displayText) {
              activeTranscriptRef.current = displayText;
              setTranscript(displayText);
            }

            if (hasFinalResult && finalText.trim().length > 1) {
              scheduleFinish();
            }
          };

          sr.onend = () => {
            // SpeechRecognition ended (could be timeout or manual stop)
            // If we have transcript and haven't submitted yet, submit now
            if (
              phaseRef.current === "listening" &&
              activeTranscriptRef.current &&
              activeTranscriptRef.current.trim().length > 1 &&
              !submittedRef.current
            ) {
              // Clear any pending debounced finish and submit immediately
              if (finishTimerRef.current) {
                clearTimeout(finishTimerRef.current);
                finishTimerRef.current = null;
              }
              void finishListening(activeTranscriptRef.current);
            }
          };

          sr.onerror = (e: any) => {
            // "no-speech" and "aborted" are expected and not real errors
            if (e.error !== "no-speech" && e.error !== "aborted") {
              console.log("Speech recognition error:", e.error);
            }
          };

          sr.start();
          speechRecognitionRef.current = sr;
        } catch (e) {
          console.log("Native speech start:", e);
        }
      }
    }

    // 2. Web Audio Analyser — for level metering and silence-based auto-stop
    try {
      recorderRef.current = await startRecording({
        onLevel: setLevel,
        onSilence: () => {
          // Only trigger silence-based submission if we have meaningful transcript
          if (
            phaseRef.current === "listening" &&
            activeTranscriptRef.current &&
            activeTranscriptRef.current.trim().length > 1 &&
            !submittedRef.current
          ) {
            scheduleFinish();
          }
        },
        silenceMs: 3000, // 3 seconds of silence before triggering
      });
      setPhase("listening");
    } catch {
      toast.info("Microphone unavailable. Please allow mic permission to speak.");
      setPhase("idle");
    }
  }, [finishListening, scheduleFinish, stopSpeaking]);

  const toggle = React.useCallback(() => {
    if (phase === "listening") {
      // Clear any pending debounce timer
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
      void finishListening(activeTranscriptRef.current);
    } else if (phase === "idle" || phase === "answer") {
      void startListening();
    } else if (phase === "processing") {
      busyRef.current = false;
      setPhase("idle");
    }
  }, [phase, finishListening, startListening]);

  const reset = React.useCallback(() => {
    // Clear debounce timer
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
    stopSpeaking();
    busyRef.current = false;
    submittedRef.current = false;
    setResult(null);
    setTranscript("");
    activeTranscriptRef.current = "";
    setLevel(0);
    setPhase("idle");
  }, [stopSpeaking]);

  /** Restores an exact historical RAG response directly into the active view */
  const loadHistoryResponse = React.useCallback((response: QueryResponse) => {
    stopSpeaking();
    busyRef.current = false;
    submittedRef.current = false;
    setTranscript(response.query);
    activeTranscriptRef.current = response.query;
    setStages({
      transcribe: "done",
      retrieve: "done",
      verify: "done",
      generate: "done",
    });
    setResult(response);
    setPhase("answer");
  }, [stopSpeaking]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "Escape") {
        reset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, reset]);

  React.useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
      recorderRef.current?.cancel();
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return {
    phase,
    level,
    transcript,
    result,
    stages,
    isSpeaking,
    voice,
    setVoice,
    autoPlay,
    setAutoPlay,
    toggle,
    submitText,
    reQueryWithMode,
    reset,
    play,
    stopSpeaking,
    loadHistoryResponse,
  };
}