import 'react-native-get-random-values';
import React, {useState, useEffect} from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../storage/sqliteClient';

export default function ChatScreen() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Array<{id:string; payload:string}>>([]);

  useEffect(() => { initDb(); }, []);

  function send() {
    if (!text.trim()) return;
    const msg = { id: uuidv4(), payload: text };
    setMessages(prev => [msg, ...prev]);
    setText('');
    // TODO: encrypt and persist ciphertext to local DB (Task 2+)
  }

  return (
    <View style={styles.container}>
      <FlatList data={messages} keyExtractor={m => m.id} renderItem={({item}) => (<View style={styles.msg}><Text>{item.payload}</Text></View>)} inverted />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Type a message" />
        <Button title="Send" onPress={send} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  msg: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8, marginRight: 8, borderRadius: 4 },
});
