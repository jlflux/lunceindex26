/**
 * Generates the value for ADMIN_PASSWORD_HASH.
 * Usage: npm run hash-password -- "your password here"
 */
import { hashPassword } from "../src/lib/auth";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use at least 10 characters.");
  process.exit(1);
}

hashPassword(password).then((hash) => {
  console.log("\nAdd these to .env.local (and to Vercel's env vars):\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(
    `ADMIN_SESSION_SECRET=${Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url")}\n`,
  );
});
