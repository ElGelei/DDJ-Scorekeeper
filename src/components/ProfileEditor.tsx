'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  initialDisplayName: string
  playerId: string
  email: string
}

export default function ProfileEditor({ userId, initialDisplayName, playerId, email }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const hasChanges = displayName.trim() !== initialDisplayName

  const save = async () => {
    if (!hasChanges) return
    if (!displayName.trim()) { setError('Display name cannot be empty'); return }

    setSaving(true)
    setError(null)
    setSuccess(false)

    const { error: err } = await supabase
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('id', userId)

    setSaving(false)

    if (err) {
      console.error('Profile save error:', err)
      setError(err.message)
    } else {
      setSuccess(true)
      setTimeout(() => window.location.reload(), 1000)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Player ID — read-only, just for sharing */}
      <div>
        <label className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase block mb-2">
          Your ID · share with friends to connect
        </label>
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F5ECD7]/3 border border-[#C9A84C]/20 rounded-lg">
          <span className="text-[#C9A84C] font-display text-xl tracking-[0.3em] flex-1">{playerId}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(playerId) }}
            className="text-[#F5ECD7]/30 hover:text-[#C9A84C] text-xs font-body transition-colors"
            title="Copy"
          >
            copy
          </button>
        </div>
        <p className="text-[#F5ECD7]/20 text-xs mt-1.5 font-body italic">
          This ID is permanent and unique.
        </p>
      </div>

      {/* Display Name */}
      <div>
        <label className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase block mb-2">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={e => { setDisplayName(e.target.value); setError(null); setSuccess(false) }}
          maxLength={32}
          className="w-full px-4 py-3 bg-[#F5ECD7]/5 border border-[#C9A84C]/20 rounded-lg text-[#F5ECD7] text-sm focus:outline-none focus:border-[#C9A84C]/50 transition-colors font-body"
        />
      </div>

      {/* Email (readonly) */}
      <div>
        <label className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase block mb-2">
          Email
        </label>
        <div className="px-4 py-3 bg-[#F5ECD7]/3 border border-[#F5ECD7]/10 rounded-lg text-[#F5ECD7]/40 text-sm font-body">
          {email}
        </div>
      </div>

      {/* Error / Success */}
      {error && <p className="text-[#e07070] text-sm font-body italic">{error}</p>}
      {success && <p className="text-[#9de0c0] text-sm font-body italic">Saved ✓</p>}

      {/* Save button */}
      <button
        onClick={save}
        disabled={!hasChanges || saving}
        className="w-full py-4 bg-gradient-to-r from-[#9A6E2A] via-[#C9A84C] to-[#9A6E2A] text-[#1A0A00] font-display font-bold tracking-widest rounded-lg text-sm uppercase disabled:opacity-40 hover:opacity-90 transition-all"
      >
        {saving ? '…' : 'Save'}
      </button>

      <div className="flex items-center gap-3 mt-2">
        <div className="h-px flex-1 bg-[#F5ECD7]/10" />
        <span className="text-[#F5ECD7]/20 text-xs">♦</span>
        <div className="h-px flex-1 bg-[#F5ECD7]/10" />
      </div>

      <button
        onClick={signOut}
        className="w-full py-3 border border-[#F5ECD7]/10 text-[#F5ECD7]/30 font-body text-sm rounded-lg hover:border-[#F5ECD7]/20 hover:text-[#F5ECD7]/50 transition-all"
      >
        Sign out
      </button>
    </div>
  )
}
