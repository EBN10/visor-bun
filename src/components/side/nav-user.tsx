"use client"
import { UserButton, useUser, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs"
import { LogIn } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"

export function NavUser() {
  const { user, isLoaded } = useUser()

  if (!isLoaded) return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" disabled>
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
             <span className="size-4 animate-pulse bg-muted rounded" />
          </div>
           <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold animate-pulse bg-muted h-4 w-20 rounded" />
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SignedIn>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex items-center gap-3">
              <UserButton />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.fullName}</span>
                <span className="truncate text-xs">{user?.primaryEmailAddress?.emailAddress}</span>
              </div>
            </div>
          </SidebarMenuButton>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <LogIn className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Iniciar Sesión</span>
                <span className="truncate text-xs">Acceder al sistema</span>
              </div>
            </SidebarMenuButton>
          </SignInButton>
        </SignedOut>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
