import * as path from 'path';
import * as fs from 'fs';

const testDbPath = path.join(__dirname, '../../data/test.db');

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-key';
