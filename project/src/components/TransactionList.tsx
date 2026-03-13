import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar, Trash2, Search, SlidersHorizontal, X } from 'lucide-react';
import { supabase, Transaction } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

const CATEGORIES = [
  { id: 'all',        emoji: '📋', color: 'bg-gray-900 text-white',     inactive: 'bg-white text-slate-400 border border-gray-200',     label: { en:'All',         hi:'सभी',       ta:'அனைத்தும்',   te:'అన్నీ',       kn:'ಎಲ್ಲಾ',    ml:'എല്ലാം'       }, keywords: [],          typeFilter: undefined as 'income'|'expense'|undefined },
  { id: 'groceries',  emoji: '🛒', color: 'bg-green-600 text-white',    inactive: 'bg-navy-800 text-green-400 border border-navy-600',    label: { en:'Groceries',   hi:'किराना',    ta:'மளிகை',       te:'కిరాణా',      kn:'ಕಿರಾಣಾ',   ml:'പലചരക്ക്'    }, typeFilter: undefined,
    keywords: ['rice','wheat','flour','dal','sugar','salt','oil','ghee','atta','maida','besan','arisi','paruppu','akki','biyyam','chawal','sabzi','sabji','grocery','groceries','provision','ration','toor','chana','urad','moong','sago','vermicelli','rava','sooji','semolina','starch','cornflour','bread','biscuit','noodles','pasta','cornflakes','oats','powder','masala','podi','pudi','haldi','turmeric','manjal','jeera','cumin','coriander','dhaniya','cinnamon','cardamom','cloves','saunf','fennel','ajwain','mustard','rai','kadugu','methi','fenugreek','tamarind','garam','spice','spices','chilli powder','mirchi powder','red chilli','green chilli'],
  },
  { id: 'vegetables', emoji: '🥦', color: 'bg-emerald-600 text-white',  inactive: 'bg-navy-800 text-emerald-400 border border-navy-600', label: { en:'Vegetables',  hi:'सब्जी',     ta:'காய்கறி',     te:'కూరగాయలు',    kn:'ತರಕಾರಿ',   ml:'പച്ചക്കറി'   }, typeFilter: undefined,
    keywords: ['tomato','thakkali','onion','vengayam','pyaz','ullipaya','eerulli','ulli','potato','urulai','aloo','batata','urulaikizhangu','carrot','gajar','beans','payar','cabbage','cauliflower','gobi','brinjal','katharikai','vankaya','spinach','keerai','cheera','palak','vegetable','veggie','mirchi','chilli','mulagu','mulak','pachi mirchi','pepper','drumstick','muringakka','okra','bendakaya','bendekayi','bitter gourd','pavakkai','pumpkin','bottlegourd','lauki','dudhi','yam','chena','colocasia','taro','drumstick','radish','mullangi','mooli','cucumber','vellarikkai','kakdi','beetroot','beetroot','celery','leek','spring onion','capsicum','shimla'],
  },
  { id: 'fruits',     emoji: '🍎', color: 'bg-orange-500 text-white',   inactive: 'bg-navy-800 text-orange-400 border border-navy-600',   label: { en:'Fruits',      hi:'फल',        ta:'பழம்',         te:'పండ్లు',      kn:'ಹಣ್ಣು',    ml:'പഴം'         }, typeFilter: undefined,
    keywords: ['apple','banana','mango','manga','orange','grape','papaya','pineapple','watermelon','guava','pomegranate','fruit','pazham','chakka','jackfruit','sapota','chikoo','lychee','strawberry','kiwi','dates','fig','coconut','thengai','tender coconut','pear','plum','peach','custard apple','sitaphal'],
  },
  { id: 'fuel',       emoji: '⛽', color: 'bg-yellow-600 text-white',   inactive: 'bg-navy-800 text-yellow-400 border border-navy-600',   label: { en:'Fuel',        hi:'ईंधन',      ta:'எரிபொருள்',   te:'ఇంధనం',       kn:'ಇಂಧನ',     ml:'ഇന്ധനം'      }, typeFilter: undefined,
    keywords: ['petrol','petrool','diesel','fuel','gas','cng','lpg','benzine','filling','bunk'],
  },
  { id: 'food',       emoji: '🍽️', color: 'bg-red-500 text-white',     inactive: 'bg-navy-800 text-red-400 border border-navy-600',         label: { en:'Food',        hi:'खाना',      ta:'சாப்பாடு',    te:'భోజనం',       kn:'ಊಟ',       ml:'ഭക്ഷണം'      }, typeFilter: undefined,
    keywords: ['food','restaurant','hotel','cafe','coffee','tea','chai','juice','water','milk','paal','saapadu','sapadu','lunch','dinner','breakfast','snack','biryani','dosa','idli','tiffin','mess','canteen','sweets','mithai','parota','chapati','naan','roti','puri','vada','sambar','rasam','curry','kulambu','kuzhambu','chicken','mutton','fish','meen','egg','muttai','prawns','crab','biriyani','fried rice','noodles','pizza','burger','sandwich','ice cream','sweets','halwa','payasam','kheer','laddu','mysore pak','gulab jamun'],
  },
  { id: 'medicine',   emoji: '💊', color: 'bg-blue-600 text-white',     inactive: 'bg-navy-800 text-blue-400 border border-navy-600',       label: { en:'Medicine',    hi:'दवाई',      ta:'மருந்து',     te:'మందు',        kn:'ಔಷಧ',      ml:'മരുന്ന്'      }, typeFilter: undefined,
    keywords: ['medicine','tablet','capsule','syrup','injection','pharmacy','hospital','doctor','clinic','health','medical','marundu','marunthu','dawai','dawa','chemist','drug','aushadham','dakthar','nursing home','scan','xray','blood test','lab','operation','surgery','dental','eye','ear'],
  },
  { id: 'transport',  emoji: '🚌', color: 'bg-purple-600 text-white',   inactive: 'bg-navy-800 text-purple-400 border border-navy-600',   label: { en:'Transport',   hi:'यातायात',   ta:'போக்குவரத்து',te:'రవాణా',       kn:'ಸಾರಿಗೆ',   ml:'ഗതാഗതം'      }, typeFilter: undefined,
    keywords: ['bus','auto','taxi','cab','uber','ola','metro','train','ticket','travel','transport','fare','rickshaw','bike','vehicle','parking','toll','rapido','share auto','van','lorry','truck','flight','air','airport','railway','ksrtc','setc','tnstc'],
  },
  { id: 'income',     emoji: '💰', color: 'bg-teal-600 text-white',     inactive: 'bg-navy-800 text-teal-400 border border-navy-600',       label: { en:'Income',      hi:'आमदनी',     ta:'வருமானம்',    te:'ఆదాయం',       kn:'ಆದಾಯ',     ml:'വരുമാനം'     }, keywords: [], typeFilter: 'income'  as 'income'|'expense'|undefined },
  { id: 'expense',    emoji: '📤', color: 'bg-rose-600 text-white',     inactive: 'bg-navy-800 text-rose-400 border border-navy-600',       label: { en:'Expense',     hi:'खर्च',      ta:'செலவு',       te:'ఖర్చు',       kn:'ಖರ್ಚು',    ml:'ചെലവ്'       }, keywords: [], typeFilter: 'expense' as 'income'|'expense'|undefined },
]

