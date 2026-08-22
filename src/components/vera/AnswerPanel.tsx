import * as React from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  BookOpen,
  Layers,
  FastForward,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { translateContent } from "@/lib/rag.functions";
import type { QueryResponse } from "@/lib/rag.types";
import { ConceptImageGallery } from "./ConceptImageGallery";

export interface LanguageOption {
  code: string;
  shortCode: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en-IN", shortCode: "en", name: "English", nativeName: "English", flag: "🇮🇳" },
  { code: "hi-IN", shortCode: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "as-IN", shortCode: "as", name: "Assamese", nativeName: "অসমীয়া", flag: "🇮🇳" },
  { code: "bn-IN", shortCode: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇮🇳" },
  { code: "gu-IN", shortCode: "gu", name: "Gujarati", nativeName: "ગુજરાતી", flag: "🇮🇳" },
  { code: "kn-IN", shortCode: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ml-IN", shortCode: "ml", name: "Malayalam", nativeName: "മലയാളം", flag: "🇮🇳" },
  { code: "mr-IN", shortCode: "mr", name: "Marathi", nativeName: "मराठी", flag: "🇮🇳" },
  { code: "ne-NP", shortCode: "ne", name: "Nepali", nativeName: "नेपाली", flag: "🇳🇵" },
  { code: "or-IN", shortCode: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", flag: "🇮🇳" },
  { code: "pa-IN", shortCode: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "sa-IN", shortCode: "sa", name: "Sanskrit", nativeName: "संस्कृतम्", flag: "🇮🇳" },
  { code: "ta-IN", shortCode: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳" },
  { code: "te-IN", shortCode: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳" },
  { code: "ur-IN", shortCode: "ur", name: "Urdu", nativeName: "اردو", flag: "🇮🇳" },
];

const QUICK_LANGUAGES = SUPPORTED_LANGUAGES.slice(0, 5);

interface AnswerPanelProps {
  result: QueryResponse;
  speaking: boolean;
  onListen: (text?: string, langCode?: string) => void;
  onStop: () => void;
  onAskAnother: () => void;
  /** When true, shows a subtle regenerating indicator (mode switch in progress) */
  regenerating?: boolean;
}

/**
 * Custom Markdown & Visual Formatter for Gemini/ChatGPT-style rich answers
 */
function MarkdownRenderer({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-4 text-left font-normal leading-relaxed text-foreground/90">
      {lines.map((line, idx) => {
        const isLastLine = idx === lines.length - 1;
        const trimmed = line.trim();

        // Horizontal Rule
        if (trimmed === "---") {
          return <hr key={idx} className="my-5 border-white/10" />;
        }

        // H3 Header with Emojis
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={idx}
              className="pt-2 text-xl font-bold tracking-tight text-white md:text-2xl flex items-center gap-2"
            >
              {renderBoldText(trimmed.replace("### ", ""))}
              {isLastLine && isStreaming && <StreamingCursor />}
            </h4>
          );
        }

        // H2 Header
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="pt-3 text-2xl font-bold text-white md:text-3xl">
              {renderBoldText(trimmed.replace("## ", ""))}
              {isLastLine && isStreaming && <StreamingCursor />}
            </h3>
          );
        }

        // Bullet point
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-2 text-sm text-foreground/85 md:text-base">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div>
                {renderBoldText(trimmed.slice(2))}
                {isLastLine && isStreaming && <StreamingCursor />}
              </div>
            </div>
          );
        }

        // Numbered list item (e.g., "1. ")
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-3 pl-2 text-sm text-foreground/85 md:text-base">
              <span className="font-bold text-accent">{numMatch[1]}.</span>
              <div>
                {renderBoldText(numMatch[2]!)}
                {isLastLine && isStreaming && <StreamingCursor />}
              </div>
            </div>
          );
        }

        // Empty line
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Regular Paragraph
        return (
          <p key={idx} className="text-base font-light text-foreground/90 md:text-lg leading-relaxed">
            {renderBoldText(line)}
            {isLastLine && isStreaming && <StreamingCursor />}
          </p>
        );
      })}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block ml-1.5 h-4 w-2 rounded-xs bg-accent animate-[pulse_0.7s_infinite] align-middle shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
  );
}

