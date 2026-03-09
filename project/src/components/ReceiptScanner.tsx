// components/ReceiptScanner.tsx
// Scan a paper bill/receipt using Gemini Vision and auto-save the transaction

import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, CheckCircle, ScanLine, Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { scanReceipt } from '../lib/gemini';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  language?: string;
}

export default function ReceiptScanner({ onClose, onSaved, language: _language = 'en' }: Props) {
  const { user } = useAuth();
  const [scanning, setScanning]   = useState(false);
  const [preview, setPreview]     = useState<string | null>(null);
  const [result, setResult]       = useState<{
    amount: number; description: string; category: string; date: string
  } | null>(null);
  // Editable fields so user can fix AI mistakes before saving
  const [editAmount, setEditAmount]           = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType]               = useState<'income' | 'expense'>('expense');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File) => {
    setScanning(true); setError(''); setResult(null);
    try {
      const mime = file.type || 'image/jpeg';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPreview(URL.createObjectURL(file));

      const scanned = await scanReceipt(base64, mime);
      if (!scanned || scanned.amount === 0) {
        setError('Could not read the receipt clearly. Please try a clearer photo.');
        return;
      }
      setResult(scanned);
      // Pre-fill editable fields
      setEditAmount(String(scanned.amount));
      setEditDescription(scanned.description);
      setEditType('expense');
    } catch (err) {
      console.error('Receipt scan error:', err);
      setError('Scanning failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processImage(file);
  };

  // ✅ FIX: Schema-resilient save — no category_id (was passing string like
  // "Groceries" into a UUID column → silent insert failure).
  // Tries full save first; on column error retries with minimal core fields.
  const saveTransaction = async () => {
    if (!result || !user) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) { setError('Please enter a valid amount.'); return; }

    setSaving(true); setError('');
    const now = new Date().toISOString();

    const fullRow = {
      amount,
      description: editDescription || result.description,
      type:        editType,
      user_id:     user.id,
      transaction_date: result.date || now.split('T')[0],
      created_at:  now,
      // voice_transcript intentionally omitted — this is a receipt, not voice
    };

    try {
      const { error: e1 } = await supabase.from('transactions').insert([fullRow]);
      if (!e1) {
        setSaved(true);
        setTimeout(() => { onSaved(); onClose(); }, 1500);
        return;
      }

      // If column error → retry with minimal safe fields
      const msg = e1.message.toLowerCase();
      if (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema')) {
        const minRow = {
          amount,
          description: editDescription || result.description,
          type:        editType,
          user_id:     user.id,
          transaction_date: result.date || now.split('T')[0],
          created_at:  now,
        };
        const { error: e2 } = await supabase.from('transactions').insert([minRow]);
        if (!e2) {
          setSaved(true);
          setTimeout(() => { onSaved(); onClose(); }, 1500);
          return;
        }
        setError('Save failed: ' + e2.message);
      } else {
        setError('Save failed: ' + e1.message);
      }
    } catch (err: any) {
      setError('Save failed: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] p-6 pb-10 space-y-5 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ScanLine className="text-black" size={22} />
            <h2 className="font-black text-lg tracking-tight">Scan Receipt</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Image Preview */}
        {preview && (
          <div className="w-full h-44 rounded-2xl overflow-hidden bg-gray-100">
            <img src={preview} alt="Receipt" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Scanning */}
        {scanning && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="animate-spin text-black" size={32} />
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Reading receipt...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-600 text-sm font-semibold">{error}</p>
          </div>
        )}

        {/* Editable scan result */}
        {result && !scanning && !saved && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Edit3 size={13} className="text-gray-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Review & Edit Before Saving</p>
            </div>

            {/* Amount */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500 font-semibold shrink-0">Amount ₹</span>
              <input
                type="number"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="font-black text-xl text-right flex-1 bg-transparent outline-none text-red-600"
                placeholder="0"
              />
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-xs text-gray-400 font-semibold mb-1">Description</p>
              <input
                type="text"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="font-bold text-gray-800 bg-transparent outline-none w-full"
                placeholder="What did you buy?"
              />
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditType('expense')}
                className={`flex-1 rounded-2xl py-3 font-black text-sm transition-all ${
                  editType === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                📤 Expense
              </button>
              <button
                onClick={() => setEditType('income')}
                className={`flex-1 rounded-2xl py-3 font-black text-sm transition-all ${
                  editType === 'income' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                💰 Income
              </button>
            </div>

            {/* Info row */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-400">Category: <span className="font-bold text-gray-600">{result.category}</span></span>
              <span className="text-xs text-gray-400">Date: <span className="font-bold text-gray-600">{result.date}</span></span>
            </div>
          </div>
        )}

        {/* Success */}
        {saved && (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle className="text-green-500" size={44} />
            <p className="font-black text-green-600 text-lg">Saved!</p>
          </div>
        )}

        {/* Buttons — initial state (no image yet) */}
        {!result && !scanning && !saved && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 bg-black text-white rounded-2xl font-bold active:scale-95 transition-all"
            >
              <Camera size={24} />
              <span className="text-sm">Take Photo</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 bg-gray-100 text-gray-800 rounded-2xl font-bold active:scale-95 transition-all"
            >
              <Upload size={24} />
              <span className="text-sm">Upload Image</span>
            </button>
          </div>
        )}

        {/* Buttons — after scan result */}
        {result && !saved && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setResult(null); setPreview(null); setError(''); }}
              className="p-4 bg-gray-100 text-gray-700 rounded-2xl font-bold active:scale-95"
            >
              Rescan
            </button>
            <button
              onClick={() => void saveTransaction()}
              disabled={saving}
              className="p-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              Save
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={fileInputRef}   type="file" accept="image/*"                         className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}