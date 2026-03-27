import { auth } from "@clerk/nextjs/server"
import { desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { adminAuditLogs } from "~/server/db/schema"

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const rows = await db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
      .limit(25)

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching admin activity:", error)
    return NextResponse.json(
      { error: "Error al obtener actividad administrativa" },
      { status: 500 }
    )
  }
}
