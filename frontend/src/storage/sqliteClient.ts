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

    // await db.execAsync(`DROP TABLE IF EXISTS messages;`); // Optional: Clear existing table for testing

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
    `INSERT OR IGNORE INTO messages (id, session_key, sender_id, recipient_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?);`,
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
    SELECT id, sender_id, recipient_id, payload, created_at
    FROM messages
    WHERE sender_id = ? OR recipient_id = ?
    ORDER BY created_at DESC, id DESC;
  `;
  
  interface RawConversationRow {
    id: string;
    sender_id: string;
    recipient_id: string;
    payload: string;
    created_at: number;
  }

  const rows = await db.getAllAsync(query, [myId, myId]) as RawConversationRow[];
  const latestByPartner = new Map<string, RawConversationRow>();

  rows.forEach((row) => {
    const partnerId = row.sender_id === myId ? row.recipient_id : row.sender_id;
    const existing = latestByPartner.get(partnerId);

    if (!existing) {
      latestByPartner.set(partnerId, row);
      return;
    }

    if (
      row.created_at > existing.created_at ||
      (row.created_at === existing.created_at && row.id > existing.id)
    ) {
      latestByPartner.set(partnerId, row);
    }
  });

  return Array.from(latestByPartner.values())
    .sort((a, b) => b.created_at - a.created_at)
    .map((row) => ({
      recipient_id: row.sender_id === myId ? row.recipient_id : row.sender_id,
      last_message: decryptPayload(row.payload, encryptionKey),
      last_updated: row.created_at
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