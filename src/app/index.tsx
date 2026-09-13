import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SavedHistory } from '@/components/saved-history';
import { historyStorage } from '@/lib/history-storage';
import { createHistoryThumbnail } from '@/lib/history-thumbnail';
import type { FollowUp, HistoryEntry } from '@/lib/history-model';
import { api, prepareImage, type Usage } from '@/lib/api';

const modes = ['Simply', 'Step by step', 'Summary'] as const;
const languages = ['English', '한국어', '日本語', 'Español', 'Français'] as const;
const examples = [
  { icon: '>_', title: 'An error message', detail: 'Understand what went wrong', question: 'Cannot read properties of undefined', answers: ['Your code tried to read a value from something that does not exist yet. Check that the data has loaded before using it.', '1. Find the line mentioned in the error.\n2. Check which value is undefined.\n3. Handle missing data before reading its properties.', 'Check that your data exists before accessing it.'] },
  { icon: 'x²', title: 'A math problem', detail: 'Make the steps make sense', question: '2x + 6 = 14', answers: ['Subtract 6 from both sides to get 2x = 8. Divide both sides by 2, and you get x = 4.', '1. Start with 2x + 6 = 14.\n2. Subtract 6: 2x = 8.\n3. Divide by 2: x = 4.\n4. Check: 2(4) + 6 = 14.', 'x = 4'] },
  { icon: 'Aa', title: 'A product label', detail: 'Get past unfamiliar words', question: 'Ingredients: oats, almonds, sunflower oil', answers: ['Oats are a grain, almonds are tree nuts, and sunflower oil is a plant oil. This sample contains almonds, which matter for people with a tree nut allergy.', '1. Oats: a grain ingredient.\n2. Almonds: a tree nut ingredient.\n3. Sunflower oil: oil made from sunflower seeds.', 'A sample containing grain, tree nuts, and plant oil.'] },
  { icon: '≡', title: 'A document', detail: 'Find the important parts', question: 'Return borrowed laptops at the library desk before closing at 6 pm on Friday.', answers: ['If you borrowed a library laptop, bring it back to the desk before 6 pm on Friday.', '1. Check whether you have a borrowed laptop.\n2. Take it to the library desk.\n3. Return it before 6 pm on Friday.', 'Return library laptops before Friday at 6 pm.'] },
];

