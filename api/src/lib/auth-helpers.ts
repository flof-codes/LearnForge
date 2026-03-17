import { FastifyRequest } from "fastify";

export function getUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}
