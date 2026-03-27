import { auth } from "@clerk/nextjs/server"
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "~/server/db"
import { adminAuditLogs } from "~/server/db/schema"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

function parseTextFilter(value: string | null) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  return trimmed
}

export async function GET(request: Request) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const action = parseTextFilter(searchParams.get("action"))
    const resourceType = parseTextFilter(searchParams.get("resourceType"))
    const actor = parseTextFilter(searchParams.get("actor"))
    const search = parseTextFilter(searchParams.get("search"))
    const page = parsePositiveInt(searchParams.get("page"), 1)
    const pageSize = Math.min(
      parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    )
    const filters: SQL[] = []

    if (action && action !== "all") {
      filters.push(eq(adminAuditLogs.action, action))
    }

    if (resourceType && resourceType !== "all") {
      filters.push(eq(adminAuditLogs.resourceType, resourceType))
    }

    if (actor) {
      const actorPattern = `%${actor}%`
      const actorFilter = or(
        ilike(adminAuditLogs.actorName, actorPattern),
        ilike(adminAuditLogs.actorEmail, actorPattern),
        ilike(adminAuditLogs.actorUserId, actorPattern)
      )

      if (actorFilter) {
        filters.push(actorFilter)
      }
    }

    if (search) {
      const searchPattern = `%${search}%`
      const searchFilter = or(
        ilike(adminAuditLogs.summary, searchPattern),
        ilike(adminAuditLogs.resourceLabel, searchPattern),
        ilike(adminAuditLogs.resourceId, searchPattern),
        ilike(adminAuditLogs.actorName, searchPattern),
        ilike(adminAuditLogs.actorEmail, searchPattern)
      )

      if (searchFilter) {
        filters.push(searchFilter)
      }
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined
    const [totalResult] = await db
      .select({ total: count() })
      .from(adminAuditLogs)
      .where(whereClause)
    const total = totalResult?.total ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const offset = (currentPage - 1) * pageSize

    const rows = await db
      .select()
      .from(adminAuditLogs)
      .where(whereClause)
      .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
      .limit(pageSize)
      .offset(offset)

    return NextResponse.json({
      items: rows,
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
    })
  } catch (error) {
    console.error("Error fetching admin activity:", error)
    return NextResponse.json(
      { error: "Error al obtener actividad administrativa" },
      { status: 500 }
    )
  }
}
