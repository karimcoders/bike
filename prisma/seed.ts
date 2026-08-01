import { db } from "../src/lib/db";
import { runSeed } from "../src/lib/seed";

// =====================================================================
// CLI entry point for database seeding.
// ---------------------------------------------------------------------
// Run with:  bun run prisma/seed.ts   or   npm run db:seed
//
// The actual seed logic lives in src/lib/seed.ts (exported as runSeed)
// so it can also be called from the /api/init API route (for Vercel
// deployments where there's no shell access to run scripts).
// =====================================================================

runSeed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
