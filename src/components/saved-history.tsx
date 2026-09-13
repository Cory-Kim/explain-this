import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HISTORY_LIMIT, type HistoryEntry } from '@/lib/history-model';

type Props = {
  entries: HistoryEntry[];
  loading: boolean;
  error: string;
  busy: boolean;
  onDelete: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
  onRetry: () => void;
};

export function SavedHistory({ entries, loading, error, busy, onDelete, onClear, onRetry }: Props) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const opened = entries.find(item => item.id === openedId);
  const date = (value: string) => new Date(value).toLocaleString();

  return <View style={s.section}>
    <View style={s.row}><Text style={s.title}>Saved history</Text>{(entries.length > 0 || Boolean(error)) && <Pressable disabled={busy} accessibilityRole="button" onPress={() => setConfirmation('all')} style={s.button}><Text style={s.delete}>Delete all</Text></Pressable>}</View>
    <Text style={s.note}>Saved on this device. Up to {HISTORY_LIMIT} recent explanations; older entries are removed as storage fills.</Text>
    {loading && <ActivityIndicator accessibilityLabel="Loading history" color="#47785B" />}
    {!!error && <View accessibilityLiveRegion="polite"><Text style={s.error}>{error}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={onRetry} style={s.button}><Text>Retry history</Text></Pressable></View>}
    {!loading && !error && entries.length === 0 && <View style={s.empty}><Text style={s.title}>Your next discovery belongs here</Text><Text style={s.note}>Successful explanations save automatically, along with your follow-up questions.</Text></View>}
    {confirmation && <View style={s.confirm}>
      <Text style={s.body}>{confirmation === 'all' ? 'Delete all saved history from this device?' : 'Delete this saved explanation and its follow-ups?'}</Text>
      <View style={s.row}><Pressable disabled={busy} accessibilityRole="button" style={s.button} onPress={() => setConfirmation(null)}><Text>Keep history</Text></Pressable><Pressable disabled={busy} accessibilityRole="button" style={s.button} onPress={async () => { try { if (confirmation === 'all') await onClear(); else await onDelete(confirmation); setConfirmation(null); } catch { /* Parent displays the storage error. */ } }}><Text style={s.delete}>{busy ? 'Deleting…' : 'Delete permanently'}</Text></Pressable></View>
    </View>}
    {entries.map(item => <View key={item.id} style={s.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open saved explanation: ${item.title}`} onPress={() => { setOpenedId(item.id); setConfirmation(null); }} style={s.open}>
        {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={s.thumb} resizeMode="contain" accessibilityLabel="Saved image thumbnail" /> : <View style={s.thumb}><Text style={s.note}>No preview</Text></View>}
        <View style={s.details}><Text numberOfLines={1} style={s.entryTitle}>{item.title}</Text><Text style={s.note}>{date(item.createdAt)} · {item.mode} · {item.language}</Text><Text numberOfLines={2} style={s.body}>{item.explanation}</Text><Text style={s.note}>{item.followUps.length} follow-up{item.followUps.length === 1 ? '' : 's'} · Open to read</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} disabled={busy} onPress={() => setConfirmation(item.id)} style={s.button}><Text style={s.delete}>Delete</Text></Pressable>
    </View>)}
    <Modal visible={Boolean(opened)} animationType="slide" onRequestClose={() => setOpenedId(null)}>
      <SafeAreaView style={s.modal}>
        <View style={s.modalHeader}><Text style={s.title}>Saved explanation</Text><Pressable accessibilityRole="button" style={s.button} onPress={() => setOpenedId(null)}><Text style={s.entryTitle}>Close</Text></Pressable></View>
        {opened && <ScrollView contentContainerStyle={s.reader}>
          <Text style={s.title}>{opened.title}</Text><Text style={s.note}>{date(opened.createdAt)} · {opened.mode} · {opened.language}</Text>
          {opened.thumbnail && <Image source={{ uri: opened.thumbnail }} resizeMode="contain" style={s.preview} accessibilityLabel="Compressed saved image" />}
          <Text style={s.note}>Saved preview and answers. Reading history uses no AI requests.</Text>
          <Text selectable style={s.body}>{opened.explanation}</Text>
          {opened.followUps.map((turn, index) => <View key={`${turn.createdAt}-${index}`} style={s.turn}><Text style={s.entryTitle}>You asked</Text><Text selectable style={s.body}>{turn.question}</Text><Text style={s.note}>{date(turn.createdAt)} · {turn.language}</Text><Text selectable style={s.body}>{turn.answer}</Text></View>)}
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  section: { marginTop: 32, paddingTop: 24, borderTopWidth: 1, borderColor: '#E0E6D8', gap: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, title: { fontSize: 18, fontWeight: '600', color: '#263D2D' }, note: { fontSize: 12, lineHeight: 19, color: '#65705E' }, body: { fontSize: 14, lineHeight: 23, color: '#354A39' }, button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }, delete: { color: '#98503F', fontSize: 13, fontWeight: '600' }, error: { color: '#98503F', lineHeight: 22 },
  empty: { backgroundColor: '#F0F4E9', padding: 24, borderRadius: 16, gap: 10 }, card: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6D8', borderRadius: 14, padding: 12 }, open: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 240, gap: 14 }, thumb: { width: 64, height: 72, borderRadius: 9, backgroundColor: '#F0F4E9', alignItems: 'center', justifyContent: 'center' }, details: { flex: 1, gap: 4 }, entryTitle: { fontSize: 14, fontWeight: '600', color: '#263D2D' }, confirm: { padding: 16, gap: 12, backgroundColor: '#FFF2E9', borderRadius: 12 }, modal: { flex: 1, backgroundColor: '#FAFBF7' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1, borderColor: '#E0E6D8' }, reader: { padding: 24, width: '100%', maxWidth: 800, alignSelf: 'center', gap: 18 }, preview: { width: '100%', height: 220, backgroundColor: '#F0F4E9', borderRadius: 12 }, turn: { padding: 18, backgroundColor: '#EDF3E6', borderRadius: 12, gap: 12 },
});
