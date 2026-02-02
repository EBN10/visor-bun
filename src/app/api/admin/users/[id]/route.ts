import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// GET - Get a specific user's details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const client = await clerkClient();
    const user = await client.users.getUser(id);

    return NextResponse.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
        role: (user.publicMetadata?.role as string) ?? "editor",
      }
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Error al obtener usuario" },
      { status: 500 }
    );
  }
}

// PATCH - Update user role
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Check if current user is admin
    const client = await clerkClient();
    const currentUser = await client.users.getUser(userId);
    const currentRole = (currentUser.publicMetadata?.role as string) ?? "editor";
    
    if (currentRole !== "admin") {
      return NextResponse.json(
        { error: "Solo los administradores pueden cambiar roles" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role || !["admin", "editor"].includes(role)) {
      return NextResponse.json(
        { error: "Rol inválido. Debe ser 'admin' o 'editor'" },
        { status: 400 }
      );
    }

    // Prevent removing the last admin
    if (role === "editor") {
      const allUsers = await client.users.getUserList({ limit: 100 });
      const admins = allUsers.data.filter(
        (u) => (u.publicMetadata?.role as string) === "admin" && u.id !== id
      );
      if (admins.length === 0) {
        return NextResponse.json(
          { error: "No se puede cambiar el rol del último administrador" },
          { status: 400 }
        );
      }
    }

    await client.users.updateUser(id, {
      publicMetadata: { role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Error al actualizar usuario" },
      { status: 500 }
    );
  }
}

// DELETE - Revoke user access (delete user from Clerk)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    // Prevent self-deletion
    if (id === userId) {
      return NextResponse.json(
        { error: "No puedes revocar tu propio acceso" },
        { status: 400 }
      );
    }

    // Check if current user is admin
    const client = await clerkClient();
    const currentUser = await client.users.getUser(userId);
    const currentRole = (currentUser.publicMetadata?.role as string) ?? "editor";
    
    if (currentRole !== "admin") {
      return NextResponse.json(
        { error: "Solo los administradores pueden revocar acceso" },
        { status: 403 }
      );
    }

    // Check if trying to delete another admin
    const targetUser = await client.users.getUser(id);
    const targetRole = (targetUser.publicMetadata?.role as string) ?? "editor";
    
    if (targetRole === "admin") {
      // Check if this is the last admin
      const allUsers = await client.users.getUserList({ limit: 100 });
      const admins = allUsers.data.filter(
        (u) => (u.publicMetadata?.role as string) === "admin"
      );
      if (admins.length <= 1) {
        return NextResponse.json(
          { error: "No se puede eliminar al último administrador" },
          { status: 400 }
        );
      }
    }

    await client.users.deleteUser(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Error al revocar acceso" },
      { status: 500 }
    );
  }
}
