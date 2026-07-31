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
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only は既定で「Client Component から使うな」と投げる実装に解決される。
      // テストは Node で走る = サーバー相当なので、Next と同じ空実装(react-server 条件)に向ける。
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
}));
