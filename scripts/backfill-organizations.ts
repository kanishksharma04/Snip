import { db } from "../src/lib/db";
import { provisionPersonalOrganization } from "../src/lib/organizations";

// One-off, run manually via `tsx --env-file=.env.local scripts/backfill-organizations.ts`
// after migration A (the additive one) and before migration B (the one that
// makes Domain/ApiKey.organizationId required). Every user created *after*
// this feature shipped gets a personal org automatically via the wrapped
// adapter in src/lib/auth.ts — this script is what gives the same result to
// every user who already existed before organizations did.
//
// Only Link.organizationId is backfilled here — it's the one of the three
// that stays permanently nullable (anonymous demo links have no
// organization, mirroring their already-nullable userId). Domain/ApiKey
// were briefly nullable too during this same migration window, but by the
// time migration B has run (required from then on), every real row already
// went through this script or through the wrapped adapter — there is
// nothing left for this script to backfill on those two models, and their
// generated Prisma types no longer even permit `organizationId: null` as a
// where-clause value.
//
// Idempotent: only touches users with no activeOrganizationId yet, so
// re-running it after a partial failure just picks up where it left off
// instead of creating duplicate organizations.
async function main() {
  const users = await db.user.findMany({
    where: { activeOrganizationId: null },
    select: { id: true, name: true },
  });

  console.log(`Found ${users.length} user(s) with no organization.`);

  for (const user of users) {
    const { organizationId } = await provisionPersonalOrganization(user.id, user.name);

    const links = await db.link.updateMany({
      where: { userId: user.id, organizationId: null },
      data: { organizationId },
    });

    console.log(`User ${user.id}: organization ${organizationId} — ${links.count} link(s) backfilled.`);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
