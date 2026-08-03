import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-interface",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: {
    default: "Cuidado na Gestação na APS",
    template: "%s | Cuidado na Gestação",
  },
  description: "Sistema de monitoramento do cuidado pré-natal",
  icons: {
    icon: [
      {
        url: "/brand/pet-saude-color.png",
        type: "image/png",
      },
    ],
    shortcut: "/brand/pet-saude-color.png",
    apple: "/brand/pet-saude-color.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${manrope.variable}`}>
        {children}
      </body>
    </html>
  );
}
