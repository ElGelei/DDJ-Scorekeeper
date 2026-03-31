'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseCombo, type Card } from '@/lib/ddz/engine'
import type { PublicGameState, PrivatePlayerState } from '@/lib/ddz/pvp-types'

const GOLD    = '#C9A84C'
const CRIMSON = '#8B0000'
const INK     = '#0a0a0a'
const PAPER   = '#F5ECD7'
const CARD_W  = 52
const CARD_H  = 78

// ── Sub-components ─────────────────────────────────────

function rankLabel(rank: string) {
  if (rank === 'PJ') return '小'
  if (rank === 'GJ') return '大'
  return rank
}

function CardBack({ size = 1 }: { size?: number }) {
  const w = CARD_W * size, h = CARD_H * size
  return (
    <div style={{
      width: w, height: h, minWidth: w,
      borderRadius: 6 * size,
      border: `1px solid rgba(201,168,76,0.35)`,
      background: `repeating-linear-gradient(45deg,#1a0800 0px,#1a0800 3px,#2a1200 3px,#2a1200 9px)`,
      boxShadow: `0 2px 6px rgba(0,0,0,0.5)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: w * 0.55, height: h * 0.55, border: `1px solid rgba(201,168,76,0.25)`, borderRadius: 3 * size }} />
    </div>
  )
}

function CardFace({ card, selected, onClick, small }: {
  card: Card; selected?: boolean; onClick?: () => void; small?: boolean
}) {
  const size = small ? 0.65 : 1
  const w = CARD_W * size, h = CARD_H * size
  const isJoker = card.rank === 'PJ' || card.rank === 'GJ'
  const isRed = card.suit === '♥' || card.suit === '♦'
  const label = rankLabel(card.rank)
  const color = isJoker ? INK : (isRed ? CRIMSON : '#0a0a0a')
  return (
    <button onClick={onClick} style={{
      width: w, height: h, minWidth: w,
      borderRadius: 6 * size,
      background: isJoker ? GOLD : 'white',
      border: selected ? `2px solid ${GOLD}` : `1px solid #ccc`,
      boxShadow: selected ? `0 4px 12px rgba(201,168,76,0.5)` : `0 2px 4px rgba(0,0,0,0.25)`,
      transform: selected ? 'translateY(-10px)' : 'translateY(0)',
      transition: 'transform 0.12s ease',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: `${3 * size}px ${4 * size}px`,
      cursor: onClick ? 'pointer' : 'default',
      color, fontSize: 11 * size, fontWeight: 700,
      fontFamily: 'Spectral,Georgia,serif',
      outline: 'none', WebkitTapHighlightColor: 'transparent',
      zIndex: selected ? 5 : 1, position: 'relative',
    }}>
      <div style={{ lineHeight: 1, userSelect: 'none' }}>{label}</div>
      <div style={{ textAlign: 'center', lineHeight: 1, userSelect: 'none', fontSize: isJoker ? 14 * size : 16 * size }}>
        {isJoker ? '🃏' : card.suit}
      </div>
      <div style={{ lineHeight: 1, transform: 'rotate(180deg)', alignSelf: 'flex-end', userSelect: 'none' }}>{label}</div>
    </button>
  )
}

// ── Main page ──────────────────────────────────────────

