import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時の左下インジケーターを非表示(操作の邪魔になるため)
  devIndicators: false,
  // @sentry/node は Node ネイティブの require フック(OpenTelemetry 計装)を使うため、
  // バンドルせず native require に任せる(Issue #16)
  serverExternalPackages: ["@sentry/node"],
};

export default nextConfig;
