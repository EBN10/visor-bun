import "~/styles/globals.css";

import { type Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { QueryProvider } from "~/components/query/QueryProvider";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "~/components/ui/sonner";
import { ThemeProvider } from "~/components/providers/theme-provider";

export const metadata: Metadata = {
  title: "IDE Santiago del Estero | Infraestructura de Datos Espaciales",
  description:
    "Plataforma de visualización y gestión de datos geoespaciales de la Dirección de Estadísticas y Censos de Santiago del Estero.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="es"
        className={`${dmSans.variable} ${sora.variable}`}
        suppressHydrationWarning
      >
        <QueryProvider>
          <body className="font-sans antialiased">
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </body>
        </QueryProvider>
      </html>
    </ClerkProvider>
  );
}
