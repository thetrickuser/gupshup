import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Button
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SQLite from 'expo-sqlite';
import { initDb, getActiveConversations, Conversation } from '../storage/sqliteClient';

interface InboxScreenProps {
  onSelectChat: (recipientId: string, currentUserId: string) => void;
}

export default function InboxScreen({ onSelectChat }: InboxScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState<any>(null);
  
  // Static identities for local testing until device fingerprints are linked
  const [myUserId] = useState('Adhyan'); 
  
  // New chat modal control states
  const [modalVisible, setModalVisible] = useState(false);
  const [newRecipientInput, setNewRecipientInput] = useState('');

  const loadInbox = async (database: any) => {
    try {
      const activeThreads = await getActiveConversations(database);
      setConversations(activeThreads);
      setLoading(false);
    } catch (err) {
      console.warn('Error loading conversations:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    let database: any;
    const setupInbox = async () => {
      try {
        database = await initDb();
        setDb(database);
        await loadInbox(database);
      } catch (err) {
        console.error('Failed to initialize inbox DB channel:', err);
        setLoading(false);
      }
    };
    setupInbox();
  }, []);

  const handleStartNewChat = () => {
    if (!newRecipientInput.trim()) return;
    const targetRecipient = newRecipientInput.trim();
    setModalVisible(false);
    setNewRecipientInput('');
    // Route into the chat view using the newly defined target context
    onSelectChat(targetRecipient, myUserId);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Profile Bar Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.profileBadge}>ID: {myUserId} • 🛡️ Secure</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No active conversations yet.</Text>
          <Text style={styles.subEmptyText}>Tap the button below to start a secure chat.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.recipient_id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.conversationRow}
              onPress={() => onSelectChat(item.recipient_id, myUserId)}
            >
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{item.recipient_id.substring(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.messageContent}>
                <View style={styles.rowTop}>
                  <Text style={styles.recipientName}>{item.recipient_id}</Text>
                  <Text style={styles.timeText}>
                    {new Date(item.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.lastMessageSnippet} numberOfLines={1}>
                  {item.last_message}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* New Conversation Prompt Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Secure Chat</Text>
            <Text style={styles.modalSub}>Enter your contact's specific user ID to begin:</Text>
            <TextInput
              style={styles.modalInput}
              value={newRecipientInput}
              onChangeText={setNewRecipientInput}
              placeholder="e.g. FriendID"
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" color="#FF3B30" onPress={() => setModalVisible(false)} />
              <Button title="Open Chat" color="#007AFF" onPress={handleStartNewChat} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E9ECEF',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#212529' },
  profileBadge: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginTop: 4 },
  listContainer: { paddingVertical: 8 },
  conversationRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F8F9FA',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#495057' },
  messageContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  recipientName: { fontSize: 16, fontWeight: '600', color: '#212529' },
  timeText: { fontSize: 12, color: '#8E8E93' },
  lastMessageSnippet: { fontSize: 14, color: '#6C757D' },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6C757D', marginBottom: 4 },
  subEmptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#007AFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  fabText: { fontSize: 28, color: '#FFFFFF', fontWeight: '300', marginTop: -2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#212529', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#6C757D', marginBottom: 16 },
  modalInput: { backgroundColor: '#F1F3F5', padding: 12, borderRadius: 8, fontSize: 16, color: '#212529', marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
});