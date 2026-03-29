'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
}

export default function CreateRoomButton({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [friends, setFriends] = useState<{ id: string; display_name: string; player_id: string }[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const openModal = async () => {
    setOpen(true)
    // Load accepted friends
    const { data } = await supabase
      .from('friendships')
      .select(`
        requester_id, addressee_id,
        requester:users!friendships_requester_id_fkey(id, display_name, player_id),
        addressee:users!friendships_addressee_id_fkey(id, display_name, player_id)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)

    const friendList = (data ?? []).map((f: any) => {
      return f.requester_id === userId ? f.addressee : f.requester
    }).filter(Boolean)

    setFriends(friendList)
  }

  const toggleFriend = (id: string) => {
    setSelectedFriends(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : prev
    )
  }

  const createRoom = async () => {
    if (!name.trim()) return
    setLoading(true)

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ name: name.trim(), created_by: userId })
      .select()
      .single()

    if (error || !room) { setLoading(false); return }

    // Add members: current user + selected friends
    const members = [
      { room_id: room.id, user_id: userId, player_slot: 1 },
      ...selectedFriends.map((fId, i) => ({
        room_id: room.id, user_id: fId, player_slot: i + 2
      }))
    ]

    await supabase.from('room_members').insert(members)

    setLoading(false)
    setOpen(false)
    window.location.href = `/rooms/${room.id}`
  }

  return (
    <>
      <button
        onClick={openModal}
        className="px-4 py-2 bg-gradient-to-r from-[#9A6E2A] to-[#C9A84C] text-[#1A0A00] font-display text-xs tracking-widest rounded-lg uppercase font-bold hover:opacity-90 transition-all"
      >
        + New Room
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-sm bg-gradient-to-b from-[#1f0a00] to-[#2a1200] border border-[#C9A84C]/30 rounded-xl p-6 animate-slide-up">
            <h2 className="font-display text-[#E8C97A] text-sm tracking-widest uppercase mb-5">
              Create Room
            </h2>

            <input
              type="text"
              placeholder="Room name…"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[#F5ECD7]/5 border border-[#C9A84C]/20 rounded-lg text-[#F5ECD7] placeholder-[#F5ECD7]/30 text-sm focus:outline-none focus:border-[#C9A84C]/50 transition-colors font-body mb-4"
            />

            {friends.length > 0 && (
              <div className="mb-4">
                <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-2">
                  Add friends ({selectedFriends.length}/2)
                </p>
                <div className="flex flex-col gap-2">
                  {friends.map(f => (
                    <button
                      key={f.id}
                      onClick={() => toggleFriend(f.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
                        selectedFriends.includes(f.id)
                          ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                          : 'border-[#F5ECD7]/10 hover:border-[#F5ECD7]/25'
                      }`}
                    >
                      <span className="text-[#E8C97A] text-sm font-display tracking-wide">{f.display_name}</span>
                      <span className="text-[#F5ECD7]/30 text-xs">{f.player_id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-3 border border-[#F5ECD7]/15 text-[#F5ECD7]/40 font-body text-sm rounded-lg hover:border-[#F5ECD7]/30 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createRoom}
                disabled={!name.trim() || loading}
                className="flex-1 py-3 bg-gradient-to-r from-[#9A6E2A] to-[#C9A84C] text-[#1A0A00] font-display font-bold text-sm tracking-widest rounded-lg uppercase disabled:opacity-50 hover:opacity-90 transition-all"
              >
                {loading ? '...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
