import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

/** Native D1 batches commit all statements together or roll them all back. */
export async function executeD1Batch(statements: SQL[]) {
  const globals = globalThis as typeof globalThis & {
    __CF_ENV__?: { DB?: any };
    __env__?: { DB?: any };
  };
  const binding = (globals.__CF_ENV__ || globals.__env__)?.DB;
  if (!binding)
    throw new Error('Native D1 binding is required for atomic video checkout');
  const dialect = new SQLiteSyncDialect();
  return binding.batch(
    statements.map((statement) => {
      const query = dialect.sqlToQuery(statement);
      return binding.prepare(query.sql).bind(...query.params);
    })
  ) as Promise<{ meta: { changes: number } }[]>;
}
