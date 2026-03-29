'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Player {
  slot: number      // 1, 2, or 3
  name: string
  userId: string
}

interface RoundRow {
  id: string
  landlord_slot: number
  winner: 'landlord' | 'peasants'
  pts: number
  multiplier: number
  played_at: string
}

interface Props {
  roomId: string
  sessionId: string
  players: Player[]   // exactly 3, ordered by slot
  currentUserId: string
}

interface HistoryEntry {
  roundNum: number
  landlordSlot: number
  winner: 'landlord' | 'peasants'
  pts: number
  multiplier: number
  delta: [number, number, number]
  winnerLabel: string
}

function computeState(rounds: RoundRow[], players: Player[]) {
  const scores: [number, number, number] = [0, 0, 0]
  const streaks: [number, number, number] = [0, 0, 0]
  const history: HistoryEntry[] = []

  for (const r of rounds) {
    const li = r.landlord_slot - 1  // 0-indexed
    const farmers = [0, 1, 2].filter(x => x !== li)
    const pts = r.pts * r.multiplier
    const delta: [number, number, number] = [0, 0, 0]

    if (r.winner === 'landlord') {
      delta[li] = pts * 2
      delta[farmers[0]] = -pts
      delta[farmers[1]] = -pts
      streaks[li] = Math.max(0, streaks[li]) + 1
      farmers.forEach(f => { streaks[f] = Math.min(0, streaks[f]) - 1 })
    } else {
      delta[li] = -(pts * 2)
      delta[farmers[0]] = pts
      delta[farmers[1]] = pts
      farmers.forEach(f => { streaks[f] = Math.max(0, streaks[f]) + 1 })
      streaks[li] = Math.min(0, streaks[li]) - 1
    }

    for (let i = 0; i < 3; i++) scores[i] += delta[i]

    const winnerLabel = r.winner === 'landlord'
      ? (players[li]?.name ?? `P${r.landlord_slot}`)
      : `${players[farmers[0]]?.name ?? 'P'} & ${players[farmers[1]]?.name ?? 'P'}`

    history.push({
      roundNum: history.length + 1,
      landlordSlot: r.landlord_slot,
      winner: r.winner,
      pts: r.pts,
      multiplier: r.multiplier,
      delta,
      winnerLabel,
    })
  }

  return { scores, streaks, history }
}

