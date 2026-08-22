import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, LayoutDashboard, Settings2, Sparkles, Cpu, Sun, Moon, History } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AnswerPanel } from "@/components/vera/AnswerPanel";
import { ChatHistoryDrawer } from "@/components/vera/ChatHistoryDrawer";
import { DashboardView } from "@/components/vera/DashboardView";
import { DevPanel } from "@/components/vera/DevPanel";
import { PipelineInspectorModal } from "@/components/vera/PipelineInspectorModal";
import { ProcessingVortex } from "@/components/vera/ProcessingVortex";
import { SettingsModal } from "@/components/vera/SettingsModal";
import { VoiceCircle } from "@/components/vera/VoiceCircle";
import { useVera } from "@/hooks/useVera";
import { getSessionHistory, HISTORY_EVENT_NAME } from "@/lib/chat-history";
import { getStoredAppearance, applyAppearance, DEFAULT_APPEARANCE, type AppearanceConfig } from "@/lib/appearance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Edith — Voice Evidence Assistant" },
      {
        name: "description",
        content:
          "Ask out loud. Hear verified evidence. Edith retrieves real passages from MS MARCO and verifies every claim with sub-second latency.",
      },
      { property: "og:title", content: "Edith — Voice Evidence Assistant" },
      {
        property: "og:description",
        content: "Ask out loud. Hear verified evidence.",
      },
    ],
  }),
  component: EdithPage,
});

const QUICK_SUGGESTIONS = [
  "What is the capital of France?",
  "What is machine learning?",
  "Explain photosynthesis light reactions",
  "What causes earthquakes?",
  "What is quantum computing?",
];

