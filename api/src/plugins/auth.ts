import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { UnauthorizedError } from "../lib/errors.js";

const PUBLIC_PATHS = new Set(["/health", "/auth/login"]);

export default fp(async function authPlugin(app: FastifyInstance) {
  app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;
    if (request.method === "OPTIONS") return;

    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  });
});
