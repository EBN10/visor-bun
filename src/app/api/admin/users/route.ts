import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    
    // Get current user to return their role
    const currentUser = await client.users.getUser(userId);
    const currentUserRole = (currentUser.publicMetadata?.role as string) ?? "editor";
    
    const usersResponse = await client.users.getUserList({
      limit: 100,
      orderBy: "-created_at",
    });

    const users = usersResponse.data.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      role: (user.publicMetadata?.role as string) ?? "editor",
    }));

    return NextResponse.json({ 
      users, 
      totalCount: usersResponse.totalCount,
      currentUserId: userId,
      currentUserRole,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Error al obtener usuarios" },
      { status: 500 }
    );
  }
}

