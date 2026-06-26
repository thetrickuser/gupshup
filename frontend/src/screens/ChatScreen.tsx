import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import {
  getMessagesByConversation,
  insertMessage,
} from "../storage/sqliteClient";
import { encryptPayload } from "../crypto/encryptionUtils";
import { useChat } from "../context/ChatContext";

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

export default function ChatScreen({
  currentUserId,
  targetRecipientId,
  onBackToInbox,
}: ChatScreenProps) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Pull persistent socket state and explicit data wiping mechanisms from global context
  const { connected, explicitDisconnectAndWipe, db, wsRef, connectSocket, setActiveRecipientId, onlineUsers, registerMessageListener } =
    useChat();

  const encryptionKey = "super-secret-shared-key-123";
  const sessionKey = `session_${targetRecipientId}`;

  useEffect(() => {
    setActiveRecipientId(targetRecipientId);
    return () => setActiveRecipientId(null);
  }, [targetRecipientId]);

  // Load message history from local encrypted SQLite storage on screen mount
  useEffect(() => {
    if (db) {
      loadMessages();
    }
  }, [db, targetRecipientId]);

  const loadMessages = async () => {
    if (!db) return;

    try {
      const msgs = await getMessagesByConversation(
        db,
        currentUserId,
        targetRecipientId,
        encryptionKey,
      );
      const formatted = msgs.map((m) => ({
        ...m,
        fromSelf: m.sender_id === currentUserId,
      }));
      setMessages(formatted);
    } catch (err) {
      console.warn("Error loading messages from database container:", err);
    }
  };

  // Listen for message events from global context (replaces heavy polling)
  useEffect(() => {
    if (!db) return;
    
    // Initial fetch
    loadMessages();

    // Subscribe to incoming messages
    const unsubscribe = registerMessageListener(() => {
      loadMessages();
    });

    return () => unsubscribe();
  }, [db, targetRecipientId]);

  // YOUR USP: Deletes historical traces locally and terminates connection permanently
  const handleWipeAndDisconnect = async () => {
    try {
      setMessages([]); // Clear viewport layout array immediately
      await explicitDisconnectAndWipe(sessionKey);
      onBackToInbox();
    } catch (err) {
      console.error("Failed to trigger session purge sequence:", err);
    }
  };

  const handleManualReconnect = () => {
    if (db) {
      connectSocket();
    } else {
      console.warn("Cannot reconnect. Database channel is not initialized.");
    }
  };

  async function send() {
    if (!text.trim() || !db || !currentUserId || !targetRecipientId) return;

    // Verify context's primary socket stream is still alive before sending payload packet
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(
        "Cannot send message. Global WebSocket pipeline is offline.",
      );
      return;
    }

    const msgId = Crypto.randomUUID();
    const timestamp = Date.now();
    const cipher = encryptPayload(text, encryptionKey);

    const outgoing = {
      type: "MSG",
      id: msgId,
      from: currentUserId,
      to: targetRecipientId,
      cipher,
    };

    try {
      // 1. Emit live network packet downstream
      wsRef.current.send(JSON.stringify(outgoing));

      // 2. Write safely to SQLite cache storage locally
      await insertMessage(
        db,
        msgId,
        sessionKey,
        currentUserId,
        targetRecipientId,
        text,
        timestamp,
        encryptionKey,
      );

      // 3. Update local state stream array for instant layout engine render
      setMessages((prev) => [
        {
          id: msgId,
          sender_id: currentUserId,
          recipient_id: targetRecipientId,
          payload: text,
          created_at: timestamp,
          fromSelf: true,
        },
        ...prev,
      ]);

      setText("");
    } catch (err) {
      console.warn("Error handling outgoing payload loop:", err);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Top Operational Header */}
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={onBackToInbox} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Active Chats</Text>
          </TouchableOpacity>

          <View style={styles.sessionStatusContainer}>
            <View style={styles.metaColumn}>
              <Text style={styles.identityLabel}>CHAT PARTNER</Text>
              <Text style={styles.identityValue}>{targetRecipientId}</Text>
            </View>

            {!connected ? (
              <TouchableOpacity
                style={styles.reconnectButton}
                onPress={handleManualReconnect}
              >
                <Text style={styles.reconnectButtonText}>Connect Channel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.wipeButton}
                onPress={handleWipeAndDisconnect}
              >
                <Text style={styles.wipeButtonText}>Purge Session</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.badgeRow}>
            {/* My own WebSocket status */}
            <View
              style={[
                styles.networkStatusBadge,
                connected ? styles.bgConnected : styles.bgDisconnected,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  connected ? styles.dotConnected : styles.dotDisconnected,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  connected ? styles.textConnected : styles.textDisconnected,
                ]}
              >
                {connected ? "Server Connected" : "Server Disconnected"}
              </Text>
            </View>

            {/* Recipient's online presence status */}
            <View
              style={[
                styles.networkStatusBadge,
                onlineUsers.has(targetRecipientId) ? styles.bgConnected : styles.bgDisconnected,
                { marginLeft: 8 }
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  onlineUsers.has(targetRecipientId) ? styles.dotConnected : styles.dotDisconnected,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  onlineUsers.has(targetRecipientId) ? styles.textConnected : styles.textDisconnected,
                ]}
              >
                {onlineUsers.has(targetRecipientId) ? "Recipient Active" : "Recipient Offline"}
              </Text>
            </View>
          </View>
        </View>

        {/* Chat Log Feed */}
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelf = item.fromSelf !== false;
            return (
              <View
                style={[
                  styles.bubbleWrapper,
                  isSelf ? styles.wrapperSelf : styles.wrapperPartner,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isSelf ? styles.bubbleSelf : styles.bubblePartner,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isSelf ? styles.textSelf : styles.textPartner,
                    ]}
                  >
                    {item.payload}
                  </Text>
                  <Text
                    style={[
                      styles.timestamp,
                      isSelf ? styles.timeSelf : styles.timePartner,
                    ]}
                  >
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
          inverted
        />

        {/* Messaging Core Footer Dock */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={
                connected ? "Type an encrypted message..." : "Channel offline"
              }
              placeholderTextColor="#999"
              editable={connected}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!text.trim() || !connected) && styles.sendButtonDisabled,
              ]}
              onPress={send}
              disabled={!text.trim() || !connected}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.privacyBanner}>
            🛡️ Ephemeral Workspace • Leaving screen won't disconnect
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  headerCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#E9ECEF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: { marginBottom: 10, paddingVertical: 4 },
  backButtonText: { color: "#007AFF", fontSize: 15, fontWeight: "600" },
  sessionStatusContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  metaColumn: { flex: 1 },
  identityLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8E8E93",
    letterSpacing: 0.5,
  },
  identityValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212529",
    marginTop: 2,
  },
  wipeButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  wipeButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  badgeRow: { flexDirection: "row", marginTop: 4 },
  networkStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  bgConnected: { backgroundColor: "#E3FCEF" },
  bgDisconnected: { backgroundColor: "#FFEBE6" },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  dotConnected: { backgroundColor: "#36B37E" },
  dotDisconnected: { backgroundColor: "#FF5630" },
  statusText: { fontSize: 11, fontWeight: "600" },
  textConnected: { color: "#006644" },
  textDisconnected: { color: "#BF2600" },
  listContent: { paddingHorizontal: 16, paddingVertical: 12 },
  bubbleWrapper: { flexDirection: "row", marginVertical: 4, width: "100%" },
  wrapperSelf: { justifyContent: "flex-end" },
  wrapperPartner: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleSelf: { backgroundColor: "#007AFF", borderTopRightRadius: 2 },
  bubblePartner: { backgroundColor: "#E5E5EA", borderTopLeftRadius: 2 },
  messageText: { fontSize: 16, lineHeight: 20 },
  textSelf: { color: "#FFFFFF" },
  textPartner: { color: "#000000" },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  timeSelf: { color: "rgba(255, 255, 255, 0.7)" },
  timePartner: { color: "#8E8E93" },
  inputContainer: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#E9ECEF",
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end" },
  input: {
    flex: 1,
    backgroundColor: "#F1F3F5",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    marginRight: 10,
    borderRadius: 20,
    fontSize: 16,
    color: "#212529",
    maxHeight: 80,
  },
  sendButton: {
    backgroundColor: "#007AFF",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: { backgroundColor: "#E9ECEF" },
  sendButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  privacyBanner: {
    fontSize: 11,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
  },
  reconnectButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  reconnectButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
});
