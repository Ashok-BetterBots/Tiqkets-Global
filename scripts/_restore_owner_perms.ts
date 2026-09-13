import { ALL_PERMISSION_KEYS } from "../shared/permissions";
import { db } from "../server/db";
import { rolePermissions } from "../shared/schema";
const OWNER_ROLE_ID = "2132006f-8e83-4a6b-875f-31dd57498cc8";
async function main() {
  const rows = ALL_PERMISSION_KEYS.map((k) => ({ roleId: OWNER_ROLE_ID, permissionKey: k }));
  await db.insert(rolePermissions).values(rows);
  console.log(`Inserted ${rows.length} permissions for owner role.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
