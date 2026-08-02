import { Prisma } from "@/generated/prisma/client";

// Prisma 7 + the pg driver adapter does NOT put the violated column names in
// a top-level `meta.target` the way classic Prisma did — verified directly
// against a real P2002 error, not assumed. The field list actually lives at
// meta.driverAdapterError.cause.constraint.fields. `meta` is typed as
// Record<string, unknown> (Prisma gives no stronger contract here), so this
// walk is defensive at every level rather than cast through.
function getUniqueConstraintFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return [];

  const driverAdapterError = (meta as Record<string, unknown>).driverAdapterError;
  if (!driverAdapterError || typeof driverAdapterError !== "object") return [];

  const cause = (driverAdapterError as Record<string, unknown>).cause;
  if (!cause || typeof cause !== "object") return [];

  const constraint = (cause as Record<string, unknown>).constraint;
  if (!constraint || typeof constraint !== "object") return [];

  const fields = (constraint as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return [];

  return fields.filter((field): field is string => typeof field === "string");
}

// A catch-all `catch (e)` would treat a genuine database outage as a
// collision and retry/misreport through it. Collision handling only applies
// to a P2002 on the exact field named — any other error (or a P2002 on a
// different constraint) must fail immediately.
function isUniqueConstraintViolationOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  return getUniqueConstraintFields(error).includes(field);
}

export function isSlugCollision(error: unknown): boolean {
  return isUniqueConstraintViolationOn(error, "slug");
}

export function isHostnameCollision(error: unknown): boolean {
  return isUniqueConstraintViolationOn(error, "hostname");
}
