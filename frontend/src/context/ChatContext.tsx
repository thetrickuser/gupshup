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
  onlineUsers: Set<string>;
  registerMessageListener: (listener: () => void) => () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children, currentHardwareId }: { children: React.ReactNode, currentHardwareId: string }) {
  const [connected, setConnected] = useState(false);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectDelay = useRef<number>(1000);
  
  const encryptionKey = "super-secret-shared-key-123"; // Your shared key testing hook

  const registerMessageListener = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const notifyListeners = () => {
    listenersRef.current.forEach(listener => {
      try {
        listener();
      } catch (e) {
        console.warn("Message listener error:", e);
      }
    });
  };

  // 1. Initialize SQLite Database globally once on boot
  useEffect(() => {
    initDb().then(setDb).catch(err => console.error("Context DB Init Error:", err));
  }, []);

  // 2. Establish persistent, always-open WebSocket infrastructure
  const connectSocket = useCallback(() => {
    if (!currentHardwareId || wsRef.current) return;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

    const backendBaseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    const protocol = backendBaseUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const normalizedBaseUrl = backendBaseUrl.replace(/\/$/, '');
    const socketUrl = `${protocol}${normalizedBaseUrl.replace(/^https?:\/\//, '')}/ws?user=${encodeURIComponent(currentHardwareId)}`;

    console.log('[Global Context] Connecting to:', socketUrl);

    const socket = new WebSocket(socketUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('[Global Context] Connected successfully!');
      setConnected(true);
      reconnectDelay.current = 1000;

      // Start PING heartbeat interval (every 10 seconds)
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'PING' }));
        }
      }, 10000);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = typeof event.data === 'string' ? event.data : '';
        const node = JSON.parse(payload);
        
        if (node.type === 'PONG') {
          return;
        }

        if (node.type === 'PRESENCE') {
          setOnlineUsers(prev => {
            const copy = new Set(prev);
            if (node.status === 'ONLINE') {
              copy.add(node.user);
            } else {
              copy.delete(node.user);
            }
            return copy;
          });
        } else if (node.type === 'PRESENCE_LIST') {
          setOnlineUsers(new Set(node.users || []));
        } else if (node.type?.toUpperCase() === 'MSG' && node.cipher && node.id && node.from) {
          const decrypted = decryptPayload(node.cipher, encryptionKey);
          
          if (db) {
            // Write incoming message straight to DB cache immediately
            const backgroundSessionKey = `session_${node.from}`;
            await insertMessage(db, node.id, backgroundSessionKey, node.from, currentHardwareId, decrypted, Date.now(), encryptionKey);
            console.log(`[Global Context] Background message cached from ${node.from}`);
            notifyListeners();
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
      setOnlineUsers(new Set());
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      // Auto-reconnect with exponential backoff
      console.log(`Scheduling auto-reconnect in ${reconnectDelay.current}ms...`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSocket();
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
      }, reconnectDelay.current);
    };
  }, [currentHardwareId, db]);

  // Auto-connect to network node once app loads and database is alive
  useEffect(() => {
    if (db && currentHardwareId && !wsRef.current) {
      connectSocket();
    }
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [db, currentHardwareId, connectSocket]);

  // 3. YOUR USP: Hard clean functionality ONLY triggered when hitting explicit close action
  const explicitDisconnectAndWipe = async (sessionKey: string) => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setOnlineUsers(new Set());

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
      wsRef,
      onlineUsers,
      registerMessageListener
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