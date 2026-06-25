import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import Constants from 'expo-constants';
import { initDb, insertMessage, deleteMessagesBySession } from '../storage/sqliteClient';
import { decryptPayload } from '../crypto/encryptionUtils';
import * as SQLite from 'expo-sqlite';

interface ChatContextType {
  connected: boolean;
  userId: string | null;
  activeRecipientId: string | null;
  setActiveRecipientId: (id: string | null) => void;
  connectSocket: () => void;
  explicitDisconnectAndWipe: (sessionKey: string) => Promise<void>;
  db: SQLite.SQLiteDatabase | null; 
  wsRef: React.RefObject<WebSocket | null>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children, currentHardwareId }: { children: React.ReactNode, currentHardwareId: string }) {
  const [connected, setConnected] = useState(false);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const encryptionKey = "super-secret-shared-key-123"; // Your shared key testing hook

  // 1. Initialize SQLite Database globally once on boot
  useEffect(() => {
    initDb().then(setDb).catch(err => console.error("Context DB Init Error:", err));
  }, []);

  // 2. Establish persistent, always-open WebSocket infrastructure
  const connectSocket = useCallback(() => {
    if (!currentHardwareId || wsRef.current) return;

    const manifestDebuggerHost = Constants.expoConfig?.hostUri; 
    const hostIp = manifestDebuggerHost ? manifestDebuggerHost.split(':')[0] : '192.168.1.21'; 
    const isEmulator = hostIp.includes('10.0.2.2') || hostIp.includes('127.0.0.1') || hostIp.includes('localhost');
    const resolvedHost = isEmulator ? '10.0.2.2' : hostIp;

    // Point to your local IP or your production domain string cleanly
    const socketUrl = `ws://${resolvedHost}:8080/ws?user=${encodeURIComponent(currentHardwareId)}`;
    console.log('[Global Context] Connecting to:', socketUrl);

    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('[Global Context] Connected successfully!');
      setConnected(true);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = typeof event.data === 'string' ? event.data : '';
        const node = JSON.parse(payload);
        
        if (node.type?.toUpperCase() === 'MSG' && node.cipher && node.id && node.from) {
          const decrypted = decryptPayload(node.cipher, encryptionKey);
          
          if (db) {
            // Write incoming message straight to DB cache immediately, even if the user is looking at Inbox screen!
            // Using a dummy session key or a conversation-derived hash to organize threads
            const backgroundSessionKey = `session_${node.from}`;
            await insertMessage(db, node.id, backgroundSessionKey, node.from, currentHardwareId, decrypted, Date.now(), encryptionKey);
            console.log(`[Global Context] Background message cached from ${node.from}`);
          }

          // Send back ACK network package confirmation
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ACK', id: node.id }));
          }
        }
      } catch (err) {
        console.warn('[Global Context] Error handling background message stream:', err);
      }
    };

    socket.onclose = () => {
      console.log('[Global Context] Connection dropped.');
      setConnected(false);
      wsRef.current = null;
    };
  }, [currentHardwareId, db]);

  // Auto-connect to network node once app loads and database is alive
  useEffect(() => {
    if (db && currentHardwareId && !wsRef.current) {
      connectSocket();
    }
  }, [db, currentHardwareId, connectSocket]);

  // 3. YOUR USP: Hard clean functionality ONLY triggered when hitting explicit close action
  const explicitDisconnectAndWipe = async (sessionKey: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);

    if (db) {
      console.log(`[USP WIPE ACTIVE] Purging data packets permanently for session: ${sessionKey}`);
      await deleteMessagesBySession(db, sessionKey);
    }
  };

  return (
    <ChatContext.Provider value={{
      connected,
      userId: currentHardwareId,
      activeRecipientId,
      setActiveRecipientId,
      connectSocket,
      explicitDisconnectAndWipe,
      db,
      wsRef
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used inside a ChatProvider context layer');
  return context;
};