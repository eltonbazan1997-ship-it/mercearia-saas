import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mercearia OS · PDV e Fiado",
  description:
    "Micro-SaaS B2B para pequenos mercados e mercearias: cadastro de produtos, controle de estoque, fiado e comprovantes térmicos.",
  applicationName: "Mercearia OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mercearia OS",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className="h-[100dvh] min-h-[100dvh] w-full max-w-full select-none overflow-hidden overflow-x-hidden overscroll-none"
    >
      <body className="h-[100dvh] min-h-[100dvh] w-full max-w-full select-none overflow-hidden overflow-x-hidden overscroll-none bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
