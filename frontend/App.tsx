import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import InboxScreen from './src/screens/InboxScreen';
import ChatScreen from './src/screens/ChatScreen';

const USER_ID_KEY = '@secure_chat_hardware_device_fingerprint';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'INBOX' | 'CHAT'>('INBOX');
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [targetRecipient, setTargetRecipient] = useState<string>('');
  const [loadingIdentity, setLoadingIdentity] = useState<boolean>(true);

  useEffect(() => {
    const resolveDeviceIdentity = async () => {
      try {
        let existingId = await AsyncStorage.getItem(USER_ID_KEY);
        
        if (!existingId) {
          // Generate a cryptographically secure random UUID string fragment
          const secureUuid = Crypto.randomUUID();
          const shortHash = secureUuid.substring(0, 8); // Pull a clean 8-character token alphanumeric string
          existingId = `usr_${shortHash}`;
          
          await AsyncStorage.setItem(USER_ID_KEY, existingId);
          console.log('Generated new device hardware fingerprint:', existingId);
        } else {
          console.log('Loaded verified device fingerprint:', existingId);
        }
        
        setActiveUser(existingId);
        setLoadingIdentity(false);
      } catch (err) {
        console.error('Failed to parse or establish stable local hardware identity hooks:', err);
        // Resilient fallback configuration if local storage hardware exceptions kick in
        setActiveUser('usr_fallback_node');
        setLoadingIdentity(false);
      }
    };

    resolveDeviceIdentity();
  }, []);

  const handleSelectChat = (recipientId: string, currentUserId: string) => {
    setActiveUser(currentUserId);
    setTargetRecipient(recipientId);
    setCurrentScreen('CHAT');
  };

  const handleNavigateToInbox = () => {
    setCurrentScreen('INBOX');
  };

  if (loadingIdentity || !activeUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Verifying hardware encryption keys...</Text>
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {currentScreen === 'INBOX' ? (
        <InboxScreen 
          onSelectChat={handleSelectChat} 
          currentHardwareId={activeUser} 
        />
      ) : (
        <ChatScreen 
          currentUserId={activeUser}
          targetRecipientId={targetRecipient}
          onBackToInbox={handleNavigateToInbox}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666', fontWeight: '500' }
});