import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeHistory, encodeHistory, upsertHistory, type HistoryEntry } from './history-model';

const KEY = '@explain-this/history/v1';
// Serialize reads and writes so saving an answer cannot undo a later deletion.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}

export const historyStorage = {
  load: () => serial(async () => decodeHistory(await AsyncStorage.getItem(KEY))),
  save: (entry: HistoryEntry) => serial(async () => {
    const entries = upsertHistory(decodeHistory(await AsyncStorage.getItem(KEY)), entry);
    await AsyncStorage.setItem(KEY, encodeHistory(entries));
    return entries;
  }),
  remove: (id: string) => serial(async () => {
    const entries = decodeHistory(await AsyncStorage.getItem(KEY)).filter(item => item.id !== id);
    await AsyncStorage.setItem(KEY, encodeHistory(entries));
    return entries;
  }),
  clear: () => serial(async () => {
    await AsyncStorage.removeItem(KEY);
    return [] as HistoryEntry[];
  }),
};
