import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    // .env.local を読み込む(DB 統合テスト用)
    env: loadEnv(mode, process.cwd(), ""),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
}));
