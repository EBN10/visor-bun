"use client"

import Link from "next/link"
import { Button } from "~/components/ui/button"
import { Map, ArrowRight, Layers, Settings, Users, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { ThemeToggle } from "~/components/ui/theme-toggle"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Map className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Visor SDE</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/mapa">
              <Button size="sm">
                Ingresar al Mapa
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Infraestructura de
              <br />
              <span className="text-primary">Datos Espaciales</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              Plataforma de visualización y gestión de datos geoespaciales 
              de la Dirección de Estadísticas y Censos de Santiago del Estero.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/mapa">
                <Button size="lg" className="w-full sm:w-auto">
                  Explorar el Mapa
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Panel de Administración
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-muted/50">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Funcionalidades
            </h2>
            <p className="text-muted-foreground">
              Herramientas para la gestión de información geoespacial provincial.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Layers,
                title: "Visualización de Capas",
                description: "Visualiza capas vectoriales, WMS y XYZ en un mapa interactivo con controles de visibilidad y agrupación jerárquica."
              },
              {
                icon: Upload,
                title: "Importación desde QGIS",
                description: "Importa proyectos directamente desde QGIS en formato GeoJSON para incorporar datos espaciales existentes."
              },
              {
                icon: Settings,
                title: "Gestión de Capas",
                description: "Administra capas y grupos desde el panel. Define estilos, configura visibilidad y organiza la jerarquía."
              },
              {
                icon: Users,
                title: "Control de Acceso",
                description: "Sistema de autenticación y roles para controlar quién puede ver y modificar los datos del visor."
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Accedé a los datos geoespaciales
            </h2>
            <p className="text-muted-foreground mb-8">
              Explorá la información cartográfica de la provincia de Santiago del Estero.
            </p>
            <Link href="/mapa">
              <Button size="lg">
                Ir al Mapa
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Map className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="font-medium text-sm">Visor SDE</span>
              <p className="text-xs text-muted-foreground">Dirección de Estadísticas y Censos</p>
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