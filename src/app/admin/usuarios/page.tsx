"use client"

import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { MoreHorizontal, Send, Loader2, Mail, UserPlus, RefreshCw, Shield, Edit, Trash2, User } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "~/components/ui/alert-dialog"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"

interface User {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  imageUrl: string
  createdAt: number
  lastSignInAt: number | null
  role: string
}

interface Invitation {
  id: string
  emailAddress: string
  status: string
  createdAt: number
  role: string
}

export default function UsuariosPage() {
  const queryClient = useQueryClient()
  const [users, setUsers] = useState<User[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "editor">("editor")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("editor")
  
  // User details dialog
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  
  // Role change dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [userToChangeRole, setUserToChangeRole] = useState<User | null>(null)
  const [newRole, setNewRole] = useState<"admin" | "editor">("editor")
  const [isChangingRole, setIsChangingRole] = useState(false)
  
  // Revoke access dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [userToRevoke, setUserToRevoke] = useState<User | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const isAdmin = currentUserRole === "admin"

  const fetchUsers = async () => {
    setIsLoadingUsers(true)
    try {
      const response = await fetch("/api/admin/users")
      if (!response.ok) throw new Error("Error al obtener usuarios")
      const data = await response.json()
      setUsers(data.users)
      setCurrentUserId(data.currentUserId)
      setCurrentUserRole(data.currentUserRole)
      // Keep dashboard user count in sync
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] })
    } catch (error) {
      toast.error("Error al cargar usuarios")
      console.error(error)
    } finally {
      setIsLoadingUsers(false)
    }
  }

  const fetchInvitations = async () => {
    setIsLoadingInvitations(true)
    try {
      const response = await fetch("/api/admin/invitations")
      if (!response.ok) throw new Error("Error al obtener invitaciones")
      const data = await response.json()
      setInvitations(data.invitations)
    } catch (error) {
      toast.error("Error al cargar invitaciones")
      console.error(error)
    } finally {
      setIsLoadingInvitations(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchInvitations()
  }, [])

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error("Ingrese un correo electrónico")
      return
    }

    setIsInviting(true)
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: inviteEmail, role: inviteRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al enviar invitación")
      }

      toast.success(`Invitación enviada a ${inviteEmail} como ${inviteRole === "admin" ? "Administrador" : "Editor"}`)
      setInviteEmail("")
      setInviteRole("editor")
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      fetchInvitations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al enviar invitación")
    } finally {
      setIsInviting(false)
    }
  }

  const handleChangeRole = async () => {
    if (!userToChangeRole) return

    setIsChangingRole(true)
    try {
      const response = await fetch(`/api/admin/users/${userToChangeRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al cambiar rol")
      }

      toast.success(`Rol de ${userToChangeRole.firstName} cambiado a ${newRole === "admin" ? "Administrador" : "Editor"}`)
      setRoleDialogOpen(false)
      setUserToChangeRole(null)
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al cambiar rol")
    } finally {
      setIsChangingRole(false)
    }
  }

  const handleRevokeAccess = async () => {
    if (!userToRevoke) return

    setIsRevoking(true)
    try {
      const response = await fetch(`/api/admin/users/${userToRevoke.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al revocar acceso")
      }

      toast.success(`Acceso de ${userToRevoke.firstName} revocado correctamente`)
      setRevokeDialogOpen(false)
      setUserToRevoke(null)
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] })
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al revocar acceso")
    } finally {
      setIsRevoking(false)
    }
  }

  const openRoleDialog = (user: User) => {
    setUserToChangeRole(user)
    setNewRole(user.role as "admin" | "editor")
    setRoleDialogOpen(true)
  }

  const openRevokeDialog = (user: User) => {
    setUserToRevoke(user)
    setRevokeDialogOpen(true)
  }

  const openDetailsDialog = (user: User) => {
    setSelectedUser(user)
    setDetailsDialogOpen(true)
  }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "Nunca"
    return new Date(timestamp).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const formatDateShort = (timestamp: number | null) => {
    if (!timestamp) return "Nunca"
    return new Date(timestamp).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pendiente</Badge>
      case "accepted":
        return <Badge variant="default">Aceptada</Badge>
      case "expired":
        return <Badge variant="outline">Expirada</Badge>
      case "revoked":
        return <Badge variant="destructive">Revocada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Admin</Badge>
      default:
        return <Badge variant="secondary"><Edit className="h-3 w-3 mr-1" />Editor</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Gestiona los usuarios y sus permisos" : "Vista de usuarios del sistema"}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invitar Usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invitar Usuario</DialogTitle>
                <DialogDescription>
                  Envía una invitación por correo electrónico. Solo usuarios invitados pueden acceder al panel.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isInviting) {
                        handleInvite()
                      }
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Rol</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "editor")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">
                        <div className="flex items-center gap-2">
                          <Edit className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Editor</div>
                            <div className="text-xs text-muted-foreground">Puede crear, modificar y eliminar capas</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Administrador</div>
                            <div className="text-xs text-muted-foreground">Todo lo de Editor + gestión de usuarios</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleInvite} disabled={isInviting}>
                  {isInviting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Invitación
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Usuarios Activos</TabsTrigger>
          <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Usuarios Registrados</CardTitle>
                <CardDescription>
                  Usuarios con acceso al panel de administración.
                </CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={fetchUsers} disabled={isLoadingUsers}>
                <RefreshCw className={`h-4 w-4 ${isLoadingUsers ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mb-4" />
                  <p>No hay usuarios registrados</p>
                  <p className="text-sm">Envía invitaciones para agregar usuarios</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Último Acceso</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.imageUrl} />
                              <AvatarFallback>
                                {(user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {user.firstName} {user.lastName}
                              </span>
                              {user.id === currentUserId && (
                                <span className="text-xs text-muted-foreground">(Tú)</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>{formatDateShort(user.lastSignInAt)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openDetailsDialog(user)}>
                                <User className="h-4 w-4 mr-2" />
                                Ver detalles
                              </DropdownMenuItem>
                              {isAdmin && user.id !== currentUserId && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openRoleDialog(user)}>
                                    <Shield className="h-4 w-4 mr-2" />
                                    Cambiar rol
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => openRevokeDialog(user)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Revocar acceso
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Invitaciones Enviadas</CardTitle>
                <CardDescription>
                  Historial de invitaciones enviadas.
                </CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={fetchInvitations} disabled={isLoadingInvitations}>
                <RefreshCw className={`h-4 w-4 ${isLoadingInvitations ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingInvitations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mb-4" />
                  <p>No hay invitaciones</p>
                  {isAdmin && <p className="text-sm">Usa el botón &quot;Invitar Usuario&quot; para enviar una</p>}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Enviada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell className="font-medium">{invitation.emailAddress}</TableCell>
                        <TableCell>{getRoleBadge(invitation.role)}</TableCell>
                        <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                        <TableCell>{formatDateShort(invitation.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalles del Usuario</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedUser.imageUrl} />
                  <AvatarFallback className="text-lg">
                    {(selectedUser.firstName?.[0] ?? "") + (selectedUser.lastName?.[0] ?? "")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedUser.firstName} {selectedUser.lastName}
                  </h3>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                </div>
              </div>
              <div className="grid gap-3 pt-4 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rol</span>
                  {getRoleBadge(selectedUser.role)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registrado</span>
                  <span>{formatDate(selectedUser.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Último acceso</span>
                  <span>{formatDate(selectedUser.lastSignInAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono text-xs">{selectedUser.id}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Rol</DialogTitle>
            <DialogDescription>
              Cambiar el rol de {userToChangeRole?.firstName} {userToChangeRole?.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "editor")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">
                  <div className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    <span>Editor - Puede gestionar capas</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Administrador - Acceso completo</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangeRole} disabled={isChangingRole}>
              {isChangingRole ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Access Confirmation */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el acceso de <strong>{userToRevoke?.firstName} {userToRevoke?.lastName}</strong> ({userToRevoke?.email}) al sistema. 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAccess}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revocando...
                </>
              ) : (
                "Revocar acceso"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
