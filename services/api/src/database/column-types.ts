/**
 * TypeORM column types that differ between Postgres (prod) and better-sqlite3 (tests/seed).
 */
const sqlite =
  process.env.DATABASE_DRIVER === 'sqlite' || process.env.NODE_ENV === 'test';

export const DATE_COL = (sqlite ? 'datetime' : 'timestamptz') as
  | 'datetime'
  | 'timestamptz';

export const UUID_COL = (sqlite ? 'varchar' : 'uuid') as 'varchar' | 'uuid';
