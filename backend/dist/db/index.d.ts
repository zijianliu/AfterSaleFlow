import Database from 'better-sqlite3';
export declare function getDb(): Database.Database;
export declare function runSql(sql: string, params?: any[]): Database.RunResult;
export declare function getOne<T = any>(sql: string, params?: any[]): T | null;
export declare function getAll<T = any>(sql: string, params?: any[]): T[];
export declare function withTransaction<T>(callback: () => T): T;
