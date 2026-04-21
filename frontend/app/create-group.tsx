import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './services/api';

export default function CreateGroupScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/api/groups', { name: groupName.trim() });
      const { id, invite_code } = res.data;
      await AsyncStorage.multiSet([['groupId', id], ['inviteCode', invite_code]]);
      setInviteCode(invite_code);
      setCreated(true);
    } catch (e: any) {
      const message = e?.response?.data?.error || 'Failed to create group';
      Alert.alert('Create group failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    await Share.share({ message: `Join my FLOW group with code: ${inviteCode}` });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteCode);
    Alert.alert('Invite code copied!', 'Share it with your crew.');
  };


  if (created) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Group Created!</Text>
        <Text style={styles.subtitle}>Share this invite code with your crew:</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{inviteCode}</Text>
        </View>
        <TouchableOpacity style={styles.btn} onPress={handleCopy}>
          <Text style={styles.btnText}>Copy Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleShare}>
          <Text style={styles.btnText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => router.replace('/(tabs)/map')}>
          <Text style={styles.btnText}>Go to Map →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a Group</Text>
      <Text style={styles.subtitle}>Name your crew</Text>
      <TextInput
        style={styles.input}
        placeholder="Group name (e.g. Powder Crew)"
        placeholderTextColor="#4a6080"
        value={groupName}
        onChangeText={setGroupName}
        autoFocus
      />
      <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleCreate} disabled={loading}>
        <Text style={styles.btnText}>{loading ? 'Creating...' : 'Create Group'}</Text>
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
  input: { backgroundColor: '#0f2238', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#10243b', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrimary: { backgroundColor: '#1e88e5' },
  btnSecondary: { backgroundColor: '#1a3a5c' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  codeBox: { backgroundColor: '#0f2238', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 24 },
  code: { fontSize: 36, fontWeight: '800', color: '#64ffda', letterSpacing: 8 },
  link: { color: '#4a6080', textAlign: 'center', marginTop: 8 },
});
