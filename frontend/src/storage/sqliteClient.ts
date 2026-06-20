import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('gupshup.db');

export function initDb() {
  db.transaction(tx => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_key TEXT, payload TEXT, created_at INTEGER);`
    );
  }, (err) => { console.warn('DB init error', err); });
}

export default db;
