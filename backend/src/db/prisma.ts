/**
 * Prisma client — one per process, not one per module evaluation.
 *
 * On a serverless platform every cold start evaluates this module afresh, and a
 * naive `new PrismaClient()` opens a new connection pool each time. Under any
 * real traffic that exhausts Postgres' connection limit and the API starts
 * failing with "too many connections" — a failure that never appears locally.
 *
 * Caching on `globalThis` fixes two things at once: warm invocations reuse the
 * pool, and `tsx watch` stops leaking a pool on every reload during development.
 *
 * The connection string still matters. With Supabase, `DATABASE_URL` should be
 * the *pooled* connection (pgBouncer, port 6543, `?pgbouncer=true`) and
 * `DIRECT_URL` the direct one (port 5432) which `prisma migrate` needs because
 * pgBouncer cannot run DDL in transaction mode. See DEPLOYMENT.md.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __revenueGuardianPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__revenueGuardianPrisma ??
  new PrismaClient({
    // Errors and warnings only. Query logging would put customer contact
    // details and payment identifiers into the platform log.
    log: ["error", "warn"],
  });

globalForPrisma.__revenueGuardianPrisma = prisma;
