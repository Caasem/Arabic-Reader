import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Statement } from './db';

/** Node's built-in SQLite behind the same interface D1 implements. For tests and a local run, never the Worker. */
export function openNodeDb(path = ':memory:'): Db & { close(): void } {
  const sqlite = new DatabaseSync(path);
  const bind = (params?: unknown[]) => (params ?? []) as SQLInputValue[];
  return {
    async run(sql, params) {
      sqlite.prepare(sql).run(...bind(params));
    },
    async all<T>(sql: string, params?: unknown[]) {
      return sqlite.prepare(sql).all(...bind(params)) as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      return sqlite.prepare(sql).get(...bind(params)) as T | undefined;
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        for (const s of statements) sqlite.prepare(s.sql).run(...bind(s.params));
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      sqlite.close();
    },
  };
}
