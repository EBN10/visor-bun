"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "~/components/ui/button"

export function ThemeToggle({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-lg"
        disabled
        {...props}
      >
        <span className="sr-only">Cargando tema</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-9 w-9 rounded-lg hover:bg-secondary transition-colors ${className ?? ""}`}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      {...props}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-primary" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-primary" />
      <span className="sr-only">Cambiar tema</span>
    </Button>
  )
}
