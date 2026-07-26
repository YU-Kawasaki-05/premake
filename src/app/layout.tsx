import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
});

const shipporiMincho = Shippori_Mincho({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-shippori",
});

export const metadata: Metadata = {
  title: {
    default: "premake",
    template: "%s | premake",
  },
  description: "クリニックの自由診療予約・業務管理",
  // クローズド運用のため当面 noindex(公開ページの方針確定時に見直す)
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={cn(
        "h-full antialiased font-sans",
        inter.variable,
        notoSansJP.variable,
        shipporiMincho.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
