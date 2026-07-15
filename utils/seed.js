/**
 * Run with: npm run seed
 * Creates:
 *  - a demo organization + org admin (SEED_ADMIN_*) so you can log in to the app
 *  - a platform owner account (PLATFORM_OWNER_*) with no organization, for the Super Admin panel
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, getClient } = require('../config/db');
const UserModel = require('../models/userModel');
const OrganizationModel = require('../models/organizationModel');
const OrganizationSettingsModel = require('../models/organizationSettingsModel');
const { generateUniqueSlug } = require('./slugify');

async function seedDemoOrganization() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@maxmatrix.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const name = process.env.SEED_ADMIN_NAME || 'Admin User';
  const companyName = process.env.SEED_COMPANY_NAME || 'My Company Pvt Ltd';

  const existing = await UserModel.findByEmail(email);
  if (existing) {
    console.log(`ℹ️  Demo admin already exists: ${email}`);
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const slug = await generateUniqueSlug(companyName);
    const organization = await OrganizationModel.create(client, {
      name: companyName,
      slug,
      gstin: '29ABCDE1234F1Z5',
      email,
      country: 'India',
    });

    await OrganizationSettingsModel.create(client, {
      organizationId: organization.id,
      companyName,
      gstin: '29ABCDE1234F1Z5',
      country: 'India',
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, organization_id)
       VALUES ($1,$2,$3,'admin',$4)
       RETURNING id, email`,
      [name, email, passwordHash, organization.id]
    );

    await client.query('COMMIT');
    console.log(`✅ Demo organization created: ${companyName} (${organization.slug})`);
    console.log(`✅ Demo admin created: ${userRes.rows[0].email} / password: ${password}`);
    console.log('⚠️  Please change this password immediately after first login.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function seedPlatformOwner() {
  const email = process.env.PLATFORM_OWNER_EMAIL || 'owner@maxmatrix.com';
  const password = process.env.PLATFORM_OWNER_PASSWORD || 'Owner@123';
  const name = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';

  const existing = await UserModel.findByEmail(email);
  if (existing) {
    console.log(`ℹ️  Platform owner already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({ name, email, passwordHash, role: 'platform_owner', organizationId: null });
  console.log(`✅ Platform owner created: ${user.email} / password: ${password}`);
  console.log('⚠️  Please change this password immediately after first login.');
}

async function seed() {
  try {
    await seedDemoOrganization();
    await seedPlatformOwner();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
