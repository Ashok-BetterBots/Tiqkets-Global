import { db } from "./db";
import { branches, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createHomeReportCalendar, resolveOrganizationTimezone } from "@shared/home-report-calendar";

export async function getOrganizationCalendar(organizationId: string) {
  const [organization] = await db.select({ timezone: organizations.timezone })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return createHomeReportCalendar(resolveOrganizationTimezone(organization?.timezone));
}

export async function getBranchOrganizationCalendar(branchId: string) {
  const [organization] = await db.select({ timezone: organizations.timezone })
    .from(branches).leftJoin(organizations, eq(branches.organizationId, organizations.id))
    .where(eq(branches.id, branchId)).limit(1);
  return createHomeReportCalendar(resolveOrganizationTimezone(organization?.timezone));
}