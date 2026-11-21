# Edith — Grounded Voice Evidence RAG Assistant
GrowthX Code: JRCWJ2
Edith is a high-performance, voice-enabled Retrieval-Augmented Generation (RAG) assistant with grounded evidence verification, real-time audio visualization, dynamic citations, and low-latency streaming.

## 🚀 Features

- **Voice & Multimodal RAG**: Real-time microphone listening, speech transcription, neural intent classification, and low-latency audio response playback.
- **Hybrid Retrieval**: Dense vector embeddings paired with sparse BM25 keyword matching and Reciprocal Rank Fusion (RRF).
- **Grounded Verification**: Hallucination detection and claim grounding score against MS MARCO evidence passages.
- **Session History Drawer**: Full query/response history persisted across tab interactions via sessionStorage with instant restore capabilities.
- **Telemetry & Pipeline Inspector**: Complete latency breakdown and architecture inspection across all RAG pipeline stages.

## 🛠️ Development

Ensure you have Node.js 18+ installed.

```sh
# Clone repository
git clone https://github.com/Shreyas04venom/RAG.git

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```env
SUPABASE_URL="https://<your-project>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
OPENAI_API_KEY="sk-..."
```
