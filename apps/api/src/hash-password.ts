import bcrypt from 'bcryptjs';

/**
 * Utility: generate a bcrypt hash for ADMIN_PASSWORD_HASH.
 * Usage: npm run -w @ils/api hash-password -- 'your-password'
 */
const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run -w @ils/api hash-password -- 'your-password'");
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
