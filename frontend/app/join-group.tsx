import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './services/api';

export default function JoinGroupScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (code.trim().length !== 6) {
      alert('Enter a 6-character invite code');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/api/groups/join', { invite_code: code.trim().toUpperCase() });
      const { id } = res.data;
      await AsyncStorage.setItem('groupId', id);
      router.replace('/(tabs)/map');
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Invalid invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join a Group</Text>
      <Text style={styles.subtitle}>Enter the 6-character invite code</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. ABC123"
        placeholderTextColor="#4a6080"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
        autoFocus
      />
      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleJoin} disabled={loading}>
        <Text style={styles.btnText}>{loading ? 'Joining...' : 'Join Group'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06121f', padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#8fa8c8', marginBottom: 32 },
  input: { backgroundColor: '#0f2238', borderRadius: 12, padding: 16, color: '#fff', fontSize: 24, marginBottom: 16, textAlign: 'center', letterSpacing: 8 },
  btn: { backgroundColor: '#10243b', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrimary: { backgroundColor: '#1e88e5' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { color: '#4a6080', textAlign: 'center', marginTop: 8 },
});
