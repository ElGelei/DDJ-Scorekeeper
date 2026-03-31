'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GOLD    = '#C9A84C'
const CRIMSON = '#8B0000'
const INK     = '#0a0a0a'
const PAPER   = '#F5ECD7'

interface RoomMember {
  user_id: string
  pvp_slot: number | null
  is_ready: boolean
  users?: { display_name: string } | null
}

export default function LobbyPage({ params }: { params: { roomId: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [members, setMembers] = useState<RoomMember[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [mySlot, setMySlot] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'local' | 'remote'>('local')
  const roomId = params.roomId

  // Load members
  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from('room_members')
      .select('user_id, pvp_slot, is_ready, users(display_name)')
      .eq('room_id', roomId)
      .order('pvp_slot')
    if (data) setMembers(data as RoomMember[])
  }, [supabase, roomId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyUserId(user.id)
    })
    loadMembers()

    // Realtime subscription
    const channel = supabase
      .channel(`lobby-${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_members',
        filter: `room_id=eq.${roomId}`,
      }, () => loadMembers())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, roomId, loadMembers])

  useEffect(() => {
    if (myUserId && members.length > 0) {
      const me = members.find(m => m.user_id === myUserId)
      // Assign pvp_slot if not assigned
      if (me && me.pvp_slot === null) {
        const usedSlots = members.map(m => m.pvp_slot).filter((s): s is number => s !== null)
        const freeSlot = [0, 1, 2].find(s => !usedSlots.includes(s)) ?? null
        if (freeSlot !== null) {
          supabase
            .from('room_members')
            .update({ pvp_slot: freeSlot })
            .eq('room_id', roomId)
            .eq('user_id', myUserId)
            .then(() => loadMembers())
        }
      }
      setMySlot(me?.pvp_slot ?? null)
    }
  }, [myUserId, members, supabase, roomId, loadMembers])

  const toggleReady = async () => {
    if (!myUserId) return
    const me = members.find(m => m.user_id === myUserId)
    await supabase.from('room_members')
      .update({ is_ready: !me?.is_ready })
      .eq('room_id', roomId).eq('user_id', myUserId)
    await loadMembers()
  }

  const launchGame = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/game/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ room_id: roomId }),
      })
      const json = await resp.json()
      if (!resp.ok) { alert(json.error); setLoading(false); return }
      router.push(`/game/${json.public.gameId}`)
    } catch {
      setLoading(false)
    }
  }

  const allReady = members.length === 3 && members.every(m => m.is_ready)
  const isHost = mySlot === 0
  const myMember = members.find(m => m.user_id === myUserId)

  return (
    <div style={{
      width: '100%', minHeight: '100dvh',
      background: `radial-gradient(ellipse at 25% 15%, rgba(139,0,0,0.2) 0%, transparent 55%), ${INK}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32, padding: '32px 24px',
      fontFamily: 'Spectral, Georgia, serif', color: PAPER,
    }}>
      <Link href={`/rooms/${roomId}`} style={{
        position: 'absolute', top: 20, left: 20,
        color: `${GOLD}99`, fontSize: 12,
        fontFamily: "'Cinzel Decorative', serif",
        letterSpacing: 2, textDecoration: 'none',
      }}>← Room</Link>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Ma Shan Zheng', cursive", fontSize: 44, color: GOLD, lineHeight: 1 }}>斗地主</div>
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 10, color: `${GOLD}80`, letterSpacing: 4, marginTop: 6 }}>LOBBY</div>
      </div>

      {/* Players */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        {[0,1,2].map(slot => {
          const m = members.find(m => m.pvp_slot === slot)
          const isMe = m?.user_id === myUserId
          return (
            <div key={slot} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 12,
              background: isMe ? `${GOLD}10` : `${PAPER}05`,
              border: `1px solid ${isMe ? GOLD + '40' : PAPER + '10'}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: m ? `${GOLD}30` : `${PAPER}10`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>
                {slot === 0 ? '👑' : slot === 1 ? '🃏' : '🎴'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: m ? PAPER : `${PAPER}30` }}>
                  {m
                    ? ((m.users as { display_name: string } | null)?.display_name || `Player ${slot + 1}`)
                    : 'Waiting…'
                  }
                  {isMe && <span style={{ fontSize: 10, color: GOLD, marginLeft: 6 }}>You</span>}
                </div>
                <div style={{ fontSize: 10, color: `${PAPER}40`, marginTop: 2 }}>Slot {slot}</div>
              </div>
              <div style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: m?.is_ready ? `rgba(50,200,80,0.15)` : `${PAPER}08`,
                color: m?.is_ready ? '#4ade80' : `${PAPER}30`,
                border: `1px solid ${m?.is_ready ? '#4ade8040' : `${PAPER}15`}`,
              }}>
                {m ? (m.is_ready ? '✓ Ready' : 'Not ready') : '—'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mode toggle (host only) */}
      {isHost && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: `${PAPER}40`, letterSpacing: 2, fontFamily: "'Cinzel Decorative',serif" }}>MODE</div>
          <div style={{ display: 'flex', background: `${PAPER}08`, borderRadius: 8, padding: 3, gap: 3 }}>
            {(['local','remote'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '6px 18px', borderRadius: 6,
                background: mode === m ? `${GOLD}25` : 'transparent',
                border: mode === m ? `1px solid ${GOLD}50` : '1px solid transparent',
                color: mode === m ? GOLD : `${PAPER}40`,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {m === 'local' ? '📱 Local' : '🌐 Remote'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ready button */}
      <button
        onClick={toggleReady}
        style={{
          width: 220, height: 52, borderRadius: 12,
          background: myMember?.is_ready ? `${PAPER}10` : `linear-gradient(135deg, #9A6E2A, ${GOLD})`,
          color: myMember?.is_ready ? `${PAPER}60` : INK,
          border: myMember?.is_ready ? `1px solid ${PAPER}20` : 'none',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'Cinzel Decorative', serif", letterSpacing: 2,
        }}
      >
        {myMember?.is_ready ? '✗ CANCEL READY' : '✓ READY'}
      </button>

      {/* Launch button (host + all ready) */}
      {isHost && allReady && (
        <button
          onClick={launchGame}
          disabled={loading}
          style={{
            width: 220, height: 52, borderRadius: 12,
            background: `linear-gradient(135deg, ${CRIMSON}, #c0392b)`,
            color: PAPER, border: 'none',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            fontFamily: "'Cinzel Decorative', serif", letterSpacing: 2,
            boxShadow: `0 4px 20px rgba(139,0,0,0.4)`,
          }}
        >
          {loading ? '…' : '⚔️ LAUNCH'}
        </button>
      )}

      {!allReady && members.length === 3 && (
        <div style={{ fontSize: 12, color: `${PAPER}30`, textAlign: 'center' }}>
          Waiting for all players to be ready…
        </div>
      )}
      {members.length < 3 && (
        <div style={{ fontSize: 12, color: `${PAPER}30`, textAlign: 'center' }}>
          {3 - members.length} more player{members.length === 2 ? '' : 's'} needed
        </div>
      )}
    </div>
  )
}