const detectCategory = (desc: string, type: string): string => {
  if (!desc) return type === 'income' ? 'income' : 'expense'
  const lower = desc.toLowerCase()

  // ── PRIORITY OVERRIDE: "powder", "masala", "spice" forms → always Groceries ──
  // "chilli powder", "turmeric powder", "garam masala", etc. are pantry staples
  // NOT fresh vegetables, even if the base word (chilli/mirchi) is in Vegetables list
  const POWDER_FORMS = ['powder','masala','podi','pudi','spice','dried','dry ','garam','sambar podi','rasam podi','curry powder','chilli powder','mirchi powder','mulagu podi','turmeric','manjal','haldi','jeera','cumin','coriander','dhaniya','cinnamon','cardamom','cloves','saunf','fennel','ajwain','mustard','rai','kadugu','methi','fenugreek','tamarind powder']
  if (POWDER_FORMS.some(p => lower.includes(p))) return 'groceries'

  for (const cat of CATEGORIES) {
    if (cat.id === 'all' || cat.id === 'income' || cat.id === 'expense') continue
    if (cat.keywords.some(kw => lower.includes(kw))) return cat.id
  }
  return type === 'income' ? 'income' : 'expense'
}

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.054 23.454a.75.75 0 0 0 .918.919l5.656-1.484A11.955 11.955 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.686-.525-5.207-1.435l-.374-.22-3.875 1.016 1.03-3.77-.242-.39A9.955 9.955 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
  </svg>
)

// ✅ Added refreshKey prop — loadTransactions() re-fires when it changes
// This is more reliable than key={refreshKey} remount (no flicker, guaranteed refetch)
interface Props { language?: SupportedLanguage; refreshKey?: number }

