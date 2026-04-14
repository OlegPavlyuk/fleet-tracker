import { eq } from 'drizzle-orm';
import type { AuthDeps } from './routes.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export function makeDbAuthDeps(): AuthDeps {
  return {
    async findUserByEmail(email) {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return user ?? null;
    },

    async createUser(id, email, passwordHash) {
      const [user] = await db.insert(users).values({ id, email, passwordHash }).returning();
      // insert().returning() always returns one row when values is a single object
      return user!;
    },
  };
}
