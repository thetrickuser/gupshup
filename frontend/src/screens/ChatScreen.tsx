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
  
  // Typing state for input controls
  const [userId, setUserId] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  
  // Network locking state to prevent keystroke re-connections
  const [activeConnectedUser, setActiveConnectedUser] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        console.log('ChatScreen: Starting DB initialization...');
        const database = await initDb();
        setDb(database);
        
        // Use a uniform placeholder secret key so different local nodes can decrypt each other's packets
        const sharedTestingKey = "super-secret-shared-key-123";
        setEncryptionKey(sharedTestingKey);
        console.log('ChatScreen: Shared testing encryption key locked in');
        
        await loadMessages(database, sharedTestingKey);
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

  // Socket management effect - depends ONLY on activeConnectedUser, not userId typing events
  useEffect(() => {
    if (!db || !encryptionKey || !activeConnectedUser) return;

    const manifestDebuggerHost = Constants.expoConfig?.hostUri; 
    const hostIp = manifestDebuggerHost ? manifestDebuggerHost.split(':')[0] : '192.168.1.50'; 

    const isEmulator = hostIp.includes('10.0.2.2') || hostIp.includes('127.0.0.1') || hostIp.includes('localhost');
    const resolvedHost = isEmulator ? '10.0.2.2' : hostIp;

    const socketUrl = `ws://${resolvedHost}:8080/ws?user=${encodeURIComponent(activeConnectedUser)}`;
    console.log('Initiating connection to:', socketUrl);
    
    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket successfully connected to', socketUrl);
      setConnected(true);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      setActiveConnectedUser(null); // Reset lock state on close
    };

    socket.onerror = (event) => {
      console.warn('WebSocket error', event);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = typeof event.data === 'string' ? event.data : '';
        const node = JSON.parse(payload) as { type?: string; id?: string; from?: string; to?: string; cipher?: string };
        const type = node.type?.toUpperCase() ?? 'MSG';

        if (type === 'ACK') return;

        if (type === 'MSG' && node.cipher && node.id) {
          console.log("RAW INBOUND CIPHER:", node.cipher);
          const decrypted = decryptPayload(node.cipher, encryptionKey);
          console.log("DECRYPTED RESULT TO RENDER:", decrypted);

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
  }, [db, encryptionKey, sessionKey, activeConnectedUser]);

  const handleConnectToggle = () => {
    if (connected) {
      wsRef.current?.close();
    } else {
      if (!userId.trim()) return;
      setActiveConnectedUser(userId.trim());
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
    if (!text.trim() || !db || !encryptionKey || !activeConnectedUser || !recipient) return;
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
      from: activeConnectedUser,
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
                placeholder="Your username"
                autoCapitalize="none"
                editable={!connected}
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
          
          <Button 
            title={connected ? "Disconnect from Server" : "Connect to Server"} 
            onPress={handleConnectToggle} 
            color={connected ? "#ff3b30" : "#007aff"}
          />

          <Text style={styles.connectionText}>
            WebSocket Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
          
          <FlatList
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <View style={styles.msg}>
                <Text style={styles.messageText}>{item.payload}</Text>
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
  container: { flex: 1, padding: 12, marginTop: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#0000ff' },
  errorText: { fontSize: 16, color: '#ff0000', textAlign: 'center', marginBottom: 12 },
  msg: { padding: 10, borderBottomWidth: 1, borderColor: '#eee', marginVertical: 2 },
  messageText: { fontSize: 16, color: '#000' },
  timestamp: { fontSize: 11, color: '#999', marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, marginRight: 8, borderRadius: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metaItem: { flex: 1, marginRight: 8 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  metaInput: { borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 4 },
  connectionText: { marginVertical: 10, textAlign: 'center', fontWeight: '600' },
});