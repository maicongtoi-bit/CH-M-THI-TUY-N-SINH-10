import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load tất cả biến môi trường (không giới hạn prefix)
  const env = loadEnv(mode, process.cwd(), "");

  // Ưu tiên GEMINI_API_KEY (theo README của bạn), fallback sang VITE_GEMINI_API_KEY nếu bạn muốn đổi chuẩn Vite
  const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || "";

  return {
    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },

    // Giúp code dùng process.env.* không bị "process is not defined" ở browser
    define: {
      "process.env": JSON.stringify({
        GEMINI_API_KEY: geminiKey,
        API_KEY: geminiKey,
      }),
    },

    // Build output mặc định của Vite là dist, ghi rõ cho chắc khi deploy
    build: {
      outDir: "dist",
    },

    // Dev server (không ảnh hưởng Vercel build)
    server: {
      port: 3000,
      host: true,
    },
  };
});
