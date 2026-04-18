import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const getAuthToken = (req: VercelRequest): string => {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || Array.isArray(header)) return ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

const isMissingRelationError = (message: string) =>
  message.includes('does not exist') || message.includes('relation') || message.includes('schema cache')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase admin environment is not configured' })
  }

  const accessToken = getAuthToken(req)
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing access token' })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken)

    if (userError || !user) {
      return res.status(401).json({ error: userError?.message || 'Invalid session' })
    }

    const userId = user.id

    const deleteIfExists = async (table: string, column: string, value: string) => {
      const { error } = await admin.from(table).delete().eq(column, value)
      if (error && !isMissingRelationError(error.message.toLowerCase())) {
        throw error
      }
    }

    await deleteIfExists('transactions', 'user_id', userId)
    await deleteIfExists('udhaar_transactions', 'user_id', userId)
    await deleteIfExists('udhaar_customers', 'user_id', userId)
    await deleteIfExists('inventory', 'user_id', userId)
    await deleteIfExists('staff_access', 'staff_user_id', userId)
    await deleteIfExists('staff_access', 'owner_id', userId)
    await deleteIfExists('voice_logs', 'user_id', userId)
    await deleteIfExists('categories', 'user_id', userId)
    await deleteIfExists('profiles', 'id', userId)

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId, false)
    if (deleteAuthError) {
      return res.status(500).json({ error: deleteAuthError.message })
    }

    return res.status(200).json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete account'
    return res.status(500).json({ error: message })
  }
}
