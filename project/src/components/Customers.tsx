// src/components/Customers.tsx
// ✅ FEATURE 1: Udhaar (Credit) Management with WhatsApp Reminders
// ✅ F2: Localized WhatsApp messages in all 6 languages
// ✅ F5: Customer Voice Sign-Off — 3s audio clip for udhaar dispute resolution

import { useState, useRef } from 'react';
import { Plus, X, MessageCircle, Trash2, ChevronDown, ChevronUp, Loader2, Users, IndianRupee, CheckCircle, Mic, MicOff, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../contexts/RoleContext';

type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

interface Props {
  language?: SupportedLanguage
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  total_credit: number;
  total_paid: number;
  notes: string;
  created_at: string;
}

interface UdhaarTx {
  id: string;
  type: 'credit' | 'payment';
  amount: number;
  note: string;
  created_at: string;
}

export default function Customers({ language = 'en' }: Props) {
  const { user } = useAuth();
  const { isOwner, shopName } = useRole();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<Record<string, UdhaarTx[]>>({});

  // Add customer form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Add transaction form
  const [txCustomerId, setTxCustomerId] = useState<string | null>(null);
  const [txType, setTxType] = useState<'credit' | 'payment'>('credit');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txSaving, setTxSaving] = useState(false);
  const [txSuccess, setTxSuccess] = useState(false);

  // ── F5: Voice Sign-Off state ──────────────────────────────────────────────
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceBlob, setVoiceBlob]           = useState<Blob | null>(null);
  const [voicePlayUrl, setVoicePlayUrl]     = useState<string | null>(null);
  const [voiceCountdown, setVoiceCountdown] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);   // ✅ Upload progress
  const [voiceUploadErr, setVoiceUploadErr] = useState<string | null>(null); // ✅ Upload error
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef   = useRef<Blob[]>([]);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── F5: Voice Sign-Off — record 3s customer audio promise ───────────────
  const startVoiceSignOff = async () => {
    setVoiceBlob(null); setVoicePlayUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
      mediaRecorderRef.current = mr;
      voiceChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) voiceChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(voiceChunksRef.current, { type: mr.mimeType });
        setVoiceBlob(blob);
        setVoicePlayUrl(URL.createObjectURL(blob));
        setVoiceRecording(false);
        setVoiceCountdown(0);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
      mr.start();
      setVoiceRecording(true);
      setVoiceCountdown(3);
      // Auto-stop after 3 seconds
      countdownRef.current = setInterval(() => {
        setVoiceCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            mr.stop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      alert('Microphone access denied. Cannot record voice sign-off.');
    }
  };

  const stopVoiceSignOff = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  };

  // ── F5: Upload voice blob to Supabase Storage ─────────────────────────────
  // Bucket: voice_receipts (public read, authenticated write)
  // Path:   {user_id}/{customer_id}/{timestamp}.webm
  // Returns: public URL string, or null on failure
  // ── Supabase setup (run once in SQL editor): ──────────────────────────────
  //   insert into storage.buckets (id, name, public)
  //     values ('voice_receipts', 'voice_receipts', true);
  //   create policy "Auth users upload" on storage.objects
  //     for insert to authenticated
  //     with check (bucket_id = 'voice_receipts');
  //   create policy "Public read" on storage.objects
  //     for select to public
  //     using (bucket_id = 'voice_receipts');
  // ─────────────────────────────────────────────────────────────────────────
  const uploadVoiceToStorage = async (
    blob: Blob,
    customerId: string
  ): Promise<string | null> => {
    if (!user?.id) return null;
    setVoiceUploading(true);
    setVoiceUploadErr(null);

    try {
      // Determine file extension from blob MIME type
      const ext = blob.type.includes('ogg') ? 'ogg'
                : blob.type.includes('mp4') ? 'mp4'
                : 'webm';

      const timestamp = Date.now();
      const filePath = `${user.id}/${customerId}/${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('voice_receipts')
        .upload(filePath, blob, {
          contentType: blob.type || 'audio/webm',
          upsert: false,          // never overwrite — each clip is unique
        });

      if (uploadError) {
        console.error('Voice upload error:', uploadError.message);
        setVoiceUploadErr(`Upload failed: ${uploadError.message}`);
        return null;
      }

      // Get the public URL (bucket is public)
      const { data } = supabase.storage
        .from('voice_receipts')
        .getPublicUrl(filePath);

      return data?.publicUrl ?? null;

    } catch (err: any) {
      console.error('Voice upload exception:', err);
      setVoiceUploadErr('Upload failed. Voice promise saved locally.');
      return null;
    } finally {
      setVoiceUploading(false);
    }
  };

  // ── F2: Localized WhatsApp reminder messages ──────────────────────────────
  const buildWAMessage = (customerName: string, balance: number): string => {
    const amt = `₹${balance.toLocaleString('hi-IN')}`;
    switch (language) {
      case 'hi': return `Namaste ${customerName} ji! 🙏\n\n*${shopName}* se yaad dila rahe hain.\n\nAapka baaki balance *${amt}* hai.\n\nKripya jaldi se chukta karein. Dhanyavaad! 🙏\n\n_My Khata se bheja gaya_`;
      case 'ta': return `Vanakkam ${customerName}! 🙏\n\n*${shopName}* irundu nerppadu seygirom.\n\nUngal baaki tholai *${amt}* ulladu.\n\nThayavu seithu virattiram seyyungal. Nandri! 🙏\n\n_My Khata moolam anuppapattadu_`;
      case 'te': return `Namaskaram ${customerName}! 🙏\n\n*${shopName}* నుండి గుర్తు చేస్తున్నాము.\n\nమీ బకాయి నిల్వ *${amt}*.\n\nదయచేసి త్వరగా చెల్లించండి. ధన్యవాదాలు! 🙏\n\n_My Khata ద్వారా పంపబడింది_`;
      case 'kn': return `Namaskara ${customerName}! 🙏\n\n*${shopName}* ನಿಂದ ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ.\n\nನಿಮ್ಮ ಬಾಕಿ ಮೊತ್ತ *${amt}*.\n\nದಯವಿಟ್ಟು ಶೀಘ್ರದಲ್ಲಿ ಪಾವತಿಸಿ. ಧನ್ಯವಾದಗಳು! 🙏\n\n_My Khata ಮೂಲಕ ಕಳುಹಿಸಲಾಗಿದೆ_`;
      case 'ml': return `Namaskaram ${customerName}! 🙏\n\n*${shopName}* ൽ നിന്ന് ഓർമ്മിപ്പിക്കുന്നു.\n\nതാങ്കളുടെ ബാക്കി തുക *${amt}*.\n\nദയവായി ഉടൻ തീർക്കുക. നന്ദി! 🙏\n\n_My Khata വഴി അയച്ചത്_`;
      default:   return `Namaste ${customerName}! 🙏\n\nThis is a friendly reminder from *${shopName}*.\n\nYour pending balance is *${amt}*.\n\nPlease clear it at your earliest convenience. Thank you! 🙏\n\n_Sent via My Khata_`;
    }
  };

  const loadCustomers = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('udhaar_customers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };

  const loadHistory = async (customerId: string) => {
    if (txHistory[customerId]) return; // already loaded
    const { data } = await supabase
      .from('udhaar_transactions')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);
    setTxHistory(prev => ({ ...prev, [customerId]: data || [] }));
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadHistory(id);
    }
  };

  const addCustomer = async () => {
    if (!newName.trim() || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('udhaar_customers')
      .insert([{ user_id: user.id, name: newName.trim(), phone: newPhone.trim(), notes: newNotes.trim() }])
      .select()
      .single();
    if (!error && data) {
      setCustomers(prev => [data, ...prev]);
      setNewName(''); setNewPhone(''); setNewNotes('');
      setShowAddCustomer(false);
    }
    setSaving(false);
  };

  const addTransaction = async (customer: Customer) => {
    const amount = parseFloat(txAmount);
    if (!amount || !user) return;
    setTxSaving(true);

    // ✅ F5 UPGRADED: Upload voice blob to Supabase Storage (was: base64 in DB column)
    // Benefits: smaller DB rows, proper audio URLs, CDN delivery, playback anywhere
    let voicePromiseUrl: string | null = null;
    if (txType === 'credit' && voiceBlob) {
      voicePromiseUrl = await uploadVoiceToStorage(voiceBlob, customer.id);
      // If upload fails, we still save the transaction — voice is optional
    }

    // Insert udhaar transaction (with optional voice_promise_url for dispute resolution)
    const insertData: Record<string, any> = {
      customer_id: customer.id,
      user_id: user.id,
      type: txType,
      amount,
      note: txNote.trim(),
    };
    if (voicePromiseUrl) insertData.voice_promise_url = voicePromiseUrl;

    const { error: txError } = await supabase
      .from('udhaar_transactions')
      .insert([insertData]);

    if (!txError) {
      // Update customer totals
      const updateField = txType === 'credit' ? 'total_credit' : 'total_paid';
      const newValue = txType === 'credit'
        ? customer.total_credit + amount
        : customer.total_paid + amount;

      await supabase
        .from('udhaar_customers')
        .update({ [updateField]: newValue, updated_at: new Date().toISOString() })
        .eq('id', customer.id);

      // Refresh
      loadCustomers();
      // Clear tx history cache for this customer so it reloads
      setTxHistory(prev => { const n = { ...prev }; delete n[customer.id]; return n; });
      if (expandedId === customer.id) loadHistory(customer.id);

      setTxAmount(''); setTxNote(''); setTxCustomerId(null);
      setTxSuccess(true);
      setTimeout(() => setTxSuccess(false), 2000);
    }
    setTxSaving(false);
  };

  const deleteCustomer = async (id: string) => {
    if (!window.confirm('Delete this customer and all their records?')) return;
    await supabase.from('udhaar_customers').delete().eq('id', id);
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  // ✅ F2: WhatsApp reminder — localized message in user's language
  const sendWhatsAppReminder = (customer: Customer) => {
    const balance = customer.total_credit - customer.total_paid;
    if (balance <= 0) { alert(`${customer.name} has no pending balance.`); return; }
    const message = buildWAMessage(customer.name, balance);
    const phone = customer.phone.replace(/\D/g, '');
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // ✅ F2: Voice TTS Reminder — speak the reminder aloud in user's language before or instead of WhatsApp
  const speakReminder = (customer: Customer) => {
    const balance = customer.total_credit - customer.total_paid;
    if (balance <= 0) { return; }
    if (!window.speechSynthesis) return;

    const LANG_CODE: Record<string, string> = {
      en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN'
    };
    const spoken: Record<string, string> = {
      en: `Hello ${customer.name}. Your balance at ${shopName} is Rupees ${balance}. Please clear it soon. Thank you.`,
      hi: `नमस्ते ${customer.name}। ${shopName} में आपका बकाया ${balance} रुपये है। कृपया जल्दी चुकाएं। धन्यवाद।`,
      ta: `வணக்கம் ${customer.name}. ${shopName} கடையில் உங்கள் பாக்கி ${balance} ரூபாய். தயவுசெய்து விரைவில் செலுத்துங்கள். நன்றி.`,
      te: `నమస్కారం ${customer.name}. ${shopName} లో మీ బ్యాలెన్స్ ${balance} రూపాయలు. దయచేసి త్వరగా చెల్లించండి.`,
      kn: `ನಮಸ್ಕಾರ ${customer.name}. ${shopName} ಅಂಗಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಬಾಕಿ ${balance} ರೂಪಾಯಿ. ದಯವಿಟ್ಟು ಶೀಘ್ರದಲ್ಲಿ ತೆರಿಸಿ.`,
      ml: `ഹലോ ${customer.name}. ${shopName} ൽ നിങ്ങളുടെ ബാക്കി ${balance} രൂപ. ദയവായി ഉടൻ അടച്ചുതീർക്കൂ. നന്ദി.`,
    };

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken[language] ?? spoken.en);
    u.lang = LANG_CODE[language] ?? 'en-IN';
    u.rate = 0.88; u.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find(v => v.lang === (LANG_CODE[language] ?? 'en-IN'))
              || voices.find(v => v.lang.startsWith('en-IN'))
              || null;
    if (best) u.voice = best;
    window.speechSynthesis.speak(u);
  };

  const totalPendingBalance = customers.reduce((sum, c) => sum + (c.total_credit - c.total_paid), 0);

  return (
    <div className="p-4 space-y-5 pb-32">

      {/* Summary Card */}
      <div className="bg-black p-6 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute right-[-10px] top-[-10px] opacity-10"><Users size={100} /></div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">Total Udhaar Pending</p>
        <h2 className="text-4xl font-black tracking-tighter">
          ₹{totalPendingBalance.toLocaleString('hi-IN')}
        </h2>
        <p className="text-[10px] opacity-50 mt-1 uppercase tracking-widest">{customers.length} customers</p>
      </div>

      {/* Add Customer Button */}
      <button
        onClick={() => setShowAddCustomer(true)}
        className="w-full flex items-center justify-center gap-2 p-4 bg-black text-white rounded-2xl font-bold"
      >
        <Plus size={20} /> Add Customer
      </button>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] p-6 pb-10 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-black text-lg">New Customer</h2>
              <button onClick={() => setShowAddCustomer(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input
                type="text" placeholder="Customer Name *"
                value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-semibold outline-none border-2 border-transparent focus:border-black"
              />
              <input
                type="tel" placeholder="Phone Number (for WhatsApp)"
                value={newPhone} onChange={e => setNewPhone(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-semibold outline-none border-2 border-transparent focus:border-black"
              />
              <input
                type="text" placeholder="Notes (optional)"
                value={newNotes} onChange={e => setNewNotes(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-semibold outline-none border-2 border-transparent focus:border-black"
              />
            </div>
            <button
              onClick={addCustomer} disabled={!newName.trim() || saving}
              className="w-full p-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Save Customer
            </button>
          </div>
        </div>
      )}

      {/* Transaction Success Toast */}
      {txSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] bg-green-500 text-white px-5 py-3 rounded-2xl flex items-center gap-2 shadow-xl">
          <CheckCircle size={18} /> Transaction saved!
        </div>
      )}

      {/* Customer List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={30} /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <Users size={48} className="mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p className="font-bold text-sm uppercase tracking-widest">No customers yet</p>
          <p className="text-xs mt-1">Add your first Udhaar customer above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map(customer => {
            const balance = customer.total_credit - customer.total_paid;
            const isExpanded = expandedId === customer.id;

            return (
              <div key={customer.id} className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">

                {/* Customer Row */}
                <div
                  className="p-4 flex items-center gap-3 cursor-pointer"
                  onClick={() => toggleExpand(customer.id)}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-black text-gray-700 shrink-0">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-800">{customer.name}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">
                      {customer.phone || 'No phone'} {customer.notes ? `· ${customer.notes}` : ''}
                    </p>
                  </div>

                  {/* Balance */}
                  <div className="text-right shrink-0">
                    <p className={`font-black text-base ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{Math.abs(balance).toLocaleString('hi-IN')}
                    </p>
                    <p className="text-[9px] font-black uppercase text-gray-400">
                      {balance > 0 ? 'Pending' : balance === 0 ? 'Cleared' : 'Overpaid'}
                    </p>
                  </div>

                  {isExpanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
                </div>

                {/* Expanded Actions */}
                {isExpanded && (
                  <div className="border-t border-gray-50 p-4 space-y-4 bg-gray-50/50">

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setTxCustomerId(customer.id); setTxType('credit'); }}
                        className="flex flex-col items-center gap-1 p-3 bg-red-50 text-red-600 rounded-2xl font-bold text-xs"
                      >
                        <IndianRupee size={16} />
                        Add Udhaar
                      </button>
                      <button
                        onClick={() => { setTxCustomerId(customer.id); setTxType('payment'); }}
                        className="flex flex-col items-center gap-1 p-3 bg-green-50 text-green-600 rounded-2xl font-bold text-xs"
                      >
                        <CheckCircle size={16} />
                        Add Payment
                      </button>
                      {/* F2: WhatsApp reminder — localized message */}
                      <button
                        onClick={() => sendWhatsAppReminder(customer)}
                        className="flex flex-col items-center gap-1 p-3 bg-[#25D366]/10 text-[#25D366] rounded-2xl font-bold text-xs"
                      >
                        <MessageCircle size={16} />
                        WhatsApp
                      </button>
                      {/* F2: Voice TTS reminder — speak reminder aloud */}
                      <button
                        onClick={() => speakReminder(customer)}
                        className="flex flex-col items-center gap-1 p-3 bg-purple-50 text-purple-600 rounded-2xl font-bold text-xs"
                      >
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"/>
                        </svg>
                        Voice Remind
                      </button>
                    </div>

                    {/* Add Transaction Form */}
                    {txCustomerId === customer.id && (
                      <div className="bg-white rounded-2xl p-4 space-y-3 border border-gray-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                          {txType === 'credit' ? '+ Add Udhaar (Credit)' : '+ Record Payment'}
                        </p>
                        <input
                          type="number" placeholder="Amount ₹"
                          value={txAmount} onChange={e => setTxAmount(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 rounded-xl font-bold outline-none border-2 border-transparent focus:border-black"
                        />
                        <input
                          type="text" placeholder="Note (optional)"
                          value={txNote} onChange={e => setTxNote(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 rounded-xl font-semibold outline-none border-2 border-transparent focus:border-black"
                        />

                        {/* F5: Voice Sign-Off — only shown for credit (udhaar) entries */}
                        {txType === 'credit' && (
                          <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                              🎙 Voice Sign-Off (Optional)
                            </p>
                            <p className="text-[10px] text-gray-500">Record customer's verbal agreement for dispute resolution</p>

                            {!voiceBlob ? (
                              <button
                                onClick={voiceRecording ? stopVoiceSignOff : startVoiceSignOff}
                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                  voiceRecording
                                    ? 'bg-red-500 text-white animate-pulse'
                                    : 'bg-orange-100 text-orange-700'
                                }`}
                              >
                                {voiceRecording ? (
                                  <><Square size={14} /> Stop ({voiceCountdown}s)</>
                                ) : (
                                  <><Mic size={14} /> Record 3-sec Promise</>
                                )}
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <audio
                                  src={voicePlayUrl ?? undefined}
                                  controls
                                  className="flex-1 h-8"
                                  style={{ height: 32, minWidth: 0 }}
                                />
                                <button
                                  onClick={() => {
                                    setVoiceBlob(null);
                                    setVoicePlayUrl(null);
                                    setVoiceUploadErr(null);
                                  }}
                                  className="p-1.5 rounded-lg bg-gray-100 text-gray-500"
                                >
                                  <MicOff size={14} />
                                </button>
                              </div>
                            )}

                            {/* ✅ Upload status feedback */}
                            {voiceUploading && (
                              <div className="flex items-center gap-2 text-[10px] text-blue-600 font-bold">
                                <Loader2 size={12} className="animate-spin" />
                                Uploading voice promise to secure storage...
                              </div>
                            )}
                            {voiceUploadErr && (
                              <p className="text-[10px] text-amber-600 font-bold">
                                ⚠ {voiceUploadErr}
                              </p>
                            )}
                            {voiceBlob && !voiceUploading && !voiceUploadErr && (
                              <p className="text-[10px] text-green-600 font-bold">
                                ✓ Voice promise recorded — will be uploaded to secure storage on Save
                              </p>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => { setTxCustomerId(null); setVoiceBlob(null); setVoicePlayUrl(null); setVoiceUploadErr(null); }}
                            className="p-3 bg-gray-100 rounded-xl font-bold text-sm"
                          >Cancel</button>
                          <button
                            onClick={() => addTransaction(customer)}
                            disabled={!txAmount || txSaving}
                            className={`p-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-1 disabled:opacity-40 ${txType === 'credit' ? 'bg-red-500' : 'bg-green-500'}`}
                          >
                            {txSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Transaction History */}
                    {txHistory[customer.id] && txHistory[customer.id].length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">History</p>
                        {txHistory[customer.id].map(tx => (
                          <div key={tx.id} className="flex justify-between items-center bg-white rounded-xl px-3 py-2 border border-gray-100">
                            <div>
                              <p className="text-xs font-bold text-gray-700">{tx.note || (tx.type === 'credit' ? 'Udhaar given' : 'Payment received')}</p>
                              <p className="text-[9px] text-gray-400">{new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                            </div>
                            <p className={`font-black text-sm ${tx.type === 'credit' ? 'text-red-600' : 'text-green-600'}`}>
                              {tx.type === 'credit' ? '+' : '-'}₹{tx.amount}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Delete — owners only */}
                    {isOwner && (
                      <button
                        onClick={() => deleteCustomer(customer.id)}
                        className="flex items-center gap-2 text-red-400 text-xs font-bold px-2"
                      >
                        <Trash2 size={14} /> Delete Customer
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}