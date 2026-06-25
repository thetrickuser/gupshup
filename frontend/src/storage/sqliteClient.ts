import * as SQLite from 'expo-sqlite';
import { encryptPayload, decryptPayload } from '../crypto/encryptionUtils';

export interface Conversation {
  recipient_id: string;
  last_message: string;
  last_updated: number;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  payload: string;
  created_at: number;
}

// 1. Initialize and/or update the table layout to track specific endpoints
export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  try {
    console.log('initDb: Opening database...');
    // Keeps your database name unified
    const db = await SQLite.openDatabaseAsync('gupshup.db');
    console.log('initDb: Database opened successfully');

    console.log('initDb: Dropping old table...');
    await db.execAsync(`DROP TABLE IF EXISTS messages;`)
    
    console.log('initDb: Creating multi-conversation table schema...');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        session_key TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    console.log('initDb: Table created successfully');
    return db;
  } catch (err) {
    console.error('initDb: Error executing init sequence -', err);
    throw err;
  }
}

// 2. Encrypts payload and logs it to local storage targeting an explicit recipient path
export async function insertMessage(
  db: SQLite.SQLiteDatabase,
  id: string,
  sessionKey: string,
  senderId: string,
  recipientId: string,
  payload: string,
  timestamp: number,
  encryptionKey: string
): Promise<void> {
  const encrypted = encryptPayload(payload, encryptionKey);
  await db.runAsync(
    `INSERT INTO messages (id, session_key, sender_id, recipient_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?);`,
    [id, sessionKey, senderId, recipientId, encrypted, timestamp]
  );
}

// 3. Fetches history strictly shared between you and a specific user, decrypting on-the-fly
export async function getMessagesByConversation(
  db: SQLite.SQLiteDatabase,
  myId: string,
  recipientId: string,
  encryptionKey: string
): Promise<ChatMessage[]> {
  const rows = await db.getAllAsync(
    `SELECT id, sender_id, recipient_id, payload, created_at 
     FROM messages 
     WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
     ORDER BY created_at DESC;`,
    [myId, recipientId, recipientId, myId]
  ) as ChatMessage[];
  
  // Decrypt all data packets cleanly prior to layout generation rendering
  return rows.map(row => ({
    ...row,
    payload: decryptPayload(row.payload, encryptionKey)
  }));
}

// 4. Aggregates conversations for your Inbox list view cleanly and decrypts the latest snippet
export async function getActiveConversations(
  db: SQLite.SQLiteDatabase, 
  myId: string,
  encryptionKey: string
): Promise<Conversation[]> {
  const query = `
    SELECT 
      CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as recipient_id,
      payload as last_message,
      created_at as last_updated
    FROM messages m1
    INNER JOIN (
      SELECT 
        CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as conversational_partner,
        MAX(created_at) as max_created
      FROM messages
      WHERE sender_id = ? OR recipient_id = ?
      GROUP BY conversational_partner
    ) m2 ON (CASE WHEN m1.sender_id = ? THEN m1.recipient_id ELSE m1.sender_id END) = m2.conversational_partner 
        AND m1.created_at = m2.max_created
    ORDER BY m1.created_at DESC;
  `;
  
  interface RawConversationRow {
    recipient_id: string;
    last_message: string;
    last_updated: number;
  }

  const rows = await db.getAllAsync(query, [myId, myId, myId, myId, myId]) as RawConversationRow[];
  
  // Decrypt the single most recent snippet before pushing to the Inbox view
  return rows.map(row => ({
    recipient_id: row.recipient_id,
    last_message: decryptPayload(row.last_message, encryptionKey),
    last_updated: row.last_updated
  }));
}

// 5. Hard session cleaner
export async function deleteMessagesBySession(
  db: SQLite.SQLiteDatabase,
  sessionKey: string
): Promise<void> {
  await db.runAsync(`DELETE FROM messages WHERE session_key = ?;`, [sessionKey]);
  console.log(`Deleted messages for session: ${sessionKey}`);
}