function EdithPage() {
  const edith = useVera();
  const [devOpen, setDevOpen] = React.useState(false);
  const [pipelineOpen, setPipelineOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyCount, setHistoryCount] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<"assistant" | "dashboard">("assistant");
  const [appearance, setAppearance] = React.useState<AppearanceConfig>(DEFAULT_APPEARANCE);

  // Initialize and listen to real-time appearance and history changes
  React.useEffect(() => {
    const initial = getStoredAppearance();
    applyAppearance(initial);
    setAppearance(initial);

    setHistoryCount(getSessionHistory().length);
    const handleHistoryChange = () => {
      setHistoryCount(getSessionHistory().length);
    };

    const handleAppearanceChange = (e: Event) => {
      const customEvent = e as CustomEvent<AppearanceConfig>;
      if (customEvent.detail) {
        setAppearance(customEvent.detail);
      }
    };

    window.addEventListener("edith-appearance-change", handleAppearanceChange);
    window.addEventListener(HISTORY_EVENT_NAME, handleHistoryChange);
    return () => {
      window.removeEventListener("edith-appearance-change", handleAppearanceChange);
      window.removeEventListener(HISTORY_EVENT_NAME, handleHistoryChange);
    };
  }, []);

  const handleSuggestionClick = (queryText: string) => {
    void edith.submitText(queryText);
  };

  return (
    <div
      data-theme={appearance.theme}
      className="relative min-h-screen overflow-x-hidden bg-background bg-mesh text-foreground selection:bg-primary/30 flex flex-col justify-between transition-colors duration-500"
    >
      <Toaster position="top-center" />
      <CosmicStarfield enabled={appearance.particles} />

      {/* Top Navigation Bar */}
      <header className="relative z-30 flex items-center justify-between px-6 py-6 md:px-12">
        {/* Left: Brand Logo with Animated Video Nucleus & Edith Branding */}
        <button
          onClick={() => {
            setViewMode("assistant");
            edith.reset();
          }}
          className="flex items-center gap-3 cursor-pointer group outline-none"
        >
          <div className="relative grid h-10 w-10 place-items-center rounded-2xl overflow-hidden bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 glow-purple transition-transform group-hover:scale-105">
            <video
              src="/assets/ai-assistant-logo-animation.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover mix-blend-screen scale-125"
            />
            <span className="relative z-10 font-bold text-lg text-white drop-shadow-md">E</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
            Edith
          </span>
        </button>

        {/* Center: Navigation Links */}
        <nav className="hidden items-center gap-8 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:flex">
          <button
            onClick={() => setPipelineOpen(true)}
            className="transition-colors hover:text-white cursor-pointer flex items-center gap-1.5"
          >
            <Cpu className="h-3.5 w-3.5 text-accent" /> 40+ Features
          </button>
          <button
            onClick={() => setPipelineOpen(true)}
            className="transition-colors hover:text-white cursor-pointer"
          >
            How it Works
          </button>
          <button
            onClick={() => setDevOpen(true)}
            className="transition-colors hover:text-white cursor-pointer"
          >
            Trust & Latency
          </button>
          <button
            onClick={() => setViewMode((v) => (v === "dashboard" ? "assistant" : "dashboard"))}
            className={`flex items-center gap-1.5 transition-colors hover:text-accent cursor-pointer ${
              viewMode === "dashboard" ? "text-accent font-bold" : ""
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </button>
        </nav>

        {/* Right: Architecture, Telemetry, Theme, Settings & Chat History */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            onClick={() => setPipelineOpen(true)}
            className="hidden lg:flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300 transition-all hover:bg-primary/20 hover:scale-105 cursor-pointer shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse" /> RAG Architecture
          </button>
          <button
            onClick={() => setDevOpen(true)}
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-white cursor-pointer shadow-sm"
          >
            <BarChart3 className="h-3.5 w-3.5 text-accent" /> Telemetry
          </button>
          <button
            onClick={() => {
              const nextTheme = appearance.theme === "light" ? "cosmic" : "light";
              applyAppearance({ theme: nextTheme });
              toast.success(`Switched to ${nextTheme === "light" ? "Lumina Light Mode" : "Cosmic Dark Mode"}`);
            }}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Toggle light and dark mode"
            title={appearance.theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {appearance.theme === "light" ? (
              <Moon className="h-4 w-4 text-primary" />
            ) : (
              <Sun className="h-4 w-4 text-amber-400" />
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="Voice and system settings"
            title="System Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {/* Chat History button at the right side of system settings */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="relative flex items-center gap-1.5 rounded-full border border-primary/50 bg-gradient-to-r from-primary/20 via-accent/15 to-primary/20 px-3 py-2 text-xs font-bold text-cyan-200 transition-all hover:scale-105 hover:border-cyan-400 hover:bg-primary/30 cursor-pointer shadow-md shadow-primary/20"
            aria-label="Open session chat history"
            title="Session Chat History (temporary)"
          >
            <History className="h-4 w-4 text-cyan-300" />
            <span className="hidden sm:inline font-medium">History</span>
            {historyCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow-sm">
                {historyCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 py-8 md:px-12">
        {viewMode === "dashboard" ? (
          /* DASHBOARD VIEW */
          <DashboardView
            onAskQuestion={(q) => {
              setViewMode("assistant");
              void edith.submitText(q);
            }}
            onStartVoice={() => {
              setViewMode("assistant");
              edith.reset();
              edith.toggle();
            }}
          />
        ) : edith.phase === "answer" && edith.result ? (
          /* ANSWER + SOURCES & PLAYBACK */
          <AnswerPanel
            result={edith.result}
            speaking={edith.isSpeaking}
            regenerating={Object.values(edith.stages).some((s) => s === "active")}
            onListen={(text, langCode) => void edith.play(text || edith.result!.spokenSummary || edith.result!.answer, langCode)}
            onStop={edith.stopSpeaking}
            onAskAnother={edith.reset}
          />
        ) : edith.phase === "processing" ? (
          /* PROCESSING STATE (3D Cosmic Vortex) */
          <ProcessingVortex
            transcript={edith.transcript}
            stages={edith.stages}
            onCancel={edith.reset}
          />
        ) : edith.phase === "listening" ? (
          /* LISTENING STATE */
          <section className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center animate-in fade-in duration-500">
            <div className="space-y-3">
              <h2 className="text-4xl font-light tracking-tight text-white md:text-6xl">
                How can I help you?
              </h2>
              <p className="text-sm font-medium text-accent animate-pulse tracking-wide">
                I&apos;m listening…
              </p>
            </div>

            {/* Centered Voice Orb with Flowing Neon Sine Waves */}
            <VoiceCircle
              phase="listening"
              level={edith.level}
              onClick={edith.toggle}
              size={330}
              showWaves={true}
            />

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Try asking: &ldquo;What is machine learning?&rdquo;
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {QUICK_SUGGESTIONS.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-white transition-all cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          /* PERFECTLY CENTERED HERO LANDING */
          <section className="flex w-full max-w-4xl flex-col items-center justify-center gap-8 text-center animate-in fade-in duration-700">
            {/* Top Evidence Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> AI Evidence First &bull; 40+ Subsystems
            </div>

            {/* Central Interactive Voice Assistant Orb (Bich Mai) */}
            <VoiceCircle
              phase="idle"
              level={0}
              speaking={edith.isSpeaking}
              onClick={edith.toggle}
              size={340}
              showWaves={false}
            />

            {/* One Sentence Idea in 4-5 Words Underneath */}
            <div className="space-y-2 max-w-lg">
              <h2 className="text-2xl font-light tracking-tight text-white md:text-3xl">
                Ask out loud. Hear verified evidence.
              </h2>
              <p className="text-xs text-muted-foreground">
                Tap the sphere or press Spacebar to start speaking with Edith
              </p>
            </div>

            {/* Quick Prompt Questions Centered Below */}
            <div className="space-y-2.5 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 block">
                Quick Prompt Questions
              </span>
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-white transition-all cursor-pointer shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Attribution Tag */}
            <div className="pt-2 text-[11px] text-muted-foreground/70 flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Edith Intelligence &bull; MS MARCO Grounded</span>
            </div>
          </section>
        )}
      </main>

      {/* 40+ Features & Pipeline Architecture Inspector Modal */}
      {pipelineOpen && <PipelineInspectorModal onClose={() => setPipelineOpen(false)} />}

      {/* Dev / Telemetry Waterfall Modal */}
      {devOpen && <DevPanel onClose={() => setDevOpen(false)} />}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          voice={edith.voice}
          setVoice={edith.setVoice}
          autoPlay={edith.autoPlay}
          setAutoPlay={edith.setAutoPlay}
          onResearchModeChange={(mode) => {
            // Instantly re-generate the displayed answer with the new research mode
            void edith.reQueryWithMode(mode);
          }}
        />
      )}


      {/* Session Chat History Drawer */}
      <ChatHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectHistory={(response) => {
          setViewMode("assistant");
          edith.loadHistoryResponse(response);
        }}
        onAskSuggestion={(queryText) => {
          setViewMode("assistant");
          void edith.submitText(queryText);
        }}
      />
    </div>
  );
}

function CosmicStarfield({ enabled = true }: { enabled?: boolean }) {
  const stars = React.useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        top: `${(i * 37) % 100}%`,
        left: `${(i * 61) % 100}%`,
        size: 1 + ((i * 7) % 3) * 0.7,
        delay: `${(i % 10) * 0.4}s`,
      })),
    [],
  );

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-500">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white/40 animate-[twinkle_4s_ease-in-out_infinite]"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}