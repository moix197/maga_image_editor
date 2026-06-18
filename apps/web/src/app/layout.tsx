import type { Metadata } from "next";
import {
  Inter,
  Roboto,
  Playfair_Display,
  Oswald,
  Merriweather,
  Dancing_Script,
} from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-roboto" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair-display" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-merriweather" });
const dancingScript = Dancing_Script({ subsets: ["latin"], variable: "--font-dancing-script" });

export const metadata: Metadata = {
  title: "MAGA Image Editor",
  description: "A powerful image editing tool",
};

const fontVariables = [
  inter.variable,
  roboto.variable,
  playfairDisplay.variable,
  oswald.variable,
  merriweather.variable,
  dancingScript.variable,
].join(" ");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${fontVariables}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
