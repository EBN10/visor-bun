import "~/styles/globals.css";

import { type Metadata } from "next";
import { Kanit } from "next/font/google";
import { QueryProvider } from "~/components/query/QueryProvider";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Toaster } from "~/components/ui/sonner";
import { ThemeProvider } from "~/components/providers/theme-provider";
import { GlobalThemeToggle } from "~/components/global-theme-toggle";

export const metadata: Metadata = {
  title: "Visor SDE | Infraestructura de Datos Espaciales",
  description: "Plataforma de visualización y gestión de datos geoespaciales de la Dirección de Estadísticas y Censos de Santiago del Estero.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-kanit",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="es" className={kanit.variable} suppressHydrationWarning>
        <QueryProvider>
          <body className="font-sans">
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
