import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator,
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import { insertMessage, deleteMessagesBySession, getMessagesByConversation, initDb } from '../storage/sqliteClient';
import { deriveSessionKey, encryptPayload, decryptPayload } from '../crypto/encryptionUtils';
import useAppStateCleanup from '../hooks/useAppStateCleanup';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';

interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  payload: string;
  created_at: number;
  fromSelf?: boolean;
}

interface ChatScreenProps {
  currentUserId: string;
  targetRecipientId: string;
  onBackToInbox: () => void;
}

export default function ChatScreen({ currentUserId, targetRecipientId, onBackToInbox }: ChatScreenProps) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionKey] = useState<string>(Crypto.randomUUID());
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Immutably locked identity bindings coming straight from navigation contexts
  const [userId] = useState<string>(currentUserId);
  const [recipient] = useState<string>(targetRecipientId);
  
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
      // Pulls historical lines explicitly shared between you two
      const msgs = await getMessagesByConversation(database, userId, recipient, key);
      const formatted = msgs.map(m => ({ ...m, fromSelf: m.sender_id === userId }));
      setMessages(formatted);
    } catch (err) {
      console.warn('Error loading messages:', err);
    }
  };

  useEffect(() => {
    if (!db || !encryptionKey || !activeConnectedUser) return;

    const manifestDebuggerHost = Constants.expoConfig?.hostUri; 
    const hostIp = manifestDebuggerHost ? manifestDebuggerHost.split(':')[0] : '192.168.1.21'; 

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
      setActiveConnectedUser(null);
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

        if (type === 'MSG' && node.cipher && node.id && node.from) {
          console.log("RAW INBOUND CIPHER:", node.cipher);
          const decrypted = decryptPayload(node.cipher, encryptionKey);
          console.log("DECRYPTED RESULT TO RENDER:", decrypted);

          const receivedMessage: ChatMessage = {
            id: node.id,
            sender_id: node.from,
            recipient_id: userId,
            payload: decrypted,
            created_at: Date.now(),
            fromSelf: false
          };

          // Cache payload encrypted into local storage
          await insertMessage(db, receivedMessage.id, sessionKey, receivedMessage.sender_id, receivedMessage.recipient_id, decrypted, receivedMessage.created_at, encryptionKey);
          
          // Only push the live string bubble to viewport stream if it matches your active conversation window
          if (node.from === recipient) {
            setMessages(prev => [receivedMessage, ...prev]);
          }

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
  }, [db, encryptionKey, sessionKey, activeConnectedUser, recipient]);

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

    const msgId = Crypto.randomUUID();
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
      await insertMessage(db, msgId, sessionKey, activeConnectedUser, recipient, text, timestamp, encryptionKey);
      setMessages(prev => [{ id: msgId, sender_id: activeConnectedUser, recipient_id: recipient, payload: text, created_at: timestamp, fromSelf: true }, ...prev]);
      setText('');
    } catch (err) {
      console.warn('Error sending message:', err);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Initializing secure channel...</Text>
          </View>
        )}
        {error && (
          <View style={styles.center}>
            <Text style={styles.errorText}>Initialization Error: {error}</Text>
          </View>
        )}
        {!loading && !error && (
          <>
            {/* Top Identity & Connectivity Section */}
            <View style={styles.headerCard}>
              <TouchableOpacity onPress={onBackToInbox} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Back to Chats</Text>
              </TouchableOpacity>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.label}>YOU</Text>
                  <TextInput
                    style={[styles.metaInput, styles.metaInputDisabled]}
                    value={userId}
                    placeholder="Your ID"
                    editable={false}
                  />
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.label}>CHAT WITH</Text>
                  <TextInput
                    style={[styles.metaInput, styles.metaInputDisabled]}
                    value={recipient}
                    placeholder="Recipient ID"
                    editable={false}
                  />
                </View>
              </View>
              
              <View style={styles.statusActionRow}>
                <View style={[styles.statusBadge, connected ? styles.badgeConnected : styles.badgeDisconnected]}>
                  <View style={[styles.statusDot, connected ? styles.dotConnected : styles.dotDisconnected]} />
                  <Text style={[styles.statusText, connected ? styles.textConnected : styles.textDisconnected]}>
                    {connected ? 'Securely Connected' : 'Offline'}
                  </Text>
                </View>

                <TouchableOpacity 
                  style={[styles.connectButton, connected ? styles.btnDisconnect : styles.btnConnect]} 
                  onPress={handleConnectToggle}
                >
                  <Text style={styles.connectButtonText}>
                    {connected ? 'Disconnect' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Message Thread Stream */}
            <FlatList
              data={messages}
              keyExtractor={m => m.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelf = item.fromSelf !== false;
                return (
                  <View style={[styles.bubbleWrapper, isSelf ? styles.wrapperSelf : styles.wrapperPartner]}>
                    <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubblePartner]}>
                      <Text style={[styles.messageText, isSelf ? styles.textSelf : styles.textPartner]}>
                        {item.payload}
                      </Text>
                      <Text style={[styles.timestamp, isSelf ? styles.timeSelf : styles.timePartner]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              }}
              inverted
            />

            {/* Bottom Message Input Panel */}
            <View style={styles.inputContainer}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder={connected ? "Type a message..." : "Connect to server to chat"}
                  placeholderTextColor="#999"
                  editable={connected}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.sendButton, (!text.trim() || !connected) && styles.sendButtonDisabled]} 
                  onPress={send}
                  disabled={!text.trim() || !connected}
                >
                  <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.privacyBanner}>🛡️ Zero-Retention Mode Active • Sessions fade on exit</Text>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#666', fontWeight: '500' },
  errorText: { fontSize: 15, color: '#FF3B30', textAlign: 'center', padding: 24 },
  backButton: { marginBottom: 14, paddingVertical: 4 },
  backButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metaItem: { flex: 1, marginRight: 10 },
  label: { fontSize: 10, fontWeight: '700', color: '#8E8E93', marginBottom: 6, letterSpacing: 1 },
  metaInput: { backgroundColor: '#F1F3F5', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, fontSize: 15, color: '#212529', fontWeight: '500' },
  metaInputDisabled: { color: '#6c757d', backgroundColor: '#E9ECEF' },
  statusActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  badgeConnected: { backgroundColor: '#E3FCEF' },
  badgeDisconnected: { backgroundColor: '#F4F5F7' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotConnected: { backgroundColor: '#36B37E' },
  dotDisconnected: { backgroundColor: '#8E8E93' },
  statusText: { fontSize: 13, fontWeight: '600' },
  textConnected: { color: '#006644' },
  textDisconnected: { color: '#6B778C' },
  connectButton: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8 },
  btnConnect: { backgroundColor: '#007AFF' },
  btnDisconnect: { backgroundColor: '#FF3B30' },
  connectButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12 },
  bubbleWrapper: { flexDirection: 'row', marginVertical: 4, width: '100%' },
  wrapperSelf: { justifyContent: 'flex-end' },
  wrapperPartner: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 },
  bubbleSelf: { backgroundColor: '#007AFF', borderTopRightRadius: 2 },
  bubblePartner: { backgroundColor: '#E5E5EA', borderTopLeftRadius: 2 },
  messageText: { fontSize: 16, lineHeight: 20 },
  textSelf: { color: '#FFFFFF' },
  textPartner: { color: '#000000' },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  timeSelf: { color: 'rgba(255, 255, 255, 0.7)' },
  timePartner: { color: '#8E8E93' },
  inputContainer: { backgroundColor: '#FFFFFF', padding: 12, borderTopWidth: 1, borderColor: '#E9ECEF' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#F1F3F5', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, marginRight: 10, borderRadius: 20, fontSize: 16, color: '#212529', maxHeight: 100 },
  sendButton: { backgroundColor: '#007AFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#E9ECEF' },
  sendButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  privacyBanner: { fontSize: 11, color: '#8E8E93', textAlign: 'center', marginTop: 8, fontWeight: '500' }
});