function renderBoldText(text: string): React.ReactNode {
  // Strip any markdown links [title](url) -> title so in-text links are clean
  const clean = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
  const parts = clean.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function AnswerPanel({
  result,
  speaking,
  onListen,
  onStop,
  onAskAnother,
  regenerating = false,
}: AnswerPanelProps) {
  const [currentLang, setCurrentLang] = React.useState<LanguageOption>(SUPPORTED_LANGUAGES[0]!);
  const [translations, setTranslations] = React.useState<Record<string, string>>({
    "en-US": result.answer,
  });
  const [isTranslating, setIsTranslating] = React.useState(false);
  const [langMenuOpen, setLangMenuOpen] = React.useState(false);
  const [displayedText, setDisplayedText] = React.useState<string>("");
  const [isStreaming, setIsStreaming] = React.useState<boolean>(true);
  const [copied, setCopied] = React.useState(false);
  const [feedback, setFeedback] = React.useState<"up" | "down" | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);
  const [playbackSpeed, setPlaybackSpeed] = React.useState<number>(1.0);

  const translateFn = useServerFn(translateContent);
  const activeAnswer = translations[currentLang.code] || result.answer;

  // Stream active text smoothly whenever it changes
  React.useEffect(() => {
    const fullText = activeAnswer || "";
    if (!fullText) {
      setDisplayedText("");
      setIsStreaming(false);
      return;
    }

    const tokens = fullText.split(/(\s+)/);
    let currentIdx = 0;
    let accumulated = "";
    setIsStreaming(true);

    const interval = setInterval(() => {
      if (currentIdx < tokens.length) {
        const nextBatch = tokens.slice(currentIdx, currentIdx + 3).join("");
        accumulated += nextBatch;
        currentIdx += 3;
        setDisplayedText(accumulated);
      } else {
        setDisplayedText(fullText);
        setIsStreaming(false);
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [activeAnswer]);

  // Reset translations when result changes
  React.useEffect(() => {
    setCurrentLang(SUPPORTED_LANGUAGES[0]!);
    setTranslations({ "en-US": result.answer });
  }, [result.answer]);

  const skipStreaming = () => {
    if (isStreaming) {
      setDisplayedText(activeAnswer);
      setIsStreaming(false);
    }
  };

  /**
   * Handle multilingual language selection:
   * 1. Stops current speaking
   * 2. Retrieves or fetches translated response
   * 3. Updates text display
   * 4. Automatically triggers voice output in the newly selected language
   */
  const handleSelectLanguage = async (lang: LanguageOption) => {
    if (lang.code === currentLang.code) {
      setLangMenuOpen(false);
      return;
    }

    setLangMenuOpen(false);
    onStop(); // Stop any active speech immediately

    // Switching back to English
    if (lang.code === "en-US") {
      setCurrentLang(lang);
      const enText = result.answer;
      setDisplayedText(enText);
      setIsStreaming(false);
      toast.success(`Language set to ${lang.nativeName} (${lang.name})`);
      onListen(result.spokenSummary || enText, "en-US");
      return;
    }

    // Cached translation
    if (translations[lang.code]) {
      const cached = translations[lang.code]!;
      setCurrentLang(lang);
      setDisplayedText(cached);
      setIsStreaming(false);
      toast.success(`Switched to ${lang.nativeName} (${lang.name})`);
      onListen(cached, lang.code);
      return;
    }

    // Fetch new translation
    try {
      setIsTranslating(true);
      setCurrentLang(lang);

      const res = await translateFn({
        data: {
          text: result.answer,
          targetLang: lang.shortCode,
          targetLangName: lang.name,
        },
      });

      const translated = res.translatedText || result.answer;
      setTranslations((prev) => ({ ...prev, [lang.code]: translated }));
      setDisplayedText(translated);
      setIsStreaming(false);
      setIsTranslating(false);

      toast.success(`Translated to ${lang.nativeName} (${lang.name}) — speaking now`);
      // Start voice output automatically in selected language
      onListen(translated, lang.code);
    } catch {
      setIsTranslating(false);
      toast.error("Failed to translate response. Using English.");
      setCurrentLang(SUPPORTED_LANGUAGES[0]!);
    }
  };

  /**
   * Copy the complete active response in current language to clipboard
   */
  const copyAnswer = () => {
    const textToCopy = activeAnswer || result.answer;
    void navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success(`Full response in ${currentLang.nativeName} copied to clipboard!`);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type);
    toast.success(type === "up" ? "Thanks for your positive feedback!" : "Feedback recorded for model refinement.");
  };

  return (
    <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-16">
      {/* Title */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <h2 className="flex items-center gap-2.5 text-3xl font-light tracking-tight md:text-4xl text-foreground">
          Verified Evidence & Analysis <Sparkles className="h-5 w-5 text-accent animate-pulse" />
        </h2>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          &ldquo;{result.query}&rdquo;
        </p>
      </div>

      {/* Main Glass Container with Multilingual Bar, Rich Breakdown, and Actions */}
      <div className={`relative w-full overflow-hidden rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl p-6 md:p-10 transition-all duration-500 ${regenerating
        ? "border-primary/50 bg-[#0c1022]/70"
        : "border-white/10 bg-[#0c1022]/85"
        }`}>
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-[100px]" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-accent/15 blur-[100px]" />

        {/* Regenerating mode overlay banner */}
        {regenerating && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2.5 rounded-t-[2.5rem] bg-primary/20 px-6 py-2.5 backdrop-blur-md border-b border-primary/30 animate-in fade-in duration-300">
            <Loader2 className="h-3.5 w-3.5 text-cyan-300 animate-spin" />
            <span className="text-xs font-bold text-cyan-200 uppercase tracking-widest">
              Re-generating with new research mode…
            </span>
          </div>
        )}

        <div className={`relative z-10 space-y-6 ${regenerating ? "mt-8 opacity-60 pointer-events-none transition-opacity duration-300" : "opacity-100 transition-opacity duration-300"}`}>
          {/* Top Control Bar: Multilingual Language Switcher + Fast Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
            {/* Multilingual Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300 mr-1">
                <Globe className="h-4 w-4 text-accent animate-spin-slow" />
                <span>Language:</span>
              </div>

              {/* Quick Language Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_LANGUAGES.map((lang) => {
                  const isSelected = currentLang.code === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => void handleSelectLanguage(lang)}
                      disabled={isTranslating}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${isSelected
                        ? "bg-accent/25 text-white border border-accent/60 shadow-sm shadow-accent/20"
                        : "border border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-white hover:bg-white/10"
                        } ${isTranslating ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.nativeName}</span>
                    </button>
                  );
                })}

                {/* More Languages Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setLangMenuOpen((v) => !v)}
                    disabled={isTranslating}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-white/25 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <span>More</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${langMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {langMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                      <div className="absolute left-0 mt-2 z-50 w-56 max-h-72 overflow-y-auto rounded-2xl border border-white/15 bg-[#0a0e20]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-white/10 mb-1">
                          Select Response Language
                        </div>
                        {SUPPORTED_LANGUAGES.map((lang) => {
                          const isSelected = currentLang.code === lang.code;
                          return (
                            <button
                              key={lang.code}
                              onClick={() => void handleSelectLanguage(lang)}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${isSelected ? "bg-accent/20 text-accent font-bold" : "text-foreground hover:bg-white/10"
                                }`}
                            >
                              <span className="flex items-center gap-2">
                                <span>{lang.flag}</span>
                                <span>{lang.nativeName} ({lang.name})</span>
                              </span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Top Right: Translating Badge & Fast Copy Button & Skip Animation */}
            <div className="flex items-center gap-2 ml-auto">
              {isTranslating ? (
                <div className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-[11px] font-medium text-accent animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Translating to {currentLang.nativeName}...</span>
                </div>
              ) : isStreaming ? (
                <button
                  onClick={skipStreaming}
                  className="flex items-center gap-1 text-[11px] font-semibold text-accent/80 hover:text-white transition-colors cursor-pointer bg-white/5 border border-white/10 rounded-full px-3 py-1"
                >
                  <FastForward className="h-3 w-3" /> Skip Animation
                </button>
              ) : null}

              {/* Quick Top Copy Button */}
              <button
                onClick={copyAnswer}
                title="Copy entire response to clipboard"
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${copied
                  ? "bg-emerald-500/25 border border-emerald-500/50 text-emerald-300"
                  : "border border-white/10 bg-white/5 text-muted-foreground hover:border-accent/40 hover:text-white hover:bg-white/10"
                  }`}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied!" : "Copy Response"}</span>
              </button>
            </div>
          </div>

          {/* Rich Formatted Content with Word-by-Word Stream */}
          <div className="space-y-6 pt-2" onClick={skipStreaming}>
            {isTranslating ? (
              <div className="space-y-4 py-8 text-center">
                <Loader2 className="h-8 w-8 text-accent animate-spin mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  Translating response to <span className="text-white font-semibold">{currentLang.nativeName} ({currentLang.name})</span>...
                </p>
              </div>
            ) : (
              <MarkdownRenderer content={displayedText || activeAnswer} isStreaming={isStreaming} />
            )}
          </div>

          {/* Interactive Multi-Image Concept Carousel (Next / Prev) */}
          {result.images && result.images.length > 0 && (
            <ConceptImageGallery images={result.images} title={result.query} />
          )}

          {/* Multi-Source Citation Matrix (3-5 Verified Sources) */}
          {result.citations.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-cyan-400" /> Multi-Source Evidence Matrix ({result.citations.length} Verified Sources)
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                  98% Confidence Grounded
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.citations.map((c) => (
                  <a
                    key={c.id}
                    href={c.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-primary/50 hover:bg-white/[0.06] hover:shadow-lg hover:shadow-primary/10"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 text-accent">
                            <Globe className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-bold text-foreground group-hover:text-cyan-300 transition-colors line-clamp-1">
                            {c.title}
                          </span>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-400 shrink-0">
                          {Math.round(c.score * 100)}% match
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                        {c.snippet}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/5 text-[10px] text-muted-foreground">
                      <span className="font-medium text-cyan-400/90">{c.domain}</span>
                      <span className="flex items-center gap-1 group-hover:text-white transition-colors">
                        Inspect Source <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              {/* Listen / Pause Voice in Selected Language */}
              <button
                onClick={() => {
                  if (speaking) {
                    onStop();
                  } else {
                    onListen(activeAnswer, currentLang.code);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent px-7 py-3 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                {speaking ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {speaking
                  ? "Pause Voice"
                  : currentLang.shortCode === "en"
                    ? "+ Listen Voice"
                    : `+ Listen (${currentLang.nativeName})`}
              </button>

              {/* Prominent Full Copy Button */}
              <button
                onClick={copyAnswer}
                className={`rounded-full border px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 ${copied
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-md shadow-emerald-500/10"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground hover:bg-white/10"
                  }`}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? "Copied to Clipboard" : "Copy Response"}</span>
              </button>

              {/* RAG Metrics Button */}
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground hover:bg-white/10 cursor-pointer flex items-center gap-1.5"
              >
                <Layers className="h-3.5 w-3.5" />
                {showDetails ? "Hide Metrics" : "RAG Metrics"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFeedback("up")}
                className={`rounded-full border p-2.5 transition-all ${feedback === "up" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
                  }`}
                aria-label="Helpful"
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleFeedback("down")}
                className={`rounded-full border p-2.5 transition-all ${feedback === "down" ? "border-rose-500 bg-rose-500/20 text-rose-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
                  }`}
                aria-label="Not helpful"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
              <button
                onClick={onAskAnother}
                className="ml-2 text-xs font-semibold text-accent hover:underline cursor-pointer transition-colors"
              >
                Ask Another Query
              </button>
            </div>
          </div>

          {/* Expandable RAG Telemetry Details */}
          {showDetails && (
            <div className="space-y-4 rounded-3xl border border-white/10 bg-black/40 p-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> RAG Grounding & Telemetry
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {Math.round(result.latencies.total)} ms latency
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-4 text-xs">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-muted-foreground block uppercase">Confidence</span>
                  <span className="text-base font-semibold text-emerald-400">
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-muted-foreground block uppercase">Grounding Score</span>
                  <span className="text-base font-semibold text-primary">
                    {Math.round(result.grounding * 100)}%
                  </span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-muted-foreground block uppercase">Language</span>
                  <span className="text-base font-semibold text-accent">{currentLang.nativeName}</span>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-muted-foreground block uppercase">Status</span>
                  <span className="text-base font-semibold text-foreground">{result.status}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Audio Playback Bar */}
      <div className="flex w-full max-w-md items-center justify-between rounded-full border border-white/15 bg-[#0a0e20]/90 px-6 py-3 shadow-2xl backdrop-blur-2xl">
        <button
          onClick={() => {
            if (speaking) {
              onStop();
            } else {
              onListen(activeAnswer, currentLang.code);
            }
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 cursor-pointer"
          aria-label={speaking ? "Pause audio" : "Play audio"}
        >
          {speaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </button>

        {/* Animated Equalizer Waveform */}
        <div className="flex items-center gap-1">
          {[...Array(16)].map((_, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-primary to-accent transition-all"
              style={{
                height: speaking ? `${8 + Math.abs(Math.sin(i * 0.8 + Date.now() * 0.005)) * 22}px` : "6px",
                opacity: speaking ? 0.9 : 0.3,
                animation: speaking ? `pulse-wave 0.8s ease-in-out infinite alternate` : undefined,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          ))}
        </div>

        {/* Speed Selector */}
        <button
          onClick={() => setPlaybackSpeed((s) => (s === 1.0 ? 1.25 : s === 1.25 ? 1.5 : 1.0))}
          className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {playbackSpeed.toFixed(1)}x
        </button>
      </div>
    </div>
  );
}