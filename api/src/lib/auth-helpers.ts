import { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users } from "@learnforge/core";
import { db } from "../db/connection.js";
import { ForbiddenError, UnauthorizedError } from "./errors.js";

export function getUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}

export async function requireAdmin(request: FastifyRequest): Promise<string> {
  const userId = getUserId(request);
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new UnauthorizedError("User not found");
  if (user.role !== "admin") throw new ForbiddenError("Admin access required");
  return userId;
}
