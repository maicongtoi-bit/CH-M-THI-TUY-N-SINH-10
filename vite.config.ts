import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const envFromFiles = loadEnv(mode, process.cwd(), "");
  const geminiKey = process.env.GEMINI_API_KEY || envFromFiles.GEMINI_API_KEY || "";

  return {
    plugins: [react()],
    define: {
      "process.env.API_KEY": JSON.stringify(geminiKey),
      "process.env.GEMINI_API_KEY": JSON.stringify(geminiKey),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
