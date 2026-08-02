import { db } from '@/lib/db';

async function main() {
  console.log('=== Users ===');
  const users = await db.user.findMany();
  console.log(`Count: ${users.length}`);
  for (const u of users) {
    console.log(`- ${u.username} | ${u.name} | role=${u.role} | passLen=${u.password.length}`);
  }

  console.log('\n=== Categories ===');
  const cats = await db.category.findMany();
  console.log(`Count: ${cats.length}`);

  console.log('\n=== Locations ===');
  const locs = await db.location.findMany();
  console.log(`Count: ${locs.length}`);

  console.log('\n=== Products ===');
  const prods = await db.product.findMany();
  console.log(`Count: ${prods.length}`);

  console.log('\n=== Settings ===');
  const settings = await db.settings.findFirst();
  console.log('Settings:', settings ? 'YES' : 'NO');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); }).finally(() => db.$disconnect());
