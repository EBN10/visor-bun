"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import { ArrowRight, Layers, Settings, Users, Upload } from "lucide-react";
import { motion } from "framer-motion";
import { ThemeToggle } from "~/components/ui/theme-toggle";

const ease = [0.25, 1, 0.5, 1] as const;

const reveal = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.1, duration: 0.7, ease },
  }),
};

const features = [
  {
    icon: Layers,
    title: "Visualización de Capas",
    desc: "Capas vectoriales, WMS, WFS y XYZ en un mapa interactivo con controles de visibilidad y agrupación jerárquica.",
    color: "var(--logo-gold)",
  },
  {
    icon: Upload,
    title: "Importación QGIS",
    desc: "Importá proyectos desde QGIS en formato GeoJSON para incorporar datos espaciales existentes.",
    color: "var(--logo-lime)",
  },
  {
    icon: Settings,
    title: "Gestión de Capas",
    desc: "Administrá capas y grupos desde el panel. Definí estilos, configurá visibilidad y organizá la jerarquía.",
    color: "var(--logo-peach)",
  },
  {
    icon: Users,
    title: "Control de Acceso",
    desc: "Sistema de autenticación y roles para controlar quién puede ver y modificar los datos del visor.",
    color: "var(--logo-pearl)",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* ── Nav ── */}
      <nav className="border-border/40 bg-background/80 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt="Logo Dirección de Estadísticas y Censos"
              width={28}
              height={28}
              className="rounded"
            />
            <span className="font-heading text-sm font-semibold tracking-tight">
              IDE Santiago del Estero
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/mapa">
              <Button size="sm" className="gap-1.5">
                Explorar Mapa
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-[100dvh] items-center overflow-hidden">
        {/* Background map */}
        <div className="absolute inset-0">
          <Image
            src="/fondo-mapa.jpg"
            alt=""
            fill
            className="object-cover"
            priority
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--background) 25%, color-mix(in srgb, var(--background) 94%, transparent) 50%, color-mix(in srgb, var(--background) 55%, transparent) 100%)",
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-6 pt-32 pb-24">
          <div className="max-w-2xl">
            {/* 4-color identity bar */}
            <motion.div
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={0}
              className="mb-8 flex gap-1.5"
            >
              <div
                className="h-1 w-8 rounded-full"
                style={{ background: "var(--logo-peach)" }}
              />
              <div
                className="h-1 w-8 rounded-full"
                style={{ background: "var(--logo-lime)" }}
              />
              <div
                className="h-1 w-8 rounded-full"
                style={{ background: "var(--logo-gold)" }}
              />
              <div
                className="h-1 w-8 rounded-full"
                style={{ background: "var(--logo-pearl)" }}
              />
            </motion.div>

            <motion.h1
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={1}
              className="font-heading text-5xl leading-[1.08] font-bold tracking-tight sm:text-6xl lg:text-7xl"
            >
              Infraestructura de{" "}
              <span className="text-primary">Datos Espaciales</span>
            </motion.h1>

            <motion.p
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={2}
              className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed"
            >
              Plataforma de visualización y gestión de datos geoespaciales de la
              Dirección de Estadísticas y Censos de Santiago del Estero.
            </motion.p>

            <motion.div
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-10 flex flex-col gap-4 sm:flex-row"
            >
              <Link href="/mapa">
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  Explorar el Mapa
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/admin">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  Panel de Administración
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Coordinate reference — cartographic soul */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="text-muted-foreground/30 absolute right-8 bottom-8 hidden font-mono text-[11px] select-none lg:block"
        >
          27°47′S 64°16′W
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-28">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
            className="mb-16"
          >
            <div className="mb-5 flex gap-1">
              <div
                className="h-0.5 w-6 rounded-full"
                style={{ background: "var(--logo-gold)" }}
              />
              <div
                className="h-0.5 w-6 rounded-full"
                style={{ background: "var(--logo-lime)" }}
              />
            </div>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Funcionalidades
            </h2>
            <p className="text-muted-foreground mt-3 max-w-lg">
              Herramientas diseñadas para la gestión de información geoespacial
              provincial.
            </p>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-2">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.5, ease }}
                className="group border-border bg-card relative rounded-xl border p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* Accent stripe */}
                <div
                  className="absolute top-5 bottom-5 left-0 w-[2px] rounded-full"
                  style={{ background: f.color }}
                />
                <div className="bg-primary/[0.06] text-primary group-hover:bg-primary/[0.1] mb-4 flex h-10 w-10 items-center justify-center rounded-lg transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading mb-2 text-base font-semibold">
                  {f.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden px-6 py-28">
        <div className="absolute inset-0">
          <Image
            src="/fondo-mapa.jpg"
            alt=""
            fill
            className="object-cover opacity-[0.06]"
          />
        </div>
        <div className="relative mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
          >
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt=""
              width={40}
              height={40}
              className="mx-auto mb-6 rounded-lg opacity-70"
            />
            <h2 className="font-heading mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Explorá los datos geoespaciales
            </h2>
            <p className="text-muted-foreground mx-auto mb-10 max-w-md">
              Accedé a la información cartográfica de la provincia de Santiago
              del Estero.
            </p>
            <Link href="/mapa">
              <Button size="lg" className="gap-2">
                Ir al Mapa
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-border border-t px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt="Logo"
              width={22}
              height={22}
              className="rounded"
            />
            <div>
              <span className="font-heading text-sm font-medium">
                IDE Santiago del Estero
              </span>
              <p className="text-muted-foreground text-xs">
                Dirección de Estadísticas y Censos
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} Gobierno de Santiago del Estero
          </p>
        </div>
      </footer>
    </div>
  );
}
