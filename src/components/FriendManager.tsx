'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
  id: string
  display_name: string
  player_id: string
}

interface FriendshipRow {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  requester_id: string
  addressee_id: string
  requester: UserProfile
  addressee: UserProfile
}

interface Props {
  currentUserId: string
  initialFriendships: FriendshipRow[]
}

export default function FriendManager({ currentUserId, initialFriendships }: Props) {
  const [friendships, setFriendships] = useState(initialFriendships)
  const [searchId, setSearchId] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null)
  const [searchError, setSearchError] = useState('')
  const supabase = createClient()

  const accepted = friendships.filter(f => f.status === 'accepted')
  const pending = friendships.filter(f => f.status === 'pending')
  const incomingPending = pending.filter(f => f.addressee_id === currentUserId)
  const outgoingPending = pending.filter(f => f.requester_id === currentUserId)

  const searchUser = async () => {
    if (!searchId.trim()) return
    setSearching(true)
    setSearchError('')
    setSearchResult(null)

    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, player_id')
      .ilike('player_id', searchId.trim())
      .single()

    if (error || !data) {
      setSearchError('Player not found — double-check the ID.')
    } else if (data.id === currentUserId) {
      setSearchError("That's your own ID!")
    } else {
      setSearchResult(data)
    }
    setSearching(false)
  }

  const sendRequest = async (addresseeId: string) => {
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: currentUserId, addressee_id: addresseeId })
    if (error) {
      setSearchError(error.message)
      console.error('sendRequest error:', error)
    } else {
      setSearchResult(null)
      setSearchId('')
      window.location.reload()
    }
  }

  const respondToRequest = async (friendshipId: string, status: 'accepted' | 'declined') => {
    await supabase.from('friendships').update({ status }).eq('id', friendshipId)
    setFriendships(prev => prev.map(f => f.id === friendshipId ? { ...f, status } : f))
  }

  const removeFriend = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setFriendships(prev => prev.filter(f => f.id !== friendshipId))
  }

  const getFriendProfile = (f: FriendshipRow) =>
    f.requester_id === currentUserId ? f.addressee : f.requester

  return (
    <div className="flex flex-col gap-6">
      {/* Search */}
      <div>
        <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-2">Add Friend by ID</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ex: 481254"
            value={searchId}
            onChange={e => setSearchId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchUser()}
            className="flex-1 px-4 py-3 bg-[#F5ECD7]/5 border border-[#C9A84C]/20 rounded-lg text-[#F5ECD7] placeholder-[#F5ECD7]/30 text-sm focus:outline-none focus:border-[#C9A84C]/50 transition-colors font-body"
          />
          <button
            onClick={searchUser}
            disabled={searching}
            className="px-4 py-3 bg-[#C9A84C]/20 border border-[#C9A84C]/30 text-[#E8C97A] font-display text-xs tracking-widest rounded-lg hover:bg-[#C9A84C]/30 transition-all uppercase"
          >
            {searching ? '…' : 'Find'}
          </button>
        </div>
        {searchError && <p className="text-[#e07070] text-xs mt-2 font-body italic">{searchError}</p>}
        {searchResult && (
          <div className="mt-3 flex items-center justify-between px-4 py-3 bg-[#F5ECD7]/4 border border-[#C9A84C]/25 rounded-lg">
            <div>
              <div className="text-[#E8C97A] font-display text-sm">{searchResult.display_name}</div>
              <div className="text-[#F5ECD7]/30 text-xs">{searchResult.player_id}</div>
            </div>
            <button
              onClick={() => sendRequest(searchResult.id)}
              className="px-3 py-1.5 bg-[#C9A84C]/20 border border-[#C9A84C]/40 text-[#E8C97A] font-display text-xs tracking-widest rounded-lg hover:bg-[#C9A84C]/30 transition-all"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incomingPending.length > 0 && (
        <div>
          <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-2">
            Incoming Requests ({incomingPending.length})
          </p>
          <div className="flex flex-col gap-2">
            {incomingPending.map(f => {
              const fp = getFriendProfile(f)
              return (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-[#F5ECD7]/4 border border-[#C9A84C]/20 rounded-lg">
                  <div>
                    <div className="text-[#E8C97A] font-display text-sm">{fp.display_name}</div>
                    <div className="text-[#F5ECD7]/30 text-xs">{fp.player_id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => respondToRequest(f.id, 'accepted')}
                      className="px-3 py-1.5 bg-[#2D6A4F]/40 border border-[#2D6A4F]/60 text-[#9de0c0] font-display text-xs rounded-lg hover:bg-[#2D6A4F]/60 transition-all"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => respondToRequest(f.id, 'declined')}
                      className="px-3 py-1.5 bg-[#8B0000]/30 border border-[#8B0000]/50 text-[#e07070] font-display text-xs rounded-lg hover:bg-[#8B0000]/50 transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Outgoing pending */}
      {outgoingPending.length > 0 && (
        <div>
          <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-2">Sent</p>
          <div className="flex flex-col gap-2">
            {outgoingPending.map(f => {
              const fp = getFriendProfile(f)
              return (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-[#F5ECD7]/4 border border-[#C9A84C]/10 rounded-lg opacity-70">
                  <div>
                    <div className="text-[#E8C97A] font-display text-sm">{fp.display_name}</div>
                    <div className="text-[#F5ECD7]/30 text-xs">{fp.player_id}</div>
                  </div>
                  <span className="text-[#F5ECD7]/30 text-xs font-body italic">pending…</span>

                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div>
        <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-2">
          Friends ({accepted.length})
        </p>
        {accepted.length === 0 ? (
          <p className="text-[#F5ECD7]/20 text-sm font-body italic text-center py-4">No friends yet. Add someone by their ID.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {accepted.map(f => {
              const fp = getFriendProfile(f)
              return (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 bg-[#F5ECD7]/4 border border-[#C9A84C]/20 rounded-lg">
                  <div>
                    <div className="text-[#E8C97A] font-display text-sm">{fp.display_name}</div>
                    <div className="text-[#F5ECD7]/30 text-xs">{fp.player_id}</div>
                  </div>
                  <button
                    onClick={() => removeFriend(f.id)}
                    className="text-[#F5ECD7]/20 hover:text-[#e07070] text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
