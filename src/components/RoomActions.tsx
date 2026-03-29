'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  roomId: string
  roomName: string
  isHost: boolean
}

export default function RoomActions({ roomId, roomName, isHost }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleAction = async () => {
    setLoading(true)
    if (isHost) {
      await supabase.from('rooms').delete().eq('id', roomId)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', user.id)
    }
    setLoading(false)
    window.location.reload()
  }

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setShowConfirm(true) }}
        className={`text-xs font-body px-2.5 py-1.5 rounded-lg border transition-all ${
          isHost
            ? 'border-[#8B0000]/40 text-[#e07070]/60 hover:border-[#8B0000] hover:text-[#e07070]'
            : 'border-[#F5ECD7]/10 text-[#F5ECD7]/25 hover:border-[#F5ECD7]/30 hover:text-[#F5ECD7]/50'
        }`}
      >
        {isHost ? 'Delete' : 'Leave'}
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
          onClick={e => { e.preventDefault(); setShowConfirm(false) }}
        >
          <div
            className="w-full max-w-xs bg-gradient-to-b from-[#1f0a00] to-[#2a1200] border border-[#C9A84C]/30 rounded-xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-display text-[#E8C97A] text-sm tracking-widest uppercase mb-2">
              {isHost ? 'Delete Room?' : 'Leave Room?'}
            </h3>
            <p className="text-[#F5ECD7]/50 text-sm font-body italic mb-5">
              {isHost
                ? `"${roomName}" and all its history will be permanently deleted.`
                : `You'll be removed from "${roomName}".`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 border border-[#F5ECD7]/15 text-[#F5ECD7]/40 font-body text-sm rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={loading}
                className={`flex-1 py-2.5 font-display text-xs tracking-widest rounded-lg uppercase disabled:opacity-50 ${
                  isHost
                    ? 'bg-[#8B0000]/60 border border-[#8B0000] text-[#e07070]'
                    : 'bg-[#F5ECD7]/10 border border-[#F5ECD7]/20 text-[#F5ECD7]/70'
                }`}
              >
                {loading ? '…' : isHost ? 'Delete' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