export default function TransactionList({ language = 'en', refreshKey = 0 }: Props) {
  const { user } = useAuth()
  const [transactions, setTransactions]     = useState<Transaction[]>([])
  const [loading, setLoading]               = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchText, setSearchText]         = useState('')
  const [showSearch, setShowSearch]         = useState(false)
  const lang = language as SupportedLanguage

  const loadTransactions = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions').select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) console.error('TransactionList load error:', error)
    else setTransactions(data || [])
    setLoading(false)
  }, [user])

  // ✅ Depends on both user AND refreshKey — re-fetches whenever parent bumps refreshKey
  useEffect(() => { void loadTransactions() }, [loadTransactions, refreshKey])

  const deleteTransaction = async (id: string) => {
    if (!window.confirm('Delete this transaction?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) alert('Delete failed: ' + error.message)
    else setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const shareOnWhatsApp = (t: Transaction) => {
    const msg = `${t.type === 'income' ? 'Received' : 'Spent'} ₹${t.amount} — ${t.description || 'Voice entry'} on ${t.transaction_date}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const filtered = useMemo(() => {
    let list = transactions
    if (activeCategory !== 'all') {
      const cat = CATEGORIES.find(c => c.id === activeCategory)
      if (cat) {
        if (cat.typeFilter) list = list.filter(t => t.type === cat.typeFilter)
        else list = list.filter(t => detectCategory(t.description || '', t.type) === activeCategory)
      }
    }
    if (searchText.trim()) {
      const s = searchText.toLowerCase()
      list = list.filter(t =>
        (t.description || '').toLowerCase().includes(s) ||
        String(t.amount).includes(s) ||
        (t.voice_transcript || '').toLowerCase().includes(s)
      )
    }
    return list
  }, [transactions, activeCategory, searchText])

  const totalIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
    </div>
  )

  const activeCat = CATEGORIES.find(c => c.id === activeCategory) ?? CATEGORIES[0]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-navy-900">

      {/* Header */}
      <div className="bg-navy-800 border-b border-navy-600 px-4 pt-4 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">History</h2>
          <div className="flex items-center gap-2">
            {/* Manual refresh button */}
            <button
              onClick={() => void loadTransactions()}
              className="rounded-xl p-2 bg-gray-100 text-slate-400 active:bg-gray-200"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => { setShowSearch(v => !v); setSearchText('') }}
              className={`rounded-xl p-2 transition-all ${showSearch ? 'bg-cyan text-navy-950' : 'bg-gray-100 text-slate-400'}`}
            >
              {showSearch ? <X size={16} /> : <Search size={16} />}
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-navy-800 border border-navy-600 px-4 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search by item, amount..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {searchText && <button onClick={() => setSearchText('')}><X size={14} className="text-slate-400" /></button>}
          </div>
        )}

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black transition-all ${
                activeCategory === cat.id ? cat.color : cat.inactive
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{(cat.label as Record<string, string>)[lang] ?? (cat.label as Record<string, string>)['en']}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex gap-2 px-4 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-green-50 px-3 py-2">
            <TrendingUp size={14} className="text-green-600" />
            <div>
              <p className="text-[9px] font-black uppercase text-green-600">In</p>
              <p className="text-sm font-black text-green-700">{fmt(totalIncome)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-red-50 px-3 py-2">
            <TrendingDown size={14} className="text-red-500" />
            <div>
              <p className="text-[9px] font-black uppercase text-red-500">Out</p>
              <p className="text-sm font-black text-red-600">{fmt(totalExpense)}</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Net</p>
              <p className={`text-sm font-black ${totalIncome - totalExpense >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmt(Math.abs(totalIncome - totalExpense))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 text-4xl">{activeCat.emoji}</div>
            <p className="font-bold text-slate-400">No {(activeCat.label as Record<string, string>)[lang] ?? (activeCat.label as Record<string, string>)['en']} transactions</p>
            <p className="mt-1 text-xs text-slate-400">
              {searchText ? `No results for "${searchText}"` : 'Use the mic to add one'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {filtered.map(t => {
              const catId = detectCategory(t.description || '', t.type)
              const cat   = CATEGORIES.find(c => c.id === catId) ?? CATEGORIES[0]
              return (
                <div key={t.id} className="rounded-3xl bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl ${
                      t.type === 'income' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {cat.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white leading-tight">
                        {t.description || 'Voice entry'}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Calendar size={10} className="text-gray-300" />
                        <span className="text-[11px] text-slate-400">{formatDate(t.transaction_date)}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase ${
                          t.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}>{(cat.label as Record<string, string>)[lang] ?? (cat.label as Record<string, string>)['en']}</span>
                      </div>
                      {t.voice_transcript && (
                        <p className="mt-1 text-[10px] text-blue-400 italic truncate">🎤 {t.voice_transcript}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className={`text-base font-black ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => shareOnWhatsApp(t)} className="rounded-lg p-1.5 text-[#25D366] active:bg-green-50">
                          <WhatsAppIcon />
                        </button>
                        <button onClick={() => deleteTransaction(t.id)} className="rounded-lg p-1.5 text-gray-300 active:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}