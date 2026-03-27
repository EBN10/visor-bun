"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "~/components/ui/button"
import { ArrowRight, Layers, Settings, Users, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { ThemeToggle } from "~/components/ui/theme-toggle"

const ease = [0.25, 1, 0.5, 1] as const

const reveal = {
  hidden: { opacity: 0, y: 22 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.1, duration: 0.7, ease },
  }),
}

const features = [
  {
    icon: Layers,
    title: "Visualización de Capas",
    desc: "Capas vectoriales, WMS y XYZ en un mapa interactivo con controles de visibilidad y agrupación jerárquica.",
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
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt="Logo Dirección de Estadísticas y Censos"
              width={28}
              height={28}
              className="rounded"
            />
            <span className="text-sm font-semibold tracking-tight font-heading">
              IDE Santiago del Estero
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/mapa">
              <Button size="sm" className="gap-1.5">
                Explorar Mapa
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[100dvh] flex items-center overflow-hidden">
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

        <div className="relative mx-auto max-w-7xl px-6 pt-32 pb-24 w-full">
          <div className="max-w-2xl">
            {/* 4-color identity bar */}
            <motion.div
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={0}
              className="flex gap-1.5 mb-8"
            >
              <div className="w-8 h-1 rounded-full" style={{ background: "var(--logo-peach)" }} />
              <div className="w-8 h-1 rounded-full" style={{ background: "var(--logo-lime)" }} />
              <div className="w-8 h-1 rounded-full" style={{ background: "var(--logo-gold)" }} />
              <div className="w-8 h-1 rounded-full" style={{ background: "var(--logo-pearl)" }} />
            </motion.div>

            <motion.h1
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={1}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] font-heading"
            >
              Infraestructura de{" "}
              <span className="text-primary">Datos Espaciales</span>
            </motion.h1>

            <motion.p
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={2}
              className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              Plataforma de visualización y gestión de datos geoespaciales
              de la Dirección de Estadísticas y Censos de Santiago del Estero.
            </motion.p>

            <motion.div
              variants={reveal}
              initial="hidden"
              animate="show"
              custom={3}
              className="mt-10 flex flex-col sm:flex-row gap-4"
            >
              <Link href="/mapa">
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  Explorar el Mapa
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
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
          className="absolute bottom-8 right-8 text-[11px] font-mono text-muted-foreground/30 hidden lg:block select-none"
        >
          27°47′S 64°16′W
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section className="py-28 px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
            className="mb-16"
          >
            <div className="flex gap-1 mb-5">
              <div className="w-6 h-0.5 rounded-full" style={{ background: "var(--logo-gold)" }} />
              <div className="w-6 h-0.5 rounded-full" style={{ background: "var(--logo-lime)" }} />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
              Funcionalidades
            </h2>
            <p className="mt-3 text-muted-foreground max-w-lg">
              Herramientas diseñadas para la gestión de información geoespacial provincial.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.5, ease }}
                className="group relative p-6 rounded-xl border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
              >
                {/* Accent stripe */}
                <div
                  className="absolute left-0 top-5 bottom-5 w-[2px] rounded-full"
                  style={{ background: f.color }}
                />
                <div className="w-10 h-10 rounded-lg bg-primary/[0.06] text-primary flex items-center justify-center mb-4 group-hover:bg-primary/[0.1] transition-colors">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-base mb-2 font-heading">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-28 px-6 overflow-hidden">
        <div className="absolute inset-0">
          <Image src="/fondo-mapa.jpg" alt="" fill className="object-cover opacity-[0.06]" />
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
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading mb-4">
              Explorá los datos geoespaciales
            </h2>
            <p className="text-muted-foreground mb-10 max-w-md mx-auto">
              Accedé a la información cartográfica de la provincia de Santiago del Estero.
            </p>
            <Link href="/mapa">
              <Button size="lg" className="gap-2">
                Ir al Mapa
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8 px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-dir.estadisticasycensos.png"
              alt="Logo"
              width={22}
              height={22}
              className="rounded"
            />
            <div>
              <span className="font-medium text-sm font-heading">IDE Santiago del Estero</span>
              <p className="text-xs text-muted-foreground">
                Dirección de Estadísticas y Censos
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Gobierno de Santiago del Estero
          </p>
        </div>
      </footer>
    </div>
  )
}