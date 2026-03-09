import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import type { ProfileRecord, StaffAccessRecord } from '../lib/types'
import { useAuth } from './AuthContext'

interface RoleContextType {
  profile: ProfileRecord | null
  isOwner: boolean
  isStaff: boolean
  effectiveUserId: string
  shopName: string
  updateShopName: (name: string) => Promise<void>
}

const DEFAULT_SHOP_NAME = 'My Khata'

const RoleContext = createContext<RoleContextType>({
  profile: null,
  isOwner: true,
  isStaff: false,
  effectiveUserId: '',
  shopName: DEFAULT_SHOP_NAME,
  updateShopName: async () => undefined,
})

function buildFallbackProfile(userId: string, email?: string | null): ProfileRecord {
  const displayName = email?.split('@')[0] || DEFAULT_SHOP_NAME

  return {
    id: userId,
    business_name: displayName,
    full_name: displayName,
    shop_name: displayName,
    phone: '',
    role: 'owner',
    owner_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileRecord | null>(null)

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null)
      return
    }

    const email = user.email?.toLowerCase() || ''
    const fallback = buildFallbackProfile(user.id, user.email)

    const { data: ownProfile, error: ownProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<ProfileRecord>()

    if (ownProfileError) {
      console.error('Failed to load own profile:', ownProfileError.message)
      setProfile(fallback)
      return
    }

    let resolvedOwnProfile = ownProfile

    if (!resolvedOwnProfile) {
      const { error: createProfileError } = await supabase.from('profiles').upsert({
        id: user.id,
        business_name: fallback.business_name,
        full_name: fallback.full_name,
        shop_name: fallback.shop_name,
        phone: '',
        role: 'owner',
        owner_id: null,
      })

      if (createProfileError) {
        console.error('Failed to create fallback profile:', createProfileError.message)
        setProfile(fallback)
        return
      }

      resolvedOwnProfile = fallback
    }

    const { data: invite, error: inviteError } = await supabase
      .from('staff_access')
      .select('*')
      .eq('staff_email', email)
      .neq('status', 'revoked')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<StaffAccessRecord>()

    if (inviteError) {
      console.error('Failed to load staff access:', inviteError.message)
      setProfile(resolvedOwnProfile)
      return
    }

    if (invite?.owner_id && invite.owner_id !== user.id) {
      if (invite.staff_user_id !== user.id || invite.status !== 'active') {
        const { error: updateInviteError } = await supabase
          .from('staff_access')
          .update({
            staff_user_id: user.id,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', invite.id)

        if (updateInviteError) {
          console.error('Failed to update staff access:', updateInviteError.message)
        }
      }

      const { data: ownerProfile, error: ownerProfileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', invite.owner_id)
        .maybeSingle<ProfileRecord>()

      if (ownerProfileError) {
        console.error('Failed to load owner profile:', ownerProfileError.message)
      }

      setProfile({
        ...resolvedOwnProfile,
        role: 'staff',
        owner_id: invite.owner_id,
        shop_name:
          ownerProfile?.shop_name ||
          resolvedOwnProfile.shop_name ||
          fallback.shop_name,
      })
      return
    }

    setProfile({
      ...resolvedOwnProfile,
      role: resolvedOwnProfile.role || 'owner',
      owner_id: resolvedOwnProfile.owner_id || null,
    })
  }, [user?.email, user?.id])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const updateShopName = useCallback(
    async (name: string) => {
      if (!user?.id) return

      const cleanName = name.trim() || DEFAULT_SHOP_NAME

      const nextProfile = {
        id: user.id,
        business_name: cleanName,
        shop_name: cleanName,
        full_name: profile?.full_name || cleanName,
        phone: profile?.phone || '',
        role: profile?.role || 'owner',
        owner_id: profile?.owner_id || null,
      }

      const { error } = await supabase.from('profiles').upsert(nextProfile)

      if (error) {
        console.error('Failed to update shop name:', error.message)
        return
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              business_name: cleanName,
              shop_name: cleanName,
              updated_at: new Date().toISOString(),
            }
          : {
              ...buildFallbackProfile(user.id, user.email),
              business_name: cleanName,
              shop_name: cleanName,
            }
      )
    },
    [profile?.full_name, profile?.owner_id, profile?.phone, profile?.role, user?.email, user?.id]
  )

  const value = useMemo<RoleContextType>(() => {
    const resolvedProfile = profile
    const isStaff = resolvedProfile?.role === 'staff'
    const isOwner = !isStaff

    return {
      profile: resolvedProfile,
      isOwner,
      isStaff,
      effectiveUserId: user?.id || '',
      shopName: resolvedProfile?.shop_name || DEFAULT_SHOP_NAME,
      updateShopName,
    }
  }, [profile, updateShopName, user?.id])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}