import Database from 'better-sqlite3';
import { config } from '../config';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(config.database.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function runSql(sql: string, params: any[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

export function getOne<T = any>(sql: string, params: any[] = []): T | null {
  const row = getDb().prepare(sql).get(...params);
  return (row as T) || null;
}

export function getAll<T = any>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function withTransaction<T>(callback: () => T): T {
  const db = getDb();
  const execute = db.transaction((fn: () => T) => fn());
  return execute(callback);
}
