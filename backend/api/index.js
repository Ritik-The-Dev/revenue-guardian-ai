/**
 * Vercel function entry.
 *
 * Vercel discovers serverless functions from files in this directory, but the
 * backend is written in TypeScript with NodeNext resolution and is compiled by
 * `npm run vercel-build` before functions are bundled. So this file is a
 * deliberately trivial shim: it hands Vercel the already-compiled handler
 * instead of asking the platform to compile the TypeScript sources itself.
 *
 * Everything interesting lives in `src/vercel.ts` → `src/app.ts`.
 * `backend/vercel.json` rewrites every incoming path to this function, and
 * Fastify does the routing from there.
 */

export { default } from "../dist/vercel.js";
