/**
 * init-data.mjs
 * Run this script ONCE after first deploy to set up initial data.
 * Usage: node scripts/init-data.mjs
 * 
 * Alternatively, set ADMIN_EMAIL + ADMIN_PASSWORD env vars and the server
 * will auto-create the admin account on startup without needing this script.
 */

import pg from "pg";
import crypto from "crypto";
import { promisify } from "util";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}

function generatePassword(length = 10) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("✅ Connected to PostgreSQL\n");

  try {
    // Ensure passwordHash column exists
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" text`);

    const adminEmail = process.env.ADMIN_EMAIL || "admin@annotators.local";
    const adminPassword = process.env.ADMIN_PASSWORD || generatePassword(12);
    const adminName = process.env.ADMIN_NAME || "Admin";

    // Check if admin exists
    const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [adminEmail.toLowerCase()]);

    if (existing.rows.length > 0) {
      // Update to ensure admin role and set password
      const hash = await hashPassword(adminPassword);
      await client.query(
        `UPDATE users SET role = 'admin', "isActive" = true, "passwordHash" = $1, "loginMethod" = 'local' WHERE LOWER(email) = $2`,
        [hash, adminEmail.toLowerCase()]
      );
      console.log(`✅ Admin account updated: ${adminEmail}`);
    } else {
      // Create new admin
      const openId = `local_admin_${crypto.randomUUID()}`;
      const hash = await hashPassword(adminPassword);
      await client.query(
        `INSERT INTO users ("openId", name, email, role, "loginMethod", "passwordHash", "isActive", "createdAt", "updatedAt", "lastSignedIn")
         VALUES ($1, $2, $3, 'admin', 'local', $4, true, NOW(), NOW(), NOW())`,
        [openId, adminName, adminEmail.toLowerCase(), hash]
      );
      console.log(`✅ Admin account created: ${adminEmail}`);
    }

    console.log(`\n📋 Login credentials:`);
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`\n⚠️  Save these credentials! The password is not stored in plain text.\n`);

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
