import 'react-native-get-random-values';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import * as SQLite from 'expo-sqlite';
import { insertMessage, deleteMessagesBySession, getMessagesBySession, initDb } from '../storage/sqliteClient';
import useAppStateCleanup from '../hooks/useAppStateCleanup';

interface ChatMessage {
  id: string;
  payload: string;
  created_at: number;
}

export default function ChatScreen() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionKey] = useState<string>(uuidv4());
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        console.log('ChatScreen: Starting DB initialization...');
        const database = await initDb();
        console.log('ChatScreen: DB initialized successfully');
        setDb(database);
        await loadMessages(database);
        setLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Error initializing DB:', errorMsg);
        setError(errorMsg);
        setLoading(false);
      }
    };
    setup();
  }, [sessionKey]);

  const loadMessages = async (database: SQLite.SQLiteDatabase) => {
    try {
      const msgs = await getMessagesBySession(database, sessionKey);
      setMessages(msgs);
    } catch (err) {
      console.warn('Error loading messages:', err);
    }
  };

  const handleCleanup = useCallback(async () => {
    if (!db) return;
    try {
      await deleteMessagesBySession(db, sessionKey);
      setMessages([]);
      console.log('Session cleaned up on app background');
    } catch (err) {
      console.warn('Error during cleanup:', err);
    }
  }, [db, sessionKey]);

  useAppStateCleanup(handleCleanup);

  async function send() {
    if (!text.trim() || !db) return;
    const msgId = uuidv4();
    const timestamp = Date.now();
    const msg: ChatMessage = { id: msgId, payload: text, created_at: timestamp };

    try {
      await insertMessage(db, msgId, sessionKey, text, timestamp);
      setMessages(prev => [msg, ...prev]);
      setText('');
    } catch (err) {
      console.warn('Error sending message:', err);
    }
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Initializing database...</Text>
        </View>
      )}
      {error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Button title="Retry" onPress={() => window.location.reload?.()} />
        </View>
      )}
      {!loading && !error && (
        <>
          <FlatList
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <View style={styles.msg}>
                <Text>{item.payload}</Text>
                <Text style={styles.timestamp}>{new Date(item.created_at).toLocaleTimeString()}</Text>
              </View>
            )}
            inverted
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message"
            />
            <Button title="Send" onPress={send} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#0000ff' },
  errorText: { fontSize: 16, color: '#ff0000', textAlign: 'center', marginBottom: 12 },
  msg: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  timestamp: { fontSize: 12, color: '#999', marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, marginRight: 8, borderRadius: 4 },
});