export default function HomeScreen() {
  const wide = useWindowDimensions().width >= 850;
  const [mode, setMode] = useState(0);
  const [language, setLanguage] = useState(0);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [sample, setSample] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [question, setQuestion] = useState('');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const activeEntry = useRef<HistoryEntry | null>(null);
  const generation = useRef(0);
  const requestBusy = useRef(false);
  const current = sample === null ? null : examples[sample];

  async function loadHistory() {
    setHistoryLoading(true);
    try { setHistory(await historyStorage.load()); setHistoryError(''); }
    catch { setHistoryError('Couldn’t read saved history. Retry, or delete all history to start fresh.'); }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    void loadHistory();
    void api('/usage', undefined, setUsage).catch(() => {});
    return () => { generation.current += 1; };
  }, []);

  function resetConversation() {
    generation.current += 1;
    activeEntry.current = null;
    setExplanation(''); setFollowUps([]); setQuestion(''); setSaveStatus('');
  }

  async function persistEntry(entry: HistoryEntry) {
    setHistoryBusy(true);
    try {
      const entries = await historyStorage.save(entry);
      setHistory(entries); setHistoryError('');
      if (activeEntry.current?.id === entry.id) setSaveStatus('Saved on this device');
    } catch {
      setHistoryError('Couldn’t save this conversation. Your answer is still on screen. Free some device storage and retry saving.');
      if (activeEntry.current?.id === entry.id) setSaveStatus('Not saved');
    } finally { setHistoryBusy(false); }
  }

  async function deleteHistory(id?: string) {
    setHistoryBusy(true);
    try {
      const entries = id ? await historyStorage.remove(id) : await historyStorage.clear();
      setHistory(entries); setHistoryError('');
      if (!id || activeEntry.current?.id === id) {
        // Detach the open conversation so later follow-ups cannot recreate a deleted record.
        activeEntry.current = null;
        setSaveStatus('Removed from saved history');
      }
    } catch {
      setHistoryError('Couldn’t delete history. Please try again.');
      throw new Error('History deletion failed');
    } finally { setHistoryBusy(false); }
  }

  async function chooseImage() {
    setNotice('');
    try {
      // Call directly from the button so browsers allow the system picker.
      // Image-only library selection does not require broad library access.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        allowsEditing: false,
        base64: true,
        quality: 1,
      });
      // Keep the current picture if the user cancels replacement.
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected?.uri || (selected.type && selected.type !== 'image') ||
          (selected.mimeType && !selected.mimeType.startsWith('image/'))) {
        setNotice('Please choose an image file, such as a JPG or PNG.');
        return;
      }
      setImage(selected);
      resetConversation();
      setPreviewError(false);
      setSample(null);
    } catch {
      setNotice('We couldn’t open that image. Please try again or choose a different picture.');
    }
  }

  async function takePhoto() {
    setNotice('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setNotice('Camera permission is needed to take a photo. You can allow it in the tablet settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, base64: true, quality: 1 });
      if (result.canceled) return;
      const selected = result.assets?.[0];
      if (!selected?.uri) { setNotice('We couldn’t use that photo. Please try again.'); return; }
      setImage(selected);
      resetConversation();
      setPreviewError(false);
      setSample(null);
    } catch {
      setNotice('We couldn’t open the camera. Please try again.');
    }
  }

  function removeImage() {
    resetConversation();
    setImage(null);
    setPreviewError(false);
    setExplanation('');
    setNotice('');
  }

  async function explainImage() {
    if (!image || requestBusy.current || historyLoading) return;
    if (usage && usage.remaining <= 0) { setNotice(`Your daily allowance is used. It resets at ${new Date(usage.resetsAt).toLocaleString()}.`); return; }
    if (!image.base64) { setNotice('This image could not be prepared. Please choose it again.'); return; }
    resetConversation();
    const startedGeneration = generation.current;
    const selectedImage = image;
    const selectedMode = modes[mode];
    const selectedLanguage = languages[language];
    requestBusy.current = true;
    setNotice(''); setExplaining(true);
    try {
      const prepared = await prepareImage(selectedImage);
      const data = await api('/explain', { ...prepared, mode: selectedMode, language: selectedLanguage }, setUsage);
      if (typeof data.explanation !== 'string' || !data.explanation.trim()) throw new Error('No explanation was returned. Please try again.');
      if (generation.current !== startedGeneration) return;
      setExplanation(data.explanation);
      setSaveStatus('Saving on this device…');
      let thumbnail: string | null = null;
      try { thumbnail = await createHistoryThumbnail(selectedImage); }
      catch { setNotice('The explanation can be saved, but its image preview could not be created.'); }
      if (generation.current !== startedGeneration) return;
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        title: selectedImage.fileName || 'Camera photo', thumbnail,
        mode: selectedMode, language: selectedLanguage,
        explanation: data.explanation, followUps: [],
      };
      activeEntry.current = entry;
      await persistEntry(entry);
    } catch (error) {
      if (generation.current === startedGeneration) setNotice(error instanceof Error ? error.message : 'We couldn’t get an explanation. Please try again.');
    } finally { requestBusy.current = false; setExplaining(false); }
  }

  async function askFollowUp() {
    if (!image?.base64 || !explanation || !question.trim() || requestBusy.current) return;
    if (usage && usage.remaining <= 0) { setNotice(`Your daily allowance is used. It resets at ${new Date(usage.resetsAt).toLocaleString()}.`); return; }
    const askedQuestion = question.trim();
    const answerLanguage = languages[language];
    const startedGeneration = generation.current;
    requestBusy.current = true;
    setAsking(true); setNotice('');
    try {
      const prepared = await prepareImage(image);
      const data = await api('/follow-up', { ...prepared, question: askedQuestion, language: answerLanguage, previousExplanation: explanation }, setUsage);
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('No answer was returned. Please try again.');
      if (generation.current !== startedGeneration) return;
      const turn: FollowUp = { question: askedQuestion, answer: data.answer, language: answerLanguage, createdAt: new Date().toISOString() };
      setFollowUps(turns => [...turns, turn]); setQuestion('');
      if (activeEntry.current) {
        const entry = { ...activeEntry.current, followUps: [...activeEntry.current.followUps, turn] };
        activeEntry.current = entry;
        await persistEntry(entry);
      }
    } catch (error) { if (generation.current === startedGeneration) setNotice(error instanceof Error ? error.message : 'We couldn’t answer that question. Please try again.'); }
    finally { requestBusy.current = false; setAsking(false); }
  }
  return (
    <SafeAreaView style={s.page}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={s.shell}>
          <View style={s.header}>
            <View style={s.brand}><View style={s.logo}><Text style={s.logoText}>✳</Text></View><Text style={s.brandText}>Explain This<Text style={s.green}>.</Text></Text></View>
            <Text style={s.tag}>●  A little more clarity</Text>
          </View>
          <View style={[s.hero, wide && s.heroWide]}>
            <View style={s.intro}>
              <Text style={s.eyebrow}>FOR YOUR EVERYDAY “WHAT DOES THIS MEAN?”</Text>
              <Text style={[s.heading, !wide && s.headingSmall]}>Less confusion.{'\n'}<Text style={s.green}>More understanding.</Text></Text>
              <Text style={s.subtitle}>A tricky question. An unfamiliar label. Something that just doesn’t click. Let’s make sense of it.</Text>
              <Text style={s.steps}>01  Capture     →     02  Ask     →     03  Understand</Text>
            </View>
            <View style={[s.capture, wide && { width: 420 }]}>
              <View style={s.row}><Text style={s.sectionTitle}>Start with a picture</Text><Text style={s.star}>✳</Text></View>
              <View style={s.imageArea}>
                {image ? <>
                  {!previewError ? <Image
                    key={image.uri}
                    source={{ uri: image.uri }}
                    style={s.preview}
                    resizeMode="contain"
                    accessibilityLabel="Selected image preview"
                    onError={() => setPreviewError(true)}
                  /> : <Text accessibilityLiveRegion="polite" style={s.notice}>This image can’t be previewed. Try a JPG or PNG instead.</Text>}
                  <Text numberOfLines={2} style={s.uploadTitle}>{image.fileName || 'Selected image'}</Text>
                  <Text style={s.hint}>Sent to Gemini when you ask for an explanation</Text>
                </> : <>
                <View style={s.picture}><View style={s.sun}/><View style={s.mountain}/></View>
                <Text style={s.uploadTitle}>A little curiosity goes a long way</Text>
                <Text style={[s.hint, { textAlign: 'center' }]}>A photo or screenshot is a good place to start.</Text>
                </>}
              </View>
              <Pressable accessibilityRole="button" onPress={chooseImage} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>{image ? 'Replace image' : '＋  Choose an image'}</Text></Pressable>
              {image && <Pressable accessibilityRole="button" onPress={removeImage} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>Remove image</Text></Pressable>}
              {image && <Pressable accessibilityRole="button" disabled={explaining || asking || historyLoading} onPress={explainImage} style={({ pressed }) => [s.explain, pressed && s.pressed, (explaining || asking || historyLoading) && s.disabled]}>{explaining ? <><ActivityIndicator color="#FFFFFF" size="small" /><Text style={s.primaryText}>Preparing explanation…</Text></> : <Text style={s.primaryText}>✦  Explain this image</Text>}</Pressable>}
              <Pressable accessibilityRole="button" onPress={takePhoto} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.secondaryText}>Take a photo</Text></Pressable>
              <Text style={s.caption}>{image ? 'Ready to explain another picture whenever you are.' : 'Choose a picture to get started'}</Text>
              {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
              {!!explanation && <Text accessibilityLiveRegion="polite" style={s.explanation}>{explanation}</Text>}
              {!!saveStatus && <Text accessibilityLiveRegion="polite" style={s.caption}>{saveStatus}</Text>}
              {saveStatus === 'Not saved' && <Pressable accessibilityRole="button" disabled={historyBusy} style={s.secondary} onPress={() => { if (activeEntry.current) void persistEntry(activeEntry.current); }}><Text style={s.secondaryText}>Retry saving</Text></Pressable>}
              {!!explanation && <View style={s.followUp}>
                <Text style={s.followTitle}>Still curious?</Text>
                {followUps.map((turn, index) => <View key={`${turn.createdAt}-${index}`} style={s.followAnswer}><Text style={s.answerLabel}>YOU ASKED · {turn.language}</Text><Text selectable style={s.question}>{turn.question}</Text><Text selectable style={s.answer}>{turn.answer}</Text></View>)}
                <TextInput accessibilityLabel="Follow-up question" value={question} onChangeText={setQuestion} editable={!asking} placeholder="Ask a follow-up about this image…" placeholderTextColor="#889386" multiline style={s.questionInput} />
                <Pressable accessibilityRole="button" disabled={asking || explaining || !question.trim()} onPress={askFollowUp} style={({ pressed }) => [s.askButton, pressed && s.pressed, (asking || explaining || !question.trim()) && s.disabled]}>{asking ? <><ActivityIndicator color="#FFFFFF" size="small" /><Text style={s.primaryText}>Thinking…</Text></> : <Text style={s.primaryText}>Ask follow-up</Text>}</Pressable>
              </View>}
            </View>
          </View>
          <View style={s.preferences}>
            <View><Text style={s.sectionTitle}>Your explanation, your way</Text><Text style={s.hint}>Choose how you like to learn.</Text></View>
            <View style={s.preferenceControls}><View style={s.modes}>{modes.map((item, index) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: mode === index }} onPress={() => setMode(index)} style={[s.mode, mode === index && s.active]}><Text style={[s.modeText, mode === index && s.activeText]}>{item}</Text></Pressable>)}</View><View style={s.languageWrap}><Pressable accessibilityRole="button" accessibilityLabel="Choose explanation language" accessibilityState={{ expanded: languageOpen }} onPress={() => setLanguageOpen(!languageOpen)} style={s.languageButton}><Text style={s.languageText}>文  {languages[language]}  ▾</Text></Pressable>{languageOpen && <View style={s.languageMenu}>{languages.map((item, index) => <Pressable key={item} onPress={() => { setLanguage(index); setLanguageOpen(false); }} style={[s.languageOption, language === index && s.languageSelected]}><Text style={s.languageText}>{item}</Text></Pressable>)}</View>}</View></View>
          </View>
          <View style={[s.row, { marginTop: 30, marginBottom: 16 }]}><Text style={s.sectionTitle}>What are you curious about?</Text><Text style={s.hint}>Try an example ↓</Text></View>
          <View style={s.grid}>{examples.map((item, index) => <Pressable key={item.title} accessibilityRole="button" accessibilityState={{ selected: sample === index }} onPress={() => { setSample(index); setNotice(''); }} style={({ pressed }) => [s.example, { width: wide ? '23.5%' : '48%' }, sample === index && s.selected, pressed && s.pressed]}><Text style={s.exampleIcon}>{item.icon}</Text><Text style={s.exampleTitle}>{item.title}</Text><Text style={s.hint}>{item.detail}</Text><Text style={s.corner}>↗</Text></Pressable>)}</View>
          {current && <View style={s.result} accessibilityLiveRegion="polite"><View style={s.row}><Text style={s.eyebrow}>SAMPLE EXPLANATION · {modes[mode].toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close sample" onPress={() => setSample(null)} style={s.close}><Text>✕</Text></Pressable></View><Text style={s.question}>{current.question}</Text><Text style={s.answer}>{current.answers[mode]}</Text><Text style={s.caption}>Written example to preview the experience. AI is not connected yet.</Text></View>}
          <SavedHistory entries={history} loading={historyLoading} error={historyError} busy={historyBusy || explaining || asking} onDelete={deleteHistory} onClear={() => deleteHistory()} onRetry={() => { void loadHistory(); }} />
          <View style={[s.row, s.footer]}><Text style={s.hint}>A clearer picture starts here.</Text><Text style={s.caption}>Explain This · Made for curious minds</Text></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Styles control the spacing, colors, and layout of the screen above.
const s = StyleSheet.create({
  preview: { width: '100%', height: 220, borderRadius: 8 },
  page: { flex: 1, backgroundColor: '#FAFBF7' }, shell: { width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 26, gap: 16, flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: '#E5E8DF' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 38, height: 38, backgroundColor: '#225C46', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, logoText: { fontSize: 29, color: '#DFF2BB' }, brandText: { fontSize: 23, fontWeight: '700', color: '#202D26', letterSpacing: -0.8 }, tag: { fontSize: 12, color: '#667264' },
  hero: { paddingVertical: 40, gap: 30 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 48, paddingVertical: 56 }, intro: { flex: 1, gap: 22 }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#52715B', lineHeight: 18 }, heading: { fontSize: 52, fontWeight: '700', letterSpacing: -2.5, lineHeight: 61, color: '#202D26' }, headingSmall: { fontSize: 38, lineHeight: 46, letterSpacing: -1.7 }, green: { color: '#47785B' }, subtitle: { fontSize: 17, lineHeight: 28, color: '#687166', maxWidth: 440 }, steps: { fontSize: 11, color: '#485A4C', lineHeight: 22, fontWeight: '600', paddingTop: 8 },
  capture: { padding: 24, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DEE5D8', gap: 12, boxShadow: '0px 12px 40px rgba(36,65,34,0.05)' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }, sectionTitle: { fontSize: 17, fontWeight: '600', color: '#263D2D', marginBottom: 4 }, star: { fontSize: 25, color: '#658E65' }, imageArea: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 26, backgroundColor: '#F5F7EF', borderRadius: 16, marginVertical: 4, borderWidth: 1, borderColor: '#E4E9D9', borderStyle: 'dashed', gap: 9 }, picture: { width: 66, height: 53, borderWidth: 2, borderColor: '#6F8A5B', borderRadius: 10, overflow: 'hidden', marginBottom: 10, transform: [{ rotate: '-7deg' }], backgroundColor: '#E9EFD9' }, sun: { width: 10, height: 10, backgroundColor: '#789354', borderRadius: 5, margin: 9 }, mountain: { width: 47, height: 47, backgroundColor: '#BDCDA3', transform: [{ rotate: '45deg' }], left: 17 }, uploadTitle: { fontSize: 13, fontWeight: '600', color: '#405039', textAlign: 'center' }, hint: { color: '#6C7569', fontSize: 12, lineHeight: 20 },
  primary: { minHeight: 49, backgroundColor: '#245D46', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, explain: { minHeight: 49, backgroundColor: '#47785B', borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 9 }, disabled: { opacity: 0.75 }, primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }, secondary: { minHeight: 46, borderWidth: 1, borderColor: '#DFE5D9', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, secondaryText: { color: '#354A3B', fontSize: 13, fontWeight: '600' }, caption: { fontSize: 10, color: '#747E70', textAlign: 'center', lineHeight: 17 }, notice: { fontSize: 12, color: '#35523D', lineHeight: 19, padding: 12, backgroundColor: '#EDF3E7', borderRadius: 8 }, explanation: { fontSize: 13, color: '#35523D', lineHeight: 20, padding: 14, backgroundColor: '#EDF3E7', borderRadius: 10 }, pressed: { opacity: 0.7 },
  preferences: { paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E8DF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18 }, preferenceControls: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, modes: { flexDirection: 'row', backgroundColor: '#EEF1E8', borderRadius: 12, padding: 4, flexWrap: 'wrap' }, mode: { paddingHorizontal: 15, minHeight: 40, justifyContent: 'center', borderRadius: 9 }, active: { backgroundColor: '#FFFFFF', boxShadow: '0px 2px 4px rgba(0,0,0,0.06)' }, modeText: { fontSize: 12, color: '#6B7465' }, activeText: { color: '#275D43', fontWeight: '700' }, languageWrap: { position: 'relative', zIndex: 4 }, languageButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, borderColor: '#DDE5D8', backgroundColor: '#FFFFFF', justifyContent: 'center' }, languageText: { fontSize: 12, color: '#35523D' }, languageMenu: { position: 'absolute', right: 0, top: 46, minWidth: 130, padding: 5, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE5D8', boxShadow: '0px 5px 15px rgba(0,0,0,0.12)' }, languageOption: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 7 }, languageSelected: { backgroundColor: '#EDF3E7' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }, example: { padding: 18, borderWidth: 1, borderColor: '#E2E7DA', borderRadius: 16, backgroundColor: '#FFFFFF', minHeight: 158 }, selected: { borderColor: '#568363', backgroundColor: '#F0F5E9' }, exampleIcon: { fontSize: 21, color: '#517750', marginBottom: 17, fontWeight: '600' }, exampleTitle: { fontSize: 14, fontWeight: '600', color: '#2B3B2B', marginBottom: 7 }, corner: { position: 'absolute', right: 16, top: 16, color: '#859477', fontSize: 19 },
  result: { marginTop: 24, borderRadius: 18, padding: 24, backgroundColor: '#EEF4E6', gap: 15 }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, question: { fontSize: 18, color: '#263D2D', fontWeight: '600', lineHeight: 27 }, answer: { fontSize: 15, color: '#40543C', lineHeight: 26 }, followUp: { marginTop: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#D8E5D2', gap: 10 }, followTitle: { fontSize: 15, fontWeight: '700', color: '#2E4937' }, questionInput: { minHeight: 72, borderWidth: 1, borderColor: '#D4E0CE', borderRadius: 10, padding: 12, color: '#304532', backgroundColor: '#FFFFFF', fontSize: 14, textAlignVertical: 'top' }, askButton: { minHeight: 44, backgroundColor: '#47785B', borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 }, followAnswer: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: 10, gap: 8 }, answerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, color: '#658067' }, footer: { paddingVertical: 30 },
});
