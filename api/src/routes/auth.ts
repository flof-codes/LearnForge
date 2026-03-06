import { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { UnauthorizedError } from "../lib/errors.js";
import { ValidationError } from "../lib/errors.js";

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { password: string } }>("/auth/login", async (request, _reply) => {
    const { password } = request.body ?? {};
    if (!password) throw new ValidationError("password is required");

    const expected = Buffer.from(config.authPassword);
    const received = Buffer.from(password);

    const valid =
      expected.length === received.length &&
      timingSafeEqual(expected, received);

    if (!valid) {
      throw new UnauthorizedError("Invalid password");
    }

    const token = app.jwt.sign({ sub: "owner" });
    return { token };
  });
}
