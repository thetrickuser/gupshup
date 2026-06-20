import * as SQLite from 'expo-sqlite';
import { encryptPayload, decryptPayload } from '../crypto/encryptionUtils';

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  try {
    console.log('initDb: Opening database...');
    const db = await SQLite.openDatabaseAsync('gupshup.db');
    console.log('initDb: Database opened successfully');
    
    console.log('initDb: Creating table...');
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_key TEXT, payload TEXT, created_at INTEGER);`
    );
    console.log('initDb: Table created successfully');
    return db;
  } catch (err) {
    console.error('initDb: Error -', err);
    throw err;
  }
}

export async function insertMessage(
  db: SQLite.SQLiteDatabase,
  id: string,
  sessionKey: string,
  payload: string,
  timestamp: number,
  encryptionKey: string
): Promise<void> {
  const encrypted = encryptPayload(payload, encryptionKey);
  await db.runAsync(
    `INSERT INTO messages (id, session_key, payload, created_at) VALUES (?, ?, ?, ?);`,
    [id, sessionKey, encrypted, timestamp]
  );
}

export async function getMessagesBySession(
  db: SQLite.SQLiteDatabase,
  sessionKey: string,
  encryptionKey: string
): Promise<Array<{ id: string; payload: string; created_at: number }>> {
  const rows = await db.getAllAsync(
    `SELECT id, payload, created_at FROM messages WHERE session_key = ? ORDER BY created_at DESC;`,
    [sessionKey]
  ) as Array<{ id: string; payload: string; created_at: number }>;
  
  // Decrypt all payloads before returning
  const messages = rows.map(row => ({
    id: row.id,
    payload: decryptPayload(row.payload, encryptionKey),
    created_at: row.created_at,
  }));
  
  return messages;
}

export async function deleteMessagesBySession(
  db: SQLite.SQLiteDatabase,
  sessionKey: string
): Promise<void> {
  await db.runAsync(`DELETE FROM messages WHERE session_key = ?;`, [sessionKey]);
  console.log(`Deleted messages for session: ${sessionKey}`);
}
