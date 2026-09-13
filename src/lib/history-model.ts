export type FollowUp = { question: string; answer: string; language: string; createdAt: string };
export type HistoryEntry = {
  id: string;
  createdAt: string;
  title: string;
  thumbnail: string | null;
  mode: string;
  language: string;
  explanation: string;
  followUps: FollowUp[];
};

export const HISTORY_LIMIT = 20;
// Bound the JSON payload too, including thumbnails and non-English text.
const MAX_HISTORY_CHARACTERS = 750_000;

export function decodeHistory(raw: string | null): HistoryEntry[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.entries) || !data.entries.every((item: HistoryEntry) =>
    item && typeof item.id === 'string' && typeof item.title === 'string' &&
    typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) &&
    typeof item.mode === 'string' && typeof item.language === 'string' &&
    typeof item.explanation === 'string' &&
    (item.thumbnail === null || (typeof item.thumbnail === 'string' && item.thumbnail.startsWith('data:image/jpeg;base64,'))) &&
    Array.isArray(item.followUps) && item.followUps.every(turn => turn &&
      typeof turn.question === 'string' && typeof turn.answer === 'string' &&
      typeof turn.language === 'string' && typeof turn.createdAt === 'string')
  )) throw new Error('Saved history could not be read.');
  return data.entries;
}

export function encodeHistory(entries: HistoryEntry[]) {
  return JSON.stringify({ version: 1, entries });
}

export function upsertHistory(entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (encodeHistory([entry]).length > MAX_HISTORY_CHARACTERS) {
    throw new Error('This conversation is too large to save.');
  }
  const existing = entries.some(item => item.id === entry.id);
  const next = (existing ? entries.map(item => item.id === entry.id ? entry : item) : [entry, ...entries]).slice(0, HISTORY_LIMIT);
  while (encodeHistory(next).length > MAX_HISTORY_CHARACTERS) {
    // Never evict the conversation currently being saved.
    const index = next.findLastIndex(item => item.id !== entry.id);
    if (index < 0) break;
    next.splice(index, 1);
  }
  return next;
}