export default function GamePage({ params }: { params: { gameId: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const gameId = params.gameId

  const [pub, setPub] = useState<PublicGameState | null>(null)
  const [priv, setPriv] = useState<PrivatePlayerState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(30)
  const [token, setToken] = useState<string | null>(null)
  const [playerNames, setPlayerNames] = useState<string[]>(['P1', 'P2', 'P3'])
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, dur = 2000) => {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), dur)
  }, [])

  // Load token
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null)
    })
  }, [supabase])

  // Fetch game state
  const fetchState = useCallback(async (tok?: string) => {
    const t = tok ?? token
    if (!t) return
    try {
      const resp = await fetch(`/api/game/state?game_id=${gameId}`, {
        headers: { 'Authorization': `Bearer ${t}` },
      })
      if (!resp.ok) return
      const json = await resp.json()
      setPub(json.public as PublicGameState)
      setPriv(json.private as PrivatePlayerState)
    } catch {
      // ignore
    }
  }, [gameId, token])

  // Load member names
  const fetchNames = useCallback(async () => {
    const { data } = await supabase
      .from('room_members')
      .select('pvp_slot, users(display_name)')
      .order('pvp_slot')
    if (data) {
      const names = ['P1', 'P2', 'P3']
      for (const m of data) {
        const slot = m.pvp_slot as number | null
        if (slot !== null && slot < 3) {
          names[slot] = (m.users as { display_name: string } | null)?.display_name ?? `P${slot + 1}`
        }
      }
      setPlayerNames(names)
    }
  }, [supabase])

  useEffect(() => {
    if (!token) return
    fetchState(token)
    fetchNames()
  }, [token, fetchState, fetchNames])

  // Realtime subscription
  useEffect(() => {
    if (!pub) return
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_sessions',
        filter: `id=eq.${gameId}`,
      }, () => fetchState())
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'game_moves',
        filter: `game_id=eq.${gameId}`,
      }, () => fetchState())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, gameId, pub, fetchState])

  // Countdown
  useEffect(() => {
    if (!pub || pub.status === 'finished') return
    if (countdownRef.current) clearInterval(countdownRef.current)
    const timeout = pub.status === 'bidding' ? 20 : 30
    const start = new Date(pub.lastActionAt).getTime()
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      setCountdown(Math.max(0, timeout - elapsed))
    }
    update()
    countdownRef.current = setInterval(update, 500)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [pub?.currentPlayerSlot, pub?.status, pub?.lastActionAt])

  const apiCall = useCallback(async (path: string, body: object) => {
    if (!token) return null
    const resp = await fetch(`/api/game/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = await resp.json()
    if (!resp.ok) { showToast((json as { error?: string }).error ?? 'Error'); return null }
    await fetchState()
    return json
  }, [token, fetchState, showToast])

  const handleBid = useCallback(async (bid: number) => {
    await apiCall('bid', { game_id: gameId, bid })
  }, [apiCall, gameId])

  const handlePlay = useCallback(async () => {
    if (!priv) return
    const playCards = [...selected].map(id => priv.hand.find(c => c.id === id)!).filter(Boolean)
    if (playCards.length === 0) { showToast('Select cards first'); return }
    const result = await apiCall('play', { game_id: gameId, cards: playCards })
    if (result) {
      setSelected(new Set())
      const r = result as { status?: string; winner?: number }
      if (r.status === 'finished') showToast(`Player ${r.winner} wins!`, 4000)
    }
  }, [priv, selected, apiCall, gameId, showToast])

  const handlePass = useCallback(async () => {
    const result = await apiCall('pass', { game_id: gameId })
    if (result) setSelected(new Set())
  }, [apiCall, gameId])

  const toggleCard = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  if (!pub || !priv) {
    return (
      <div style={{ width: '100%', height: '100dvh', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PAPER }}>
        <div style={{ fontSize: 14, color: `${PAPER}40` }}>Loading…</div>
      </div>
    )
  }

  const mySlot = priv.slot
  const isMyTurn = pub.currentPlayerSlot === mySlot
  const opponentSlots = [0, 1, 2].filter(s => s !== mySlot) as [number, number]

  const lastMove = pub.lastMove
  const isFinished = pub.status === 'finished'

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes dealIn { from{opacity:0;transform:translateY(30px) scale(0.9)} to{opacity:1;transform:translateY(0) scale(1)} }
        .card-deal { animation: dealIn 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        ::-webkit-scrollbar{display:none} *{scrollbar-width:none}
      `}</style>

      <div style={{
        width: '100%', height: '100dvh',
        background: `radial-gradient(ellipse at 25% 15%,rgba(139,0,0,0.2) 0%,transparent 55%),
                     radial-gradient(ellipse at 75% 85%,rgba(201,168,76,0.08) 0%,transparent 55%),${INK}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Spectral,Georgia,serif', color: PAPER, position: 'relative',
      }}>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)', border: `1px solid ${GOLD}`,
            color: PAPER, borderRadius: 8, padding: '8px 18px', fontSize: 13,
            zIndex: 100, pointerEvents: 'none', animation: 'fadeInUp 0.2s ease', whiteSpace: 'nowrap',
          }}>{toast}</div>
        )}

        {/* ── HEADER (8vh) ── */}
        <div style={{
          height: '8vh', minHeight: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', borderBottom: `1px solid ${PAPER}08`,
        }}>
          <div style={{ fontFamily: "'Ma Shan Zheng',cursive", fontSize: 22, color: GOLD }}>斗地主</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontSize: 11, color: countdown <= 5 ? CRIMSON : `${PAPER}40`,
              fontVariantNumeric: 'tabular-nums',
              animation: countdown <= 5 ? 'pulse 0.6s infinite' : 'none',
            }}>
              {isMyTurn ? `${countdown}s` : ''}
            </div>
            <div style={{ fontSize: 10, color: `${PAPER}30`, fontFamily: "'Cinzel Decorative',serif", letterSpacing: 1 }}>PVP</div>
          </div>
        </div>

        {/* ── OPPONENT ZONE (15vh) ── */}
        <div style={{
          height: '15vh', minHeight: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '0 16px',
        }}>
          {opponentSlots.map(slot => (
            <div key={slot} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', fontSize: 11, color: `${PAPER}50`, gap: 4, alignItems: 'center' }}>
                {pub.landlordSlot === slot && <span style={{ color: GOLD }}>👑</span>}
                <span>{playerNames[slot]}</span>
                <span style={{
                  background: `${PAPER}12`, borderRadius: 8, padding: '1px 6px', fontSize: 10,
                  color: pub.currentPlayerSlot === slot ? GOLD : `${PAPER}50`,
                  animation: pub.currentPlayerSlot === slot ? 'pulse 1s infinite' : 'none',
                }}>
                  {pub.cardCounts[slot]}
                </span>
              </div>
              <div style={{ display: 'flex', position: 'relative' }}>
                {Array.from({ length: Math.min(pub.cardCounts[slot], 6) }).map((_, i) => (
                  <div key={i} style={{ marginRight: -14, position: 'relative', zIndex: i }}>
                    <CardBack size={0.6} />
                  </div>
                ))}
                {pub.cardCounts[slot] > 6 && (
                  <div style={{ width: 31, height: 47, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: `${PAPER}60` }}>
                    +{pub.cardCounts[slot] - 6}
                  </div>
                )}
              </div>
              {pub.currentPlayerSlot === slot && (
                <div style={{ fontSize: 9, color: `${GOLD}80`, letterSpacing: 1, animation: 'pulse 1s infinite' }}>thinking…</div>
              )}
            </div>
          ))}
        </div>

        {/* ── CENTRAL ZONE (25vh) ── */}
        <div style={{
          height: '25vh', minHeight: 130,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          borderTop: `1px solid ${PAPER}06`, borderBottom: `1px solid ${PAPER}06`,
          gap: 12, padding: '0 16px',
        }}>

          {pub.status === 'bidding' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
              <div style={{ fontSize: 13, color: GOLD, fontFamily: "'Cinzel Decorative',serif", letterSpacing: 2 }}>
                BIDDING
              </div>
              {pub.landlordCards === null && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[0, 1, 2].map(i => <CardBack key={i} />)}
                </div>
              )}
              {pub.landlordCards !== null && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {pub.landlordCards.map(card => <CardFace key={card.id} card={card} />)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                {[0, 1, 2].map(slot => (
                  <div key={slot} style={{ textAlign: 'center', fontSize: 11 }}>
                    <div style={{ color: `${PAPER}50`, marginBottom: 2 }}>{playerNames[slot]}</div>
                    <div style={{
                      color: pub.bids[slot] === null ? `${PAPER}20` : (pub.bids[slot] ?? 0) > 0 ? GOLD : `${PAPER}40`,
                      fontSize: 16, fontWeight: 700,
                    }}>
                      {pub.bids[slot] === null ? '…' : pub.bids[slot] === 0 ? 'Pass' : pub.bids[slot]}
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <div style={{ fontSize: 11, color: GOLD, animation: 'pulse 1s infinite' }}>
                  Your turn to bid ({countdown}s)
                </div>
              )}
            </div>
          ) : isFinished ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 28, fontFamily: "'Ma Shan Zheng',cursive", color: GOLD }}>
                {pub.lastMove?.slot === mySlot ? '🎉 You Win!' : `${playerNames[pub.lastMove?.slot ?? 0]} Wins!`}
              </div>
              <div style={{ fontSize: 13, color: `${PAPER}60` }}>Multiplier: ×{pub.multiplier}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => router.push(`/room/${pub.roomId}/lobby`)}
                  style={{
                    padding: '10px 20px', borderRadius: 10,
                    background: `linear-gradient(135deg,#9A6E2A,${GOLD})`,
                    color: INK, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'Cinzel Decorative',serif", letterSpacing: 1,
                  }}
                >
                  Rematch
                </button>
                <button
                  onClick={() => router.push(`/rooms/${pub.roomId}`)}
                  style={{
                    padding: '10px 20px', borderRadius: 10,
                    background: 'transparent',
                    color: `${PAPER}60`, border: `1px solid ${PAPER}20`,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Room
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
              {lastMove && lastMove.type === 'play' && lastMove.cards && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 10, color: `${PAPER}40`, letterSpacing: 2 }}>
                    {playerNames[lastMove.slot]}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {lastMove.cards.map(card => <CardFace key={card.id} card={card} small />)}
                  </div>
                </div>
              )}
              {lastMove && lastMove.type === 'pass' && (
                <div style={{ fontSize: 13, color: `${PAPER}40`, fontStyle: 'italic' }}>
                  {playerNames[lastMove.slot]} passes
                </div>
              )}
              {isMyTurn && pub.status === 'playing' && (
                <div style={{
                  fontSize: 12, color: GOLD, fontFamily: "'Cinzel Decorative',serif",
                  letterSpacing: 2, animation: 'pulse 1s infinite',
                }}>
                  YOUR TURN
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── MY INFO (4vh) ── */}
        <div style={{
          height: '4vh', minHeight: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '0 16px',
        }}>
          {pub.landlordSlot === mySlot && <span style={{ color: GOLD, fontSize: 14 }}>👑</span>}
          <span style={{ fontSize: 11, color: `${PAPER}60` }}>{playerNames[mySlot]}</span>
          <span style={{ fontSize: 10, background: `${PAPER}12`, borderRadius: 8, padding: '1px 6px', color: `${PAPER}50` }}>
            {priv.hand.length}
          </span>
        </div>

        {/* ── HAND ZONE (flex: 1) ── */}
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center',
          overflowX: 'auto', overflowY: 'visible',
          padding: '0 8px 4px',
          opacity: (isMyTurn && pub.status === 'playing') ? 1 : 0.6,
          transition: 'opacity 0.2s',
        }}>
          {priv.hand
            .slice().sort((a, b) => a.value - b.value)
            .map((card, i) => (
              <div
                key={card.id}
                className="card-deal"
                style={{ marginRight: i < priv.hand.length - 1 ? -16 : 0, animationDelay: `${i * 0.03}s` }}
              >
                <CardFace
                  card={card}
                  selected={selected.has(card.id)}
                  onClick={isMyTurn && pub.status === 'playing' ? () => toggleCard(card.id) : undefined}
                />
              </div>
            ))}
        </div>

        {/* ── ACTIONS ZONE (15vh) ── */}
        <div style={{
          height: '15vh', minHeight: 76,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 16px', gap: 10,
          borderTop: `1px solid ${PAPER}08`,
        }}>
          {pub.status === 'bidding' && isMyTurn ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2, 3].map(bid => (
                <button key={bid} onClick={() => handleBid(bid)} style={{
                  width: 60, height: 52, borderRadius: 10,
                  background: bid === 0 ? 'transparent' : `linear-gradient(135deg,#9A6E2A,${GOLD})`,
                  color: bid === 0 ? `${PAPER}60` : INK,
                  border: bid === 0 ? `1px solid ${PAPER}20` : 'none',
                  fontSize: 16, fontWeight: 700, cursor: 'pointer',
                }}>
                  {bid === 0 ? 'Pass' : bid}
                </button>
              ))}
            </div>
          ) : pub.status === 'playing' ? (
            <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
              <button
                onClick={handlePass}
                disabled={!isMyTurn}
                style={{
                  flex: 1, height: 52, borderRadius: 10,
                  background: 'transparent', color: isMyTurn ? `${PAPER}70` : `${PAPER}25`,
                  border: `1px solid ${isMyTurn ? `${PAPER}30` : `${PAPER}10`}`,
                  fontSize: 13, cursor: isMyTurn ? 'pointer' : 'default',
                }}
              >
                Pass
              </button>
              <button
                onClick={handlePlay}
                disabled={!isMyTurn || selected.size === 0}
                style={{
                  flex: 2, height: 52, borderRadius: 10,
                  background: (isMyTurn && selected.size > 0)
                    ? `linear-gradient(135deg,#9A6E2A,${GOLD})`
                    : `${PAPER}08`,
                  color: (isMyTurn && selected.size > 0) ? INK : `${PAPER}25`,
                  border: 'none',
                  fontSize: 15, fontWeight: 700,
                  cursor: (isMyTurn && selected.size > 0) ? 'pointer' : 'default',
                  fontFamily: "'Cinzel Decorative',serif", letterSpacing: 2,
                }}
              >
                PLAY {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          ) : isFinished ? null : (
            <div style={{ fontSize: 12, color: `${PAPER}30` }}>Waiting for other players…</div>
          )}
        </div>

      </div>
    </>
  )
}
