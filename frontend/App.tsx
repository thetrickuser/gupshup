import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import InboxScreen from './src/screens/InboxScreen';
import ChatScreen from './src/screens/ChatScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'INBOX' | 'CHAT'>('INBOX');
  const [activeUser, setActiveUser] = useState<string>('Adhyan');
  const [targetRecipient, setTargetRecipient] = useState<string>('');

  const handleSelectChat = (recipientId: string, currentUserId: string) => {
    setActiveUser(currentUserId);
    setTargetRecipient(recipientId);
    setCurrentScreen('CHAT');
  };

  const handleNavigateToInbox = () => {
    setCurrentScreen('INBOX');
  };

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {currentScreen === 'INBOX' ? (
        <InboxScreen onSelectChat={handleSelectChat} />
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
  appContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});