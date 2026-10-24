import { sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { envConfigs } from '@/config';

let sqliteReady: Promise<unknown> | undefined;

/** SQLite can reject a simultaneous writer immediately; retry rolled-back DB work. */
export async function withWriteTransaction<T>(
  run: (tx: any) => Promise<T>
): Promise<T> {
  if (
    envConfigs.database_provider === 'sqlite' &&
    envConfigs.database_url.startsWith('file:')
  ) {
    sqliteReady ??= Promise.resolve(
      db().run(sql`PRAGMA journal_mode = WAL`)
    ).catch((error) => {
      sqliteReady = undefined;
      throw error;
    });
    await sqliteReady;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await db().transaction(run);
    } catch (error: any) {
      const code = error?.code || error?.cause?.code;
      if (attempt >= 4 || !['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(code))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** attempt));
    }
  }
}
