import mysql from "mysql2/promise";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

// Parse MySQL connection string
function parseConnectionString(url) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error("Invalid DATABASE_URL format");

  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  };
}

// Generate random password
function generatePassword() {
  return crypto.randomBytes(12).toString("hex");
}

// Generate unique openId
function generateOpenId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

async function initializeData() {
  const config = parseConnectionString(DATABASE_URL);
  const connection = await mysql.createConnection(config);

  try {
    console.log("🚀 Starting data initialization...\n");

    // Create admin user
    const adminOpenId = generateOpenId("admin");
    const adminPassword = generatePassword();

    console.log("📝 Creating Admin User:");
    console.log(`  OpenID: ${adminOpenId}`);
    console.log(`  Password: ${adminPassword}\n`);

    await connection.execute(
      "INSERT INTO users (openId, name, email, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
      [adminOpenId, "Admin User", "admin@arab-annotators.local", "admin", true]
    );

    // Create 20 Tasker users
    const taskerPasswords = [];
    console.log("👥 Creating 20 Tasker Users:");

    for (let i = 1; i <= 20; i++) {
      const openId = generateOpenId(`tasker-${i}`);
      const password = generatePassword();
      taskerPasswords.push({ id: i, openId, password });

      await connection.execute(
        "INSERT INTO users (openId, name, email, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
        [openId, `Tasker ${i}`, `tasker${i}@arab-annotators.local`, "tasker", true]
      );

      if (i % 5 === 0) {
        console.log(`  ✓ Created ${i}/20 taskers`);
      }
    }
    console.log("  ✓ All 20 taskers created\n");

    // Create 10 QA users
    const qaPasswords = [];
    console.log("🔍 Creating 10 QA Users:");

    for (let i = 1; i <= 10; i++) {
      const openId = generateOpenId(`qa-${i}`);
      const password = generatePassword();
      qaPasswords.push({ id: i, openId, password });

      await connection.execute(
        "INSERT INTO users (openId, name, email, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
        [openId, `QA Reviewer ${i}`, `qa${i}@arab-annotators.local`, "qa", true]
      );

      if (i % 5 === 0) {
        console.log(`  ✓ Created ${i}/10 QA reviewers`);
      }
    }
    console.log("  ✓ All 10 QA reviewers created\n");

    // Create sample project
    console.log("📋 Creating Sample Project:");
    const adminUserId = (
      await connection.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    )[0][0].id;

    await connection.execute(
      "INSERT INTO projects (name, description, labelStudioProjectId, totalItems, completedItems, reviewedItems, status, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
      [
        "تصنيف الجمل السعودية",
        "مشروع تصنيف 40,000 جملة سعودية لكشف السنية",
        1,
        40000,
        0,
        0,
        "active",
        adminUserId,
      ]
    );

    console.log("  ✓ Project created\n");

    // Generate credentials file
    const credentials = {
      admin: {
        openId: adminOpenId,
        password: adminPassword,
        email: "admin@arab-annotators.local",
      },
      taskers: taskerPasswords.map((t) => ({
        id: t.id,
        openId: t.openId,
        password: t.password,
        email: `tasker${t.id}@arab-annotators.local`,
      })),
      qaReviewers: qaPasswords.map((q) => ({
        id: q.id,
        openId: q.openId,
        password: q.password,
        email: `qa${q.id}@arab-annotators.local`,
      })),
    };

    console.log("✅ Data initialization completed successfully!\n");
    console.log("📌 Credentials Summary:");
    console.log(JSON.stringify(credentials, null, 2));

    // Save to file
    const fs = await import("fs");
    fs.writeFileSync(
      "/home/ubuntu/arab-annotators-platform/credentials.json",
      JSON.stringify(credentials, null, 2)
    );
    console.log("\n💾 Credentials saved to credentials.json");

  } catch (error) {
    console.error("❌ Error during initialization:", error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

initializeData();
