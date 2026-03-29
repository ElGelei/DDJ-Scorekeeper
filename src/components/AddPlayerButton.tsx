'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  roomId: string
  currentUserId: string
  existingMemberIds: string[]
  currentMemberCount: number
}

export default function AddPlayerButton({ roomId, currentUserId, existingMemberIds, currentMemberCount }: Props) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<{ id: string; display_name: string; player_id: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  if (currentMemberCount >= 3) return null

  const openModal = async () => {
    setOpen(true)
    setError(null)
    setLoading(true)

    // Fetch current room members fresh (in case someone was added since page load)
    const { data: currentMembers } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)

    const currentMemberIds = (currentMembers ?? []).map((m: any) => m.user_id)

    const { data, error: fErr } = await supabase
      .from('friendships')
      .select(`
        requester_id, addressee_id,
        requester:users!friendships_requester_id_fkey(id, display_name, player_id),
        addressee:users!friendships_addressee_id_fkey(id, display_name, player_id)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)

    if (fErr) { setError(fErr.message); setLoading(false); return }

    const allFriends = (data ?? []).map((f: any) =>
      f.requester_id === currentUserId ? f.addressee : f.requester
    ).filter(Boolean)

    // Exclude already-in-room members (fresh check)
    setFriends(allFriends.filter((f: any) => !currentMemberIds.includes(f.id)))
    setLoading(false)
  }

  const addFriend = async (friendId: string) => {
    setAdding(true)
    setError(null)
    const nextSlot = currentMemberCount + 1

    const { error: insErr } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: friendId, player_slot: nextSlot })

    if (insErr) {
      console.error('Add player error:', insErr)
      if (insErr.code === '23505') {
        setError('This player is already in the room.')
      } else {
        setError(insErr.message)
      }
    } else {
      setOpen(false)
      window.location.reload()
    }
    setAdding(false)
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center justify-center w-10 h-10 bg-[#F5ECD7]/5 border border-[#C9A84C]/20 border-dashed rounded-lg text-[#C9A84C]/50 hover:border-[#C9A84C]/60 hover:text-[#C9A84C] transition-all text-lg"
        title="Add player"
      >
        +
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-sm bg-gradient-to-b from-[#1f0a00] to-[#2a1200] border border-[#C9A84C]/30 rounded-xl p-6 animate-slide-up">
            <h2 className="font-display text-[#E8C97A] text-sm tracking-widest uppercase mb-5">
              Add Player (slot {currentMemberCount + 1})
            </h2>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-xs font-body">
                {error}
              </div>
            )}

            {loading ? (
              <p className="text-[#F5ECD7]/30 text-sm font-body italic text-center py-4">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="text-[#F5ECD7]/30 text-sm font-body italic text-center py-4">
                No available friends to add.<br />
                <span className="text-xs">All friends are already in this room, or you have no friends yet.</span>
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {friends.map(f => (
                  <button
                    key={f.id}
                    onClick={() => addFriend(f.id)}
                    disabled={adding}
                    className="flex items-center justify-between px-3 py-3 rounded-lg border border-[#F5ECD7]/10 hover:border-[#C9A84C]/50 hover:bg-[#C9A84C]/5 transition-all disabled:opacity-50"
                  >
                    <span className="text-[#E8C97A] text-sm font-display tracking-wide">{f.display_name}</span>
                    <span className="text-[#F5ECD7]/30 text-xs">{f.player_id}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full py-2 border border-[#F5ECD7]/15 text-[#F5ECD7]/40 font-body text-sm rounded-lg hover:border-[#F5ECD7]/30 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
