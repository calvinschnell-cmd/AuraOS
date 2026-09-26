// A second dev server in forced MOCK MODE (port 3100, its own build dir), so the
// kiosk can be tested next to a real-key dev server without API spend or
// writes to the real database. Run: node scripts/dev-mock.mjs
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  // Existing process env wins over .env.local, so blanking these forces mock mode + in-memory store.
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  TIGER_DATABASE_URL: "",
  SOLANA_BADGES_ENABLED: "false",
  PRINTING_ENABLED: "false",
  ML_SERVICE_URL: "off",
  AURA_DIST_DIR: process.env.AURA_DIST_DIR || ".next-mock",
};

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", process.env.PORT ?? "3100"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