export default function Scorekeeper({ roomId, sessionId, players, currentUserId }: Props) {
  const supabase = createClient()

  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [landlordSlot, setLandlordSlot] = useState<number | null>(null)
  const [multiplier, setMultiplier] = useState(1)
  const [baseInput, setBaseInput] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'info' | 'error'>('info')
  const [showReset, setShowReset] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load initial rounds
  useEffect(() => {
    supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .order('played_at', { ascending: true })
      .then(({ data }) => {
        if (data) setRounds(data as RoundRow[])
      })
  }, [sessionId])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`rounds:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setRounds(prev => {
            if (prev.find(r => r.id === payload.new.id)) return prev
            return [...prev, payload.new as RoundRow]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rounds',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setRounds(prev => prev.filter(r => r.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const showToast = useCallback((msg: string, type: 'info' | 'error' = 'info') => {
    setToast(msg)
    setToastType(type)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 5000 : 2500)
  }, [])

  const { scores, streaks, history } = computeState(rounds, players)

  const recordWin = async (winner: 'landlord' | 'peasants') => {
    if (landlordSlot === null) { showToast('👆 Select a landlord first!', 'info'); return }
    setSubmitting(true)
    const { error } = await supabase.from('rounds').insert({
      room_id: roomId,
      session_id: sessionId,
      landlord_slot: landlordSlot,
      winner,
      pts: baseInput,
      multiplier,
    })
    if (error) {
      console.error('recordWin error:', error)
      showToast('Error: ' + error.message, 'error')
    } else {
      setMultiplier(1)
    }
    setSubmitting(false)
  }

  const undoLast = async () => {
    if (rounds.length === 0) { showToast('Nothing to undo'); return }
    const last = rounds[rounds.length - 1]
    const { error } = await supabase.from('rounds').delete().eq('id', last.id)
    if (error) {
      console.error('undoLast error:', error)
      showToast('Error: ' + error.message, 'error')
    } else {
      showToast('Round undone')
    }
  }

  const exportScore = () => {
    const lines = players.map((p, i) => {
      const s = scores[i]
      return `${p.name}: ${s >= 0 ? '+' : ''}${s} pts`
    }).join('\n')
    navigator.clipboard.writeText(`🀄 Doh Di Jow Results (${rounds.length} rounds)\n${lines}`)
      .then(() => showToast('Scores copied!'))
  }

  const p = players  // shorthand

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Cinzel+Decorative:wght@400;700&family=Spectral:ital,wght@0,300;0,400;1,300&display=swap');

        .sk-root {
          min-height: 100vh;
          background-color: #1A0A00;
          background-image:
            radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.25) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.15) 0%, transparent 50%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a84c' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
          font-family: 'Spectral', Georgia, serif;
          color: #F5ECD7;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.5rem 1rem 5rem;
        }
        .sk-header { text-align: center; margin-bottom: 1.5rem; animation: sk-fadeDown 1s ease both; }
        .sk-chinese {
          font-family: 'Ma Shan Zheng', cursive;
          font-size: clamp(2.5rem, 9vw, 4rem);
          color: #C9A84C;
          line-height: 1;
          text-shadow: 0 0 40px rgba(201,168,76,0.4), 2px 2px 0 rgba(0,0,0,0.5);
          letter-spacing: 0.1em;
        }
        .sk-divider { display: flex; align-items: center; gap: 1rem; margin: 0.4rem 0; justify-content: center; }
        .sk-divider-line { height: 1px; width: 60px; background: linear-gradient(to right, transparent, #C9A84C, transparent); }
        .sk-divider-diamond { width: 6px; height: 6px; background: #C9A84C; transform: rotate(45deg); }
        .sk-en {
          font-family: 'Cinzel Decorative', serif;
          font-size: clamp(0.55rem, 2vw, 0.8rem);
          color: #E8C97A; letter-spacing: 0.25em; opacity: 0.85;
        }
        .sk-sub { font-style: italic; font-size: 0.75rem; color: rgba(245,236,215,0.4); margin-top: 0.2rem; letter-spacing: 0.08em; }

        .sk-banner {
          background: linear-gradient(135deg, rgba(139,0,0,0.6), rgba(90,0,0,0.8));
          border: 1px solid rgba(201,168,76,0.3);
          border-radius: 4px;
          padding: 0.45rem 1.2rem;
          text-align: center;
          margin-bottom: 1.2rem;
          width: 100%; max-width: 560px;
          position: relative; overflow: hidden;
        }
        .sk-banner::before {
          content: ''; position: absolute; inset: 0;
          background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(201,168,76,0.03) 10px, rgba(201,168,76,0.03) 11px);
        }
        .sk-banner-label { font-family: 'Cinzel Decorative', serif; font-size: 0.55rem; letter-spacing: 0.3em; color: #E8C97A; text-transform: uppercase; opacity: 0.7; }
        .sk-banner-name { font-family: 'Ma Shan Zheng', cursive; font-size: 1.6rem; color: #C9A84C; text-shadow: 0 0 20px rgba(201,168,76,0.5); }
        .sk-banner-name.empty { color: rgba(201,168,76,0.3); font-family: 'Spectral', serif; font-style: italic; font-size: 0.8rem; padding: 0.3rem 0; letter-spacing: 0.1em; }

        .sk-scoreboard {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;
          width: 100%; max-width: 560px; margin-bottom: 1.2rem;
        }
        .sk-card {
          background: linear-gradient(160deg, rgba(245,236,215,0.07) 0%, rgba(245,236,215,0.03) 100%);
          border: 1px solid rgba(201,168,76,0.2);
          border-radius: 6px; padding: 1rem 0.5rem 0.7rem;
          text-align: center; position: relative;
          transition: border-color 0.3s, background 0.3s; overflow: hidden;
        }
        .sk-card::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(to right, transparent, #C9A84C, transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .sk-card.is-landlord { border-color: rgba(201,168,76,0.55); background: linear-gradient(160deg, rgba(139,0,0,0.28) 0%, rgba(245,236,215,0.04) 100%); }
        .sk-card.is-landlord::after { opacity: 1; }
        .sk-crown { position: absolute; top: -2px; left: 50%; transform: translateX(-50%); font-size: 1rem; display: none; animation: sk-crownDrop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
        .sk-card.is-landlord .sk-crown { display: block; }
        .sk-player-name { font-family: 'Cinzel Decorative', serif; font-size: 0.55rem; letter-spacing: 0.13em; color: #E8C97A; opacity: 0.75; text-transform: uppercase; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sk-score { font-family: 'Ma Shan Zheng', cursive; font-size: clamp(1.8rem, 6vw, 2.8rem); line-height: 1.1; color: #F5ECD7; text-shadow: 0 2px 20px rgba(0,0,0,0.5); position: relative; }
        .sk-score.pos { color: #E8C97A; }
        .sk-score.neg { color: #e07070; }
        .sk-streak { font-size: 0.58rem; letter-spacing: 0.04em; color: rgba(245,236,215,0.4); font-style: italic; margin-top: 0.2rem; min-height: 1.1em; }

        .sk-controls { width: 100%; max-width: 560px; }
        .sk-section-label { font-family: 'Cinzel Decorative', serif; font-size: 0.55rem; letter-spacing: 0.3em; color: rgba(201,168,76,0.5); text-transform: uppercase; text-align: center; margin-bottom: 0.5rem; }
        .sk-landlord-btns { display: flex; gap: 0.5rem; margin-bottom: 1.2rem; }
        .sk-btn-landlord {
          flex: 1; padding: 0.5rem 0.2rem;
          background: transparent; border: 1px solid rgba(201,168,76,0.2);
          color: rgba(245,236,215,0.6);
          font-family: 'Spectral', serif; font-size: 0.78rem;
          border-radius: 3px; cursor: pointer; transition: all 0.2s;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sk-btn-landlord:hover { border-color: rgba(201,168,76,0.5); color: #F5ECD7; }
        .sk-btn-landlord.active { background: rgba(139,0,0,0.4); border-color: #C9A84C; color: #E8C97A; }

        .sk-sep { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.7rem; }
        .sk-sep-line { flex: 1; height: 1px; background: rgba(201,168,76,0.1); }
        .sk-sep-icon { color: rgba(201,168,76,0.3); font-size: 0.7rem; }

        .sk-mult-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.9rem; }
        .sk-mult-label { font-style: italic; font-size: 0.78rem; color: rgba(245,236,215,0.5); white-space: nowrap; }
        .sk-mult-btns { display: flex; gap: 0.4rem; }
        .sk-btn-mult {
          width: 32px; height: 32px; background: transparent;
          border: 1px solid rgba(201,168,76,0.2); color: rgba(245,236,215,0.5);
          font-family: 'Ma Shan Zheng', cursive; font-size: 0.9rem;
          border-radius: 3px; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .sk-btn-mult:hover { border-color: rgba(201,168,76,0.5); color: #F5ECD7; }
        .sk-btn-mult.active { background: rgba(139,0,0,0.4); border-color: #C9A84C; color: #E8C97A; }
        .sk-mult-current { font-family: 'Ma Shan Zheng', cursive; font-size: 1.3rem; color: #C9A84C; min-width: 32px; text-align: center; }

        .sk-base-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.2rem; }
        .sk-base-label { font-style: italic; font-size: 0.78rem; color: rgba(245,236,215,0.5); white-space: nowrap; }
        .sk-base-input {
          width: 60px; background: rgba(245,236,215,0.05);
          border: 1px solid rgba(201,168,76,0.25); color: #F5ECD7;
          font-family: 'Ma Shan Zheng', cursive; font-size: 1.1rem;
          text-align: center; padding: 4px 6px; border-radius: 3px; outline: none; transition: border-color 0.2s;
        }
        .sk-base-input:focus { border-color: #C9A84C; }

        .sk-win-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 1.2rem; }
        .sk-btn-win {
          padding: 0.9rem 0.6rem; border: 1px solid rgba(201,168,76,0.3);
          border-radius: 4px; font-family: 'Cinzel Decorative', serif;
          font-size: 0.58rem; letter-spacing: 0.1em;
          cursor: pointer; transition: all 0.25s; position: relative; overflow: hidden;
          display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
        }
        .sk-btn-win:active { transform: scale(0.97); }
        .sk-btn-win:disabled { opacity: 0.5; cursor: not-allowed; }
        .sk-btn-landlord-w { background: linear-gradient(135deg, rgba(139,0,0,0.5), rgba(100,0,0,0.3)); color: #E8C97A; }
        .sk-btn-farmers-w { background: linear-gradient(135deg, rgba(45,106,79,0.5), rgba(30,70,55,0.3)); color: #9de0c0; border-color: rgba(45,106,79,0.4); }
        .sk-btn-icon { font-size: 1.2rem; }
        .sk-btn-sub { font-family: 'Spectral', serif; font-style: italic; font-size: 0.6rem; opacity: 0.55; }

        .sk-util-btns { display: flex; gap: 0.5rem; }
        .sk-btn-util {
          flex: 1; padding: 0.45rem; background: transparent;
          border: 1px solid rgba(245,236,215,0.1); color: rgba(245,236,215,0.35);
          font-family: 'Spectral', serif; font-style: italic; font-size: 0.72rem;
          border-radius: 3px; cursor: pointer; transition: all 0.2s; letter-spacing: 0.04em;
        }
        .sk-btn-util:hover { border-color: rgba(245,236,215,0.25); color: rgba(245,236,215,0.6); }

        .sk-history { width: 100%; max-width: 560px; margin-top: 2rem; }
        .sk-history-header { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.6rem; }
        .sk-history-title { font-family: 'Cinzel Decorative', serif; font-size: 0.55rem; letter-spacing: 0.3em; color: rgba(201,168,76,0.5); text-transform: uppercase; white-space: nowrap; }
        .sk-history-line { flex: 1; height: 1px; background: linear-gradient(to right, rgba(201,168,76,0.2), transparent); }
        .sk-history-list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 240px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(201,168,76,0.2) transparent; }
        .sk-history-item {
          display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem;
          padding: 0.4rem 0.6rem; background: rgba(245,236,215,0.03);
          border-left: 2px solid transparent; border-radius: 2px; font-size: 0.7rem;
          animation: sk-fadeIn 0.4s ease both;
        }
        .sk-history-item.landlord-won { border-left-color: #8B0000; }
        .sk-history-item.farmers-won { border-left-color: #2D6A4F; }
        .sk-history-round { color: rgba(245,236,215,0.3); font-style: italic; min-width: 1.8rem; }
        .sk-history-winner { color: #E8C97A; font-style: italic; flex: 1; min-width: 7rem; }
        .sk-history-pts { white-space: nowrap; }
        .sk-history-pts.pos { color: #E8C97A; }
        .sk-history-pts.neg { color: #e07070; }
        .sk-history-mult { color: rgba(245,236,215,0.3); font-size: 0.65rem; margin-left: auto; }
        .sk-history-empty { text-align: center; padding: 1.2rem; font-style: italic; color: rgba(245,236,215,0.2); font-size: 0.82rem; }

        .sk-modal-overlay {
          position: fixed; inset: 0; background: rgba(10,5,0,0.85);
          display: flex; align-items: center; justify-content: center;
          z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.3s;
        }
        .sk-modal-overlay.open { opacity: 1; pointer-events: all; }
        .sk-modal {
          background: linear-gradient(160deg, #1f0a00, #2a1200);
          border: 1px solid rgba(201,168,76,0.3); padding: 1.8rem; border-radius: 6px;
          text-align: center; max-width: 280px; transform: scale(0.9); transition: transform 0.3s;
        }
        .sk-modal-overlay.open .sk-modal { transform: scale(1); }
        .sk-modal-title { font-family: 'Cinzel Decorative', serif; font-size: 0.75rem; letter-spacing: 0.2em; color: #E8C97A; margin-bottom: 0.4rem; }
        .sk-modal-text { font-style: italic; color: rgba(245,236,215,0.6); font-size: 0.82rem; margin-bottom: 1.2rem; }
        .sk-modal-btns { display: flex; gap: 0.6rem; }
        .sk-modal-cancel { flex: 1; padding: 0.55rem; background: transparent; border: 1px solid rgba(245,236,215,0.15); color: rgba(245,236,215,0.4); border-radius: 3px; cursor: pointer; font-family: 'Spectral', serif; font-size: 0.82rem; transition: all 0.2s; }
        .sk-modal-confirm { flex: 1; padding: 0.55rem; background: rgba(139,0,0,0.5); border: 1px solid #8B0000; color: #F5ECD7; border-radius: 3px; cursor: pointer; font-family: 'Spectral', serif; font-size: 0.82rem; transition: all 0.2s; }
        .sk-modal-confirm:hover { background: rgba(139,0,0,0.75); }

        .sk-toast {
          position: fixed; bottom: 5rem; left: 50%;
          transform: translateX(-50%) translateY(120px);
          background: rgba(201,168,76,0.15); border: 1px solid rgba(201,168,76,0.3);
          backdrop-filter: blur(10px); padding: 0.7rem 1.5rem; border-radius: 6px;
          font-style: italic; font-size: 0.88rem; color: #E8C97A;
          transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
          z-index: 9999; pointer-events: none; white-space: nowrap;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .sk-toast.show { transform: translateX(-50%) translateY(0); }
        .sk-toast.error { background: rgba(139,0,0,0.4); border-color: rgba(200,50,50,0.5); color: #ff9999; }

        .sk-realtime-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #2D6A4F;
          animation: sk-pulse 2s ease-in-out infinite;
          display: inline-block; margin-left: 6px; vertical-align: middle;
        }

        @keyframes sk-fadeDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sk-fadeIn { to { opacity: 1; } from { opacity: 0; } }
        @keyframes sk-crownDrop { from { transform: translateX(-50%) translateY(-15px) rotate(-10deg); opacity: 0; } to { transform: translateX(-50%) translateY(0) rotate(0deg); opacity: 1; } }
        @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      <div className="sk-root">
        {/* Header */}
        <div className="sk-header">
          <div className="sk-chinese">斗地主</div>
          <div className="sk-divider">
            <div className="sk-divider-line" />
            <div className="sk-divider-diamond" />
            <div className="sk-divider-line" />
          </div>
          <div className="sk-en">Doh Di Jow</div>
          <div className="sk-sub">
            Fight the Landlord · Round {rounds.length}
            <span className="sk-realtime-dot" title="Realtime connected" />
          </div>
        </div>

        {/* Landlord banner */}
        <div className="sk-banner">
          <div className="sk-banner-label">Current Landlord · 地主</div>
          {landlordSlot === null
            ? <div className="sk-banner-name empty">No landlord selected</div>
            : <div className="sk-banner-name">{p[landlordSlot - 1]?.name ?? `P${landlordSlot}`}</div>
          }
        </div>

        {/* Scoreboard */}
        <div className="sk-scoreboard">
          {p.map((player, i) => {
            const s = scores[i]
            const streak = streaks[i]
            const isLandlord = landlordSlot === player.slot
            return (
              <div key={player.slot} className={`sk-card${isLandlord ? ' is-landlord' : ''}`}>
                <div className="sk-crown">👑</div>
                <div className="sk-player-name" title={player.name}>{player.name}</div>
                <div className={`sk-score${s > 0 ? ' pos' : s < 0 ? ' neg' : ''}`}>{s}</div>
                <div className="sk-streak">
                  {streak >= 2 ? `🔥 ${streak}-win streak`
                    : streak <= -2 ? `💀 ${Math.abs(streak)}-loss streak`
                    : ''}
                </div>
              </div>
            )
          })}
        </div>

        {/* Controls */}
        <div className="sk-controls">
          <div className="sk-section-label">Who is the Landlord? · 谁是地主？</div>
          <div className="sk-landlord-btns">
            {p.map((player) => (
              <button
                key={player.slot}
                className={`sk-btn-landlord${landlordSlot === player.slot ? ' active' : ''}`}
                onClick={() => setLandlordSlot(player.slot)}
              >
                {player.name}
              </button>
            ))}
          </div>

          <div className="sk-sep"><div className="sk-sep-line" /><div className="sk-sep-icon">♦</div><div className="sk-sep-line" /></div>

          <div className="sk-mult-row">
            <div className="sk-mult-label">Multiplier ×</div>
            <div className="sk-mult-btns">
              {[1, 2, 3, 4].map(m => (
                <button
                  key={m}
                  className={`sk-btn-mult${multiplier === m ? ' active' : ''}`}
                  onClick={() => setMultiplier(m)}
                >
                  {m}×
                </button>
              ))}
            </div>
            <div className="sk-mult-current">×{multiplier}</div>
          </div>

          <div className="sk-base-row">
            <div className="sk-base-label">Base points per round</div>
            <input
              className="sk-base-input"
              type="number"
              value={baseInput}
              min={1}
              max={999}
              onChange={e => setBaseInput(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className="sk-sep"><div className="sk-sep-line" /><div className="sk-sep-icon">♦</div><div className="sk-sep-line" /></div>

          {landlordSlot === null && (
            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(201,168,76,0.5)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
              ↑ Select a landlord above first
            </div>
          )}
          <div className="sk-win-btns">
            <button
              className="sk-btn-win sk-btn-landlord-w"
              onClick={() => recordWin('landlord')}
              disabled={submitting || landlordSlot === null}
            >
              <span className="sk-btn-icon">👑</span>
              Landlord Wins
              <span className="sk-btn-sub">地主赢 · collects from both farmers</span>
            </button>
            <button
              className="sk-btn-win sk-btn-farmers-w"
              onClick={() => recordWin('peasants')}
              disabled={submitting || landlordSlot === null}
            >
              <span className="sk-btn-icon">🌾</span>
              Farmers Win
              <span className="sk-btn-sub">农民赢 · landlord pays both</span>
            </button>
          </div>

          <div className="sk-util-btns">
            <button className="sk-btn-util" onClick={undoLast}>↩ Undo</button>
            <button className="sk-btn-util" onClick={() => setShowReset(true)}>⟳ New session</button>
            <button className="sk-btn-util" onClick={exportScore}>⬇ Copy scores</button>
          </div>
        </div>

        {/* History */}
        <div className="sk-history">
          <div className="sk-history-header">
            <div className="sk-history-title">Round History · 历史</div>
            <div className="sk-history-line" />
          </div>
          <div className="sk-history-list">
            {history.length === 0
              ? <div className="sk-history-empty">No rounds played yet</div>
              : [...history].reverse().map(h => (
                <div
                  key={h.roundNum}
                  className={`sk-history-item ${h.winner === 'landlord' ? 'landlord-won' : 'farmers-won'}`}
                >
                  <span className="sk-history-round">#{h.roundNum}</span>
                  <span className="sk-history-winner">{h.winnerLabel} won</span>
                  {h.delta.map((d, i) => (
                    <span key={i} className={`sk-history-pts ${d >= 0 ? 'pos' : 'neg'}`}>
                      {p[i]?.name}: {d >= 0 ? '+' : ''}{d}
                    </span>
                  ))}
                  <span className="sk-history-mult">×{h.multiplier}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Reset modal */}
      <div className={`sk-modal-overlay${showReset ? ' open' : ''}`}>
        <div className="sk-modal">
          <div className="sk-modal-title">New Session?</div>
          <div className="sk-modal-text">This will start a new session. All-time stats are preserved.</div>
          <div className="sk-modal-btns">
            <button className="sk-modal-cancel" onClick={() => setShowReset(false)}>Cancel</button>
            <button
              className="sk-modal-confirm"
              onClick={async () => {
                setShowReset(false)
                // Navigate to new session — parent handles this
                window.location.href = `/rooms/${roomId}/new-session`
              }}
            >
              New Session
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`sk-toast${toast ? ' show' : ''}${toastType === 'error' ? ' error' : ''}`}>{toast}</div>
    </>
  )
}
