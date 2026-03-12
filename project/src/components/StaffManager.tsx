import { useCallback, useEffect, useState } from 'react';
import { Crown, Loader2, ShieldCheck, Trash2, User, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { StaffAccessRecord } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useRole } from '../contexts/RoleContext';

export default function StaffManager() {
  const { user } = useAuth();
  const { isOwner, isStaff, shopName, updateShopName } = useRole();
  const [staffList, setStaffList] = useState<StaffAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingShop, setEditingShop] = useState(false);
  const [shopInput, setShopInput] = useState(shopName);

  useEffect(() => {
    setShopInput(shopName);
  }, [shopName]);

  const loadStaff = useCallback(async () => {
    if (!user?.id || !isOwner) {
      setStaffList([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('staff_access')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    setStaffList((data || []) as StaffAccessRecord[]);
    setLoading(false);
  }, [isOwner, user?.id]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const addStaff = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !user?.id) {
      return;
    }

    if (staffList.some((member) => member.staff_email.toLowerCase() === email && member.status !== 'revoked')) {
      alert('This email is already added.');
      return;
    }

    setAdding(true);
    const { data, error } = await supabase
      .from('staff_access')
      .insert([{ owner_id: user.id, staff_email: email }])
      .select()
      .single();
    setAdding(false);

    if (error) {
      alert(`Error adding staff: ${error.message}`);
      return;
    }

    setStaffList((prev) => [data as StaffAccessRecord, ...prev]);
    setNewEmail('');
    alert(`Invite saved for ${email}. Ask them to sign in with this email.`);
  };

  const revokeStaff = async (id: string) => {
    if (!window.confirm('Revoke this staff member access?')) {
      return;
    }
    await supabase.from('staff_access').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', id);
    setStaffList((prev) => prev.map((member) => (member.id === id ? { ...member, status: 'revoked' } : member)));
  };

  const removeStaff = async (id: string) => {
    if (!window.confirm('Remove this staff member completely?')) {
      return;
    }
    await supabase.from('staff_access').delete().eq('id', id);
    setStaffList((prev) => prev.filter((member) => member.id !== id));
  };

  const saveShopName = async () => {
    await updateShopName(shopInput);
    setEditingShop(false);
  };

  if (isStaff) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"><User size={30} className="text-gray-400" /></div>
        <h2 className="text-xl font-black text-gray-800">Staff Account</h2>
        <p className="max-w-xs text-sm text-gray-400">You are logged in as staff. You can add transactions and scan receipts, but owner-only settings are locked.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 pb-32">
      <div className="rounded-[2.5rem] bg-black p-6 text-white shadow-2xl">
        <div className="mb-1 flex items-center gap-2"><Crown size={16} className="opacity-60" /><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Owner</p></div>
        {editingShop ? (
          <div className="mt-2 flex gap-2">
            <input value={shopInput} onChange={(event) => setShopInput(event.target.value)} className="flex-1 rounded-xl bg-white/20 px-3 py-2 font-bold text-white outline-none placeholder:text-white/50" placeholder="Shop name" />
            <button onClick={() => void saveShopName()} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-black">Save</button>
            <button onClick={() => setEditingShop(false)} className="rounded-xl p-2 hover:bg-white/10"><X size={18} /></button>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between">
            <h2 className="text-2xl font-black tracking-tight">{shopName}</h2>
            <button onClick={() => setEditingShop(true)} className="rounded-lg border border-white/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest opacity-50 hover:opacity-100">Edit</button>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-gray-700" /><h3 className="font-black text-gray-800">Staff Access</h3></div>
        <p className="text-xs font-semibold text-gray-400">Staff can add transactions but cannot manage customers, reports, or owner settings.</p>
        <div className="flex gap-2">
          <input type="email" placeholder="Staff email address" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="flex-1 rounded-xl border-2 border-transparent bg-gray-50 px-4 py-3 text-sm font-semibold outline-none focus:border-black" />
          <button onClick={() => void addStaff()} disabled={!newEmail.trim() || adding} className="flex items-center gap-1 rounded-xl bg-black px-4 py-3 font-bold text-white disabled:opacity-40">{adding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-300" size={24} /></div>
      ) : staffList.length === 0 ? (
        <div className="py-8 text-center text-gray-300"><UserPlus size={36} className="mx-auto mb-2 opacity-30" strokeWidth={1} /><p className="text-sm font-bold uppercase tracking-widest">No staff added yet</p></div>
      ) : (
        <div className="space-y-3">
          <p className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Staff Members</p>
          {staffList.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100"><User size={16} className="text-gray-400" /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-gray-800">{member.staff_email}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${member.status === 'active' ? 'bg-green-100 text-green-600' : member.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-500'}`}>{member.status}</span></div>
              <div className="flex shrink-0 gap-2">
                {member.status === 'active' && <button onClick={() => void revokeStaff(member.id)} className="rounded-xl p-2 text-xs font-bold text-yellow-500 hover:bg-yellow-50">Revoke</button>}
                <button onClick={() => void removeStaff(member.id)} className="rounded-xl p-2 text-red-400 hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}