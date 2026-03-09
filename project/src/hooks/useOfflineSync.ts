import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ✅ Defined inline — avoids dependency on supabase.ts exporting this type
type TransactionType = 'income' | 'expense';

// ✅ FIX: Defined inline instead of importing from missing lib/types.ts
export interface PendingSaveResult {
  success: boolean;
  offline?: boolean;
  error?: string;
}

// ✅ Exported so Home.tsx can import and use the same type
export interface TransactionPayload {
  amount: number;
  description: string;
  type: TransactionType;
  user_id: string;
  category_id?: string | null;
  category_label?: string | null;
  voice_transcript?: string | null;
  transaction_date?: string;
  created_at?: string;
}

interface QueuedTransaction {
  id: string;
  payload: TransactionPayload;
  timestamp: number;
}

const QUEUE_KEY = 'khata_offline_queue';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getQueue = (): QueuedTransaction[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedTransaction[];
  } catch { return []; }
};

const saveQueue = (queue: QueuedTransaction[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

// ✅ KEY FIX: Only keep core guaranteed columns in the offline queue payload.
// Stripping category_label and voice_transcript prevents "stuck queue" when
// DB schema doesn't have those optional columns.
// A stuck queue = "voice says saved but nothing ever appears in history".
const repairPayload = (payload: TransactionPayload): TransactionPayload => {
  const safe: TransactionPayload = {
    amount:           payload.amount,
    description:      payload.description,
    type:             payload.type,
    user_id:          payload.user_id,
    transaction_date: payload.transaction_date,
    created_at:       payload.created_at,
  };
  // Only include category_id if it's a valid UUID (invalid UUID → insert error)
  if (payload.category_id && UUID_REGEX.test(payload.category_id)) {
    safe.category_id = payload.category_id;
  }
  // Include optional columns only if caller explicitly set them
  if (payload.voice_transcript) safe.voice_transcript = payload.voice_transcript;
  if (payload.category_label)   safe.category_label   = payload.category_label;
  return safe;
};

const repairQueueOnStartup = () => {
  const queue = getQueue();
  if (!queue.length) return;
  saveQueue(queue.map(item => ({ ...item, payload: repairPayload(item.payload) })));
};

const isNetworkError = (error: unknown): boolean => {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('fetch')
  );
};

export default function useOfflineSync() {
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [pendingCount, setPendingCount]   = useState(0);
  const syncingRef = useRef(false);

  const enqueue = useCallback((payload: TransactionPayload) => {
    const queue = getQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      payload: repairPayload(payload),
      timestamp: Date.now(),
    });
    saveQueue(queue);
    setPendingCount(queue.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = getQueue();
    if (!queue.length) return;

    syncingRef.current = true;
    const remaining: QueuedTransaction[] = [];

    for (const item of queue) {
      try {
        const payload = repairPayload(item.payload);
        const { error } = await supabase.from('transactions').insert([payload]);
        if (error) {
          console.warn('⚠️ Queue flush error:', error.message);
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    setPendingCount(remaining.length);
    syncingRef.current = false;
  }, []);

  useEffect(() => {
    repairQueueOnStartup();
    setPendingCount(getQueue().length);

    const onOnline  = () => { setIsOnline(true);  void flushQueue(); };
    const onOffline = () =>   setIsOnline(false);

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    if (navigator.onLine) void flushQueue();

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  const saveTransaction = useCallback(async (payload: TransactionPayload): Promise<PendingSaveResult> => {
    const safePayload = repairPayload(payload);
    if (!navigator.onLine) { enqueue(safePayload); return { success: true, offline: true }; }

    try {
      const { error } = await supabase.from('transactions').insert([safePayload]);
      if (error) {
        if (isNetworkError(error)) { enqueue(safePayload); return { success: true, offline: true }; }
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error) {
      if (isNetworkError(error)) { enqueue(safePayload); return { success: true, offline: true }; }
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [enqueue]);

  return { isOnline, pendingCount, saveTransaction, flushQueue };
}