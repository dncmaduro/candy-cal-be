/**
 * Password Migration Script
 * 
 * This script migrates existing plain-text passwords to bcrypt hashed passwords.
 * 
 * IMPORTANT: Run this ONCE before deploying the bcrypt changes to production.
 * 
 * Usage:
 *   node temp-scripts/migrate-passwords.js
 * 
 * What it does:
 * 1. Connects to MongoDB
 * 2. Finds all users with plain-text passwords (passwords that don't start with $2b$)
 * 3. Hashes each password using bcrypt
 * 4. Updates the user record with the hashed password
 * 5. Logs the migration progress
 * 
 * Safety:
 * - Only processes passwords that don't look like bcrypt hashes
 * - Logs each migration for audit trail
 * - Can be run multiple times safely (idempotent)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const SALT_ROUNDS = 10;

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  roles: { type: [String], required: true, default: ['user'] },
  avatarUrl: { type: String, required: false }
});

const User = mongoose.model('users', UserSchema);

async function migratePasswords() {
  try {
    console.log('🔐 Starting password migration...\n');

    // Connect to MongoDB
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found in environment variables');
    }

    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(dbUrl, {
      dbName: 'data'
    });
    console.log('✅ Connected to MongoDB\n');

    // Find all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users in database\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        // Check if password is already hashed (bcrypt hashes start with $2b$)
        if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
          console.log(`⏭️  Skipping ${user.username} - already hashed`);
          skippedCount++;
          continue;
        }

        // Hash the plain-text password
        const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);

        // Update the user
        user.password = hashedPassword;
        await user.save();

        console.log(`✅ Migrated ${user.username}`);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Error migrating ${user.username}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped (already hashed): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total: ${users.length}`);

    if (migratedCount > 0) {
      console.log('\n⚠️  IMPORTANT: Users will need to use their existing passwords to login.');
      console.log('   The passwords are now securely hashed with bcrypt.');
    }

    console.log('\n✅ Password migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run migration
migratePasswords()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

