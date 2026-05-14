import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuditActor, writeAuditLog } from "~/server/audit";
import { db } from "~/server/db";

function serializeInvitation(invitation: {
  id: string;
  emailAddress: string;
  status: string;
  createdAt: number;
  publicMetadata?: Record<string, unknown> | null;
}) {
  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    status: invitation.status,
    createdAt: invitation.createdAt,
    role: (invitation.publicMetadata?.role as string) ?? "editor",
  };
}

export async function GET() {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const invitations = await client.invitations.getInvitationList({
      limit: 100,
    });

    return NextResponse.json({ 
      invitations: invitations.data.map(serializeInvitation)
    });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { error: "Error al obtener invitaciones" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    
    // Check if current user is admin
    const currentUser = await client.users.getUser(userId);
    const currentRole = (currentUser.publicMetadata?.role as string) ?? "editor";
    
    if (currentRole !== "admin") {
      return NextResponse.json(
        { error: "Solo los administradores pueden enviar invitaciones" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { emailAddress, role = "editor", forceResend = false } = body as {
      emailAddress?: string;
      role?: string;
      forceResend?: boolean;
    };

    if (!emailAddress) {
      return NextResponse.json(
        { error: "Email requerido" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(emailAddress).trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Formato de email inválido" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["admin", "editor"].includes(role)) {
      return NextResponse.json(
        { error: "Rol inválido. Debe ser 'admin' o 'editor'" },
        { status: 400 }
      );
    }

    const existingUsers = await client.users.getUserList({
      emailAddress: [normalizedEmail],
      limit: 1,
    });

    if (existingUsers.totalCount > 0) {
      return NextResponse.json(
        { error: "Ya existe un usuario con este email" },
        { status: 400 }
      );
    }

    const existingInvitations = await client.invitations.getInvitationList({
      query: normalizedEmail,
      limit: 100,
    });

    const matchingInvitations = existingInvitations.data.filter(
      (invitation) => invitation.emailAddress.toLowerCase() === normalizedEmail
    );
    const latestMatchingInvitation = matchingInvitations
      .slice()
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0];

    const hasPendingInvitation = matchingInvitations.some(
      (invitation) => invitation.status === "pending"
    );

    if (hasPendingInvitation) {
      return NextResponse.json(
        { error: "Ya existe una invitación pendiente para este email" },
        { status: 400 }
      );
    }

    if (!forceResend && latestMatchingInvitation) {
      return NextResponse.json(
        {
          error: "Ya existe una invitación previa para este email",
          canResend: true,
          existingInvitation: serializeInvitation(latestMatchingInvitation),
        },
        { status: 409 }
      );
    }

    const invitation = await client.invitations.createInvitation({
      emailAddress: normalizedEmail,
      ignoreExisting: true,
      publicMetadata: { role },
    });

    const actor = await getAuditActor();
    try {
      await writeAuditLog(db, {
        actor,
        action: forceResend ? "invite_resend" : "invite",
        resourceType: "invitation",
        resourceId: invitation.id,
        resourceLabel: invitation.emailAddress,
        summary: forceResend
          ? `Reenvió la invitación a "${invitation.emailAddress}" como ${role}`
          : `Invitó a "${invitation.emailAddress}" como ${role}`,
        details: {
          metadata: {
            role,
            status: invitation.status,
            resentFromInvitationId: latestMatchingInvitation?.id ?? null,
            previousStatus: latestMatchingInvitation?.status ?? null,
          },
        },
      });
    } catch (auditError) {
      console.error("Error writing invitation audit log:", auditError);
    }

    return NextResponse.json({ 
      success: true, 
      invitation: serializeInvitation(invitation),
    });
  } catch (error: unknown) {
    console.error("Error creating invitation:", error);
    
    // Handle Clerk-specific errors
    if (error && typeof error === 'object' && 'errors' in error) {
      const clerkError = error as { errors: Array<{ message: string; code: string }> };
      if (clerkError.errors && clerkError.errors.length > 0) {
        const firstError = clerkError.errors[0];
        if (firstError?.code === 'duplicate_record') {
          return NextResponse.json(
            { error: "Ya existe una invitación pendiente para este email" },
            { status: 400 }
          );
        }
        if (firstError?.code === 'form_identifier_exists') {
          return NextResponse.json(
            { error: "Ya existe un usuario con este email" },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: firstError?.message ?? "Error de Clerk" },
          { status: 400 }
        );
      }
    }
    
    const message = error instanceof Error ? error.message : "Error al crear invitación";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}


