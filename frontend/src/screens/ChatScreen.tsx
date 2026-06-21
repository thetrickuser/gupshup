import 'react-native-get-random-values';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import * as SQLite from 'expo-sqlite';
import { insertMessage, deleteMessagesBySession, getMessagesBySession, initDb } from '../storage/sqliteClient';
import { deriveSessionKey, encryptPayload, decryptPayload } from '../crypto/encryptionUtils';
import useAppStateCleanup from '../hooks/useAppStateCleanup';
import Constants from 'expo-constants';

interface ChatMessage {
  id: string;
  payload: string;
  created_at: number;
}

export default function ChatScreen() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionKey] = useState<string>(uuidv4());
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>(''); // Leave empty initially so it doesn't auto-connect
  const [recipient, setRecipient] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // Visual feedback state
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        console.log('ChatScreen: Starting DB initialization...');
        const database = await initDb();
        console.log('ChatScreen: DB initialized successfully');
        setDb(database);
        
        // Derive encryption key from session
        const key = deriveSessionKey(sessionKey, 'default-device');
        setEncryptionKey(key);
        console.log('ChatScreen: Encryption key derived');
        
        await loadMessages(database, key);
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

  const loadMessages = async (database: SQLite.SQLiteDatabase, key: string) => {
    try {
      const msgs = await getMessagesBySession(database, sessionKey, key);
      setMessages(msgs);
    } catch (err) {
      console.warn('Error loading messages:', err);
    }
  };

  // 2. Updated WebSocket Connection Logic
useEffect(() => {
    // Only connect if the database is ready, encryption is derived, AND the user explicitly provided an ID
    if (!db || !encryptionKey || !userId) return;

    // A bulletproof emulator check: Expo's hostUri contains "10.0.2.2" or "localhost" on virtual devices
    const manifestDebuggerHost = Constants.expoConfig?.hostUri; 
    const hostIp = manifestDebuggerHost ? manifestDebuggerHost.split(':')[0] : '192.168.1.50'; 

    const isEmulator = hostIp.includes('10.0.2.2') || hostIp.includes('127.0.0.1') || hostIp.includes('localhost');
    const resolvedHost = isEmulator ? '10.0.2.2' : hostIp;

    // Note: Your backend code expects "?user=", make sure it matches your backend query parameter mapping
    const socketUrl = `ws://${resolvedHost}:8080/ws?user=${encodeURIComponent(userId)}`;
    console.log('Attempting connection to:', socketUrl);
    
    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket successfully connected to', socketUrl);
      setConnected(true);
      setIsConnecting(false);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      setIsConnecting(false);
    };

    socket.onerror = (event) => {
      console.warn('WebSocket error', event);
      setIsConnecting(false);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = typeof event.data === 'string' ? event.data : '';
        const node = JSON.parse(payload) as { type?: string; id?: string; from?: string; to?: string; cipher?: string };
        const type = node.type?.toUpperCase() ?? 'MSG';

        if (type === 'ACK') return;

        if (type === 'MSG' && node.cipher && node.id) {
          const decrypted = decryptPayload(node.cipher, encryptionKey);
          const receivedMessage: ChatMessage = {
            id: node.id,
            payload: decrypted,
            created_at: Date.now(),
          };

          await insertMessage(db, receivedMessage.id, sessionKey, decrypted, receivedMessage.created_at, encryptionKey);
          setMessages(prev => [receivedMessage, ...prev]);

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ACK', id: receivedMessage.id }));
          }
        }
      } catch (err) {
        console.warn('Error processing incoming WebSocket message:', err);
      }
    };

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
      setConnected(false);
    };
}, [db, encryptionKey, sessionKey, userId]);

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
    if (!text.trim() || !db || !encryptionKey || !userId || !recipient) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not open. Cannot send message.');
      return;
    }

    const msgId = uuidv4();
    const timestamp = Date.now();
    const cipher = encryptPayload(text, encryptionKey);
    const outgoing = {
      type: 'MSG',
      id: msgId,
      from: userId,
      to: recipient,
      cipher,
    };

    try {
      wsRef.current.send(JSON.stringify(outgoing));
      await insertMessage(db, msgId, sessionKey, text, timestamp, encryptionKey);
      setMessages(prev => [{ id: msgId, payload: text, created_at: timestamp }, ...prev]);
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
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.label}>You</Text>
              <TextInput
                style={styles.metaInput}
                value={userId}
                onChangeText={setUserId}
                placeholder="Your user id"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>To</Text>
              <TextInput
                style={styles.metaInput}
                value={recipient}
                onChangeText={setRecipient}
                placeholder="Recipient id"
                autoCapitalize="none"
              />
            </View>
          </View>
          <Text style={styles.connectionText}>
            WebSocket: {connected ? 'connected' : 'disconnected'}
          </Text>
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
      <View style={styles.metaRow}>
  <View style={styles.metaItem}>
    <Text style={styles.label}>You</Text>
    <TextInput
      style={styles.metaInput}
      value={userId}
      onChangeText={setUserId}
      placeholder="Type your username (e.g. bob)"
      autoCapitalize="none"
      editable={!connected} // Lock it once connected
    />
  </View>
  <View style={styles.metaItem}>
    <Text style={styles.label}>To</Text>
    <TextInput
      style={styles.metaInput}
      value={recipient}
      onChangeText={setRecipient}
      placeholder="Recipient id"
      autoCapitalize="none"
    />
  </View>
</View>

<Text style={styles.connectionText}>
  WebSocket: {connected ? '🟢 Connected' : isConnecting ? '🟡 Connecting...' : '🔴 Disconnected'}
</Text>
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metaItem: { flex: 1, marginRight: 8 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  metaInput: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 4 },
  connectionText: { marginBottom: 10, color: '#333' },
});
