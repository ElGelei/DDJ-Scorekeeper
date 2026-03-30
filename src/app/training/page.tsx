'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  createDeck, shuffle, deal, parseCombo, isValidPlay,
  type Card, type Combo,
} from '@/lib/ddz/engine'
import { aiPlay, getAllValidPlays, shouldBid, type AILevel } from '@/lib/ddz/ai'

// ── Types ──────────────────────────────────────────────

type Phase = 'start' | 'bidding' | 'playing' | 'ended'
type PlayerIdx = 0 | 1 | 2

interface PlayLogEntry {
  player: PlayerIdx
  combo: Combo
  passed: false
}

interface PassLogEntry {
  player: PlayerIdx
  passed: true
}

type LogEntry = PlayLogEntry | PassLogEntry

interface GameState {
  hands: [Card[], Card[], Card[]]
  landlordCards: Card[]
  landlord: PlayerIdx | null
  currentPlayer: PlayerIdx
  lastPlayed: Combo | null
  lastPlayedBy: PlayerIdx | null
  winner: PlayerIdx | null
  allPlayedCards: Card[]
  phase: Phase
  /** Last 4 actions (plays + passes) for the history display */
  playLog: LogEntry[]
}

// ── Inline styles / helpers ────────────────────────────

const GOLD    = '#C9A84C'
const CRIMSON = '#8B0000'
const INK     = '#0a0a0a'
const INK_L   = '#1a1a1a'
const INK_M   = '#2a2a2a'
const PAPER   = '#F5ECD7'

const CARD_W = 52
const CARD_H = 78

function suitColor(suit: string) {
  return suit === '♥' || suit === '♦' ? CRIMSON : '#0a0a0a'
}

function rankLabel(rank: string) {
  if (rank === 'PJ') return '小'
  if (rank === 'GJ') return '大'
  return rank
}

// ── Sub-components ─────────────────────────────────────

function CardBack({ size = 1 }: { size?: number }) {
  const w = CARD_W * size
  const h = CARD_H * size
  return (
    <div style={{
      width: w, height: h, minWidth: w,
      borderRadius: 6 * size,
      border: `1px solid rgba(201,168,76,0.35)`,
      background: `repeating-linear-gradient(
        45deg,
        #1a0800 0px, #1a0800 3px,
        #2a1200 3px, #2a1200 9px
      )`,
      boxShadow: `0 2px 6px rgba(0,0,0,0.5)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: w * 0.55, height: h * 0.55,
        border: `1px solid rgba(201,168,76,0.25)`,
        borderRadius: 3 * size,
      }} />
    </div>
  )
}

function CardFace({
  card, selected, hinted, onClick, small,
}: {
  card: Card
  selected?: boolean
  hinted?: boolean
  onClick?: () => void
  small?: boolean
}) {
  const size  = small ? 0.65 : 1
  const w     = CARD_W * size
  const h     = CARD_H * size
  const isJoker = card.rank === 'PJ' || card.rank === 'GJ'
  const isRed   = card.suit === '♥' || card.suit === '♦'
  const label   = rankLabel(card.rank)
  const color   = isJoker ? INK : (isRed ? CRIMSON : '#0a0a0a')

  return (
    <button
      onClick={onClick}
      style={{
        width: w, height: h, minWidth: w,
        borderRadius: 6 * size,
        background: isJoker ? GOLD : 'white',
        border: hinted
          ? `2px solid ${GOLD}`
          : selected
            ? `2px solid ${GOLD}`
            : `1px solid #ccc`,
        boxShadow: selected
          ? `0 4px 12px rgba(201,168,76,0.5)`
          : `0 2px 4px rgba(0,0,0,0.25)`,
        transform: selected ? 'translateY(-10px)' : 'translateY(0)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease, border 0.1s',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: `${3 * size}px ${4 * size}px`,
        cursor: onClick ? 'pointer' : 'default',
        color,
        fontSize: 11 * size,
        fontWeight: 700,
        fontFamily: 'Spectral, Georgia, serif',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        zIndex: selected ? 5 : 1,
        position: 'relative',
      }}
    >
      <div style={{ lineHeight: 1, userSelect: 'none' }}>{label}</div>
      <div style={{
        textAlign: 'center', lineHeight: 1, userSelect: 'none',
        fontSize: isJoker ? 14 * size : 16 * size,
      }}>
        {isJoker ? '🃏' : card.suit}
      </div>
      <div style={{
        lineHeight: 1, transform: 'rotate(180deg)',
        alignSelf: 'flex-end', userSelect: 'none',
      }}>{label}</div>
    </button>
  )
}

// ── Main page ──────────────────────────────────────────

export default function TrainingPage() {
  const [phase, setPhase]       = useState<Phase>('start')
  const [aiLevel, setAiLevel]   = useState<AILevel>(2)
  const [game, setGame]         = useState<GameState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hintIds, setHintIds]   = useState<Set<string>>(new Set())
  const [toast, setToast]       = useState<string | null>(null)
  const [shake, setShake]       = useState(false)
  const [thinking, setThinking] = useState(false)
  const [dealt, setDealt]       = useState(false)
  // Bidding state
  const [bids, setBids]   = useState<(boolean | null)[]>([null, null, null])
  const [bidStep, setBidStep] = useState(0) // 0=waiting player, 1=AI1 deciding, 2=AI2 deciding
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Toast helper ──
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }, [])

  // ── Start new game ──
  const startGame = useCallback(() => {
    const deck = shuffle(createDeck())
    const { hands, landlordCards } = deal(deck)
    setGame({
      hands,
      landlordCards,
      landlord: null,
      currentPlayer: 0,
      lastPlayed: null,
      lastPlayedBy: null,
      winner: null,
      allPlayedCards: [],
      phase: 'bidding',
      playLog: [],
    })
    setBids([null, null, null])
    setBidStep(0)
    setSelected(new Set())
    setHintIds(new Set())
    setDealt(false)
    setPhase('bidding')
    setTimeout(() => setDealt(true), 50)
  }, [])

  // ── Finalise landlord selection ──
  // Uses setGame(prev=>) to always read fresh state — no stale-closure risk
  const finaliseLandlord = useCallback((landlord: PlayerIdx) => {
    setGame(prev => {
      if (!prev) return prev
      const newHands = prev.hands.map(h => [...h]) as [Card[], Card[], Card[]]
      newHands[landlord] = [...prev.hands[landlord], ...prev.landlordCards]
      return {
        ...prev,
        hands: newHands,
        landlord,
        currentPlayer: landlord,
        phase: 'playing',
      }
    })
    setPhase('playing')
    showToast(landlord === 0 ? 'Tu es le 地主 !' : `IA ${landlord} est le 地主 !`)
  }, [showToast])

  // ── Bidding: player decision ──
  const playerBid = useCallback((wantLandlord: boolean) => {
    setBids(prev => { const n = [...prev]; n[0] = wantLandlord; return n })
    if (wantLandlord) {
      finaliseLandlord(0)
    } else {
      setBidStep(1) // AI1 will decide
    }
  }, [finaliseLandlord])

  // ── AI bidding sequence ──
  useEffect(() => {
    if (phase !== 'bidding' || !game) return
    if (bidStep === 1) {
      const timer = setTimeout(() => {
        const ai1Bids = shouldBid(game.hands[1])
        setBids(prev => { const n = [...prev]; n[1] = ai1Bids; return n })
        if (ai1Bids) {
          finaliseLandlord(1)
        } else {
          setBidStep(2)
        }
      }, 700)
      return () => clearTimeout(timer)
    }
    if (bidStep === 2) {
      const timer = setTimeout(() => {
        const ai2Bids = shouldBid(game.hands[2])
        setBids(prev => { const n = [...prev]; n[2] = ai2Bids; return n })
        if (ai2Bids) {
          finaliseLandlord(2)
        } else {
          // Nobody bid — force player to be landlord
          finaliseLandlord(0)
          showToast('Personne n\'a enchéri — tu es le 地主 !')
        }
      }, 700)
      return () => clearTimeout(timer)
    }
  }, [bidStep, phase, game, finaliseLandlord, showToast])

  // ── Core play action ──
  const executePlay = useCallback((
    cards: Card[],
    playerIdx: PlayerIdx,
    currentGame: GameState,
  ): GameState | null => {
    const effectiveLastPlayed =
      currentGame.lastPlayedBy === playerIdx ? null : currentGame.lastPlayed
    const combo = parseCombo(cards)
    if (!combo || !isValidPlay(combo, effectiveLastPlayed)) return null

    const newHands = currentGame.hands.map(h =>
      [...h]
    ) as [Card[], Card[], Card[]]
    const ids = new Set(cards.map(c => c.id))
    newHands[playerIdx] = newHands[playerIdx].filter(c => !ids.has(c.id))

    const next: PlayerIdx = ((playerIdx + 1) % 3) as PlayerIdx
    // If next player is the one who last played, clear the table
    const nextLastPlayed =
      next === playerIdx ? null : combo
    const nextLastPlayedBy: PlayerIdx | null =
      next === playerIdx ? null : playerIdx

    const newLog: LogEntry[] = [
      { player: playerIdx, combo, passed: false },
      ...currentGame.playLog,
    ].slice(0, 5)

    return {
      ...currentGame,
      hands: newHands,
      lastPlayed: nextLastPlayed === null ? null : combo,
      lastPlayedBy: nextLastPlayedBy === null ? null : playerIdx,
      currentPlayer: next,
      winner: newHands[playerIdx].length === 0 ? playerIdx : null,
      allPlayedCards: [...currentGame.allPlayedCards, ...cards],
      playLog: newLog,
    }
  }, [])

  const executePass = useCallback((
    playerIdx: PlayerIdx,
    currentGame: GameState,
  ): GameState => {
    const next: PlayerIdx = ((playerIdx + 1) % 3) as PlayerIdx
    const clearTable = next === currentGame.lastPlayedBy
    const newLog: LogEntry[] = [
      { player: playerIdx, passed: true },
      ...currentGame.playLog,
    ].slice(0, 5)
    return {
      ...currentGame,
      currentPlayer: next,
      lastPlayed: clearTable ? null : currentGame.lastPlayed,
      lastPlayedBy: clearTable ? null : currentGame.lastPlayedBy,
      playLog: newLog,
    }
  }, [])

  // ── AI turn handler ──
  useEffect(() => {
    if (phase !== 'playing' || !game || game.winner !== null) return
    if (game.currentPlayer === 0) return // human

    setThinking(true)
    const timer = setTimeout(() => {
      setThinking(false)
      setGame(prev => {
        if (!prev || prev.currentPlayer === 0) return prev
        const playerIdx = prev.currentPlayer
        const effectiveLastPlayed =
          prev.lastPlayedBy === playerIdx ? null : prev.lastPlayed

        const result = aiPlay(
          {
            hand: prev.hands[playerIdx],
            lastPlayed: effectiveLastPlayed,
            playedCards: prev.allPlayedCards,
            isLandlord: prev.landlord === playerIdx,
            playerCardCounts: prev.hands.map(h => h.length),
          },
          aiLevel,
        )

        if (result === null) {
          // Pass
          return executePass(playerIdx, prev)
        }

        const newGame = executePlay(result, playerIdx, prev)
        if (!newGame) return executePass(playerIdx, prev) // fallback
        if (newGame.winner !== null) {
          setPhase('ended')
        }
        return newGame
      })
    }, 800)

    return () => clearTimeout(timer)
  }, [game?.currentPlayer, phase, aiLevel, executePlay, executePass]) // eslint-disable-line

  // ── Player actions ──
  const handlePlayerPlay = useCallback(() => {
    if (!game || game.currentPlayer !== 0) return
    const playCards = [...selected].map(id =>
      game.hands[0].find(c => c.id === id)!
    ).filter(Boolean)

    if (playCards.length === 0) { showToast('Sélectionne des cartes'); return }

    const effectiveLastPlayed =
      game.lastPlayedBy === 0 ? null : game.lastPlayed
    const combo = parseCombo(playCards)

    if (!combo || !isValidPlay(combo, effectiveLastPlayed)) {
      showToast('Combo invalide')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const newGame = executePlay(playCards, 0, game)
    if (!newGame) return
    setSelected(new Set())
    setHintIds(new Set())
    setGame(newGame)
    if (newGame.winner !== null) setPhase('ended')
  }, [game, selected, showToast, executePlay])

  const handlePlayerPass = useCallback(() => {
    if (!game || game.currentPlayer !== 0) return
    // Can only pass if someone has already played
    if (game.lastPlayed === null || game.lastPlayedBy === 0) {
      showToast('Tu dois jouer une carte ici')
      return
    }
    setSelected(new Set())
    setHintIds(new Set())
    setGame(prev => prev ? executePass(0, prev) : prev)
  }, [game, showToast, executePass])

  const handleHint = useCallback(() => {
    if (!game) return
    const effectiveLastPlayed =
      game.lastPlayedBy === 0 ? null : game.lastPlayed
    const plays = getAllValidPlays(game.hands[0], effectiveLastPlayed)
    if (plays.length === 0) { showToast('Aucune combinaison jouable — passe !'); return }
    // Suggest lowest value play
    const best = plays.sort((a, b) => {
      const va = parseCombo(a)?.value ?? 0
      const vb = parseCombo(b)?.value ?? 0
      return va - vb
    })[0]
    setHintIds(new Set(best.map(c => c.id)))
    setTimeout(() => setHintIds(new Set()), 2500)
  }, [game, showToast])

  const toggleCard = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setHintIds(new Set())
  }, [])

  // ── Rendering helpers ──

  const canPass = game?.lastPlayed !== null && game?.lastPlayedBy !== 0
  const isMyTurn = phase === 'playing' && game?.currentPlayer === 0 && game?.winner === null

  function playerLabel(idx: PlayerIdx): string {
    return idx === 0 ? 'Toi' : `IA ${idx}`
  }

  function winnerMessage(): string {
    if (!game || game.winner === null) return ''
    const w = game.winner
    const isLandlord = w === game.landlord
    if (w === 0) return isLandlord ? '🎉 Tu gagnes en tant que 地主 !' : '🎉 Tu gagnes !'
    const farmers = [0, 1, 2].filter(i => i !== game.landlord)
    if (!isLandlord) {
      return farmers.includes(0)
        ? `IA ${w} gagne — les paysans l'emportent !`
        : `IA ${w} (地主) gagne !`
    }
    return `IA ${w} (地主) gagne !`
  }

  // ── Layout ──────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%      { transform: translateX(-6px) }
          40%      { transform: translateX(6px) }
          60%      { transform: translateX(-6px) }
          80%      { transform: translateX(4px) }
        }
        @keyframes fadeInUp {
          from { opacity:0; transform:translateY(10px) }
          to   { opacity:1; transform:translateY(0) }
        }
        @keyframes dealIn {
          from { opacity:0; transform:translateY(30px) scale(0.9) }
          to   { opacity:1; transform:translateY(0) scale(1) }
        }
        @keyframes floatIn {
          from { opacity:0; transform:scale(0.7) translateY(-20px) }
          to   { opacity:1; transform:scale(1) translateY(0) }
        }
        .card-deal { animation: dealIn 0.35s cubic-bezier(0.16,1,0.3,1) both; }
        .combo-appear { animation: floatIn 0.3s ease both; }
        .hand-shake { animation: shake 0.45s ease; }
        ::-webkit-scrollbar { display:none }
        * { scrollbar-width: none }
      `}</style>

      <div style={{
        width: '100%', height: '100dvh',
        background: `radial-gradient(ellipse at 25% 15%, rgba(139,0,0,0.2) 0%, transparent 55%),
                     radial-gradient(ellipse at 75% 85%, rgba(201,168,76,0.08) 0%, transparent 55%),
                     ${INK}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Spectral, Georgia, serif',
        color: PAPER,
        position: 'relative',
      }}>

        {/* ── Toast ── */}
        {toast && (
          <div style={{
            position: 'fixed', top: '12%', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            border: `1px solid ${GOLD}`,
            color: PAPER, borderRadius: 8,
            padding: '8px 18px', fontSize: 13,
            zIndex: 100, pointerEvents: 'none',
            animation: 'fadeInUp 0.2s ease',
            whiteSpace: 'nowrap',
          }}>
            {toast}
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* START SCREEN                                  */}
        {/* ════════════════════════════════════════════ */}
        {phase === 'start' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 32,
            padding: '0 24px',
          }}>
            <Link href="/dashboard" style={{
              position: 'absolute', top: 20, left: 20,
              color: `${GOLD}99`, fontSize: 12,
              fontFamily: "'Cinzel Decorative', serif",
              letterSpacing: 2, textDecoration: 'none',
            }}>← Dashboard</Link>

            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Ma Shan Zheng', cursive",
                fontSize: 52, color: GOLD, lineHeight: 1,
                textShadow: `0 0 30px rgba(201,168,76,0.4)`,
              }}>斗地主</div>
              <div style={{
                fontFamily: "'Cinzel Decorative', serif",
                fontSize: 11, color: `${GOLD}80`,
                letterSpacing: 4, marginTop: 6,
              }}>SALLE D'ENTRAÎNEMENT</div>
            </div>

            {/* Level selector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 11, color: `${PAPER}50`, letterSpacing: 2, fontFamily: "'Cinzel Decorative',serif" }}>
                NIVEAU IA
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([1, 2, 3] as AILevel[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setAiLevel(l)}
                    style={{
                      width: 56, height: 44,
                      borderRadius: 8,
                      border: aiLevel === l ? `2px solid ${GOLD}` : `1px solid ${PAPER}20`,
                      background: aiLevel === l ? `${GOLD}18` : 'transparent',
                      color: aiLevel === l ? GOLD : `${PAPER}50`,
                      fontSize: 14, fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {l === 1 ? '🎲' : l === 2 ? '🧠' : '♟️'}<br />
                    <span style={{ fontSize: 10 }}>{l === 1 ? 'Random' : l === 2 ? 'Aware' : 'Pro'}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startGame}
              style={{
                background: `linear-gradient(135deg, #9A6E2A, ${GOLD}, #E8C97A)`,
                color: INK, border: 'none',
                padding: '14px 40px', borderRadius: 12,
                fontSize: 15, fontWeight: 700,
                fontFamily: "'Cinzel Decorative', serif",
                letterSpacing: 2, cursor: 'pointer',
                boxShadow: `0 4px 20px rgba(201,168,76,0.35)`,
              }}
            >
              NOUVELLE PARTIE
            </button>

            <div style={{ fontSize: 30, opacity: 0.08, display: 'flex', gap: 16 }}>
              <span>♠</span>
              <span style={{ color: CRIMSON }}>♥</span>
              <span style={{ color: CRIMSON }}>♦</span>
              <span>♣</span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* BIDDING SCREEN                               */}
        {/* ════════════════════════════════════════════ */}
        {phase === 'bidding' && game && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 16px 24px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Ma Shan Zheng', cursive",
                fontSize: 28, color: GOLD,
              }}>斗地主</div>
              <div style={{ fontSize: 12, color: `${PAPER}50`, marginTop: 4 }}>Enchères</div>
            </div>

            {/* Landlord cards (face down) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 11, color: `${PAPER}40`, letterSpacing: 2 }}>CARTES DU 地主</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {game.landlordCards.map((_, i) => <CardBack key={i} />)}
              </div>
            </div>

            {/* Player's hand preview */}
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: 11, color: `${PAPER}40`, letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>
                TA MAIN ({game.hands[0].length} cartes)
              </div>
              <div style={{
                display: 'flex', overflowX: 'auto', overflowY: 'visible',
                paddingBottom: 4, paddingLeft: 8,
                gap: 0,
              }}>
                {game.hands[0]
                  .slice()
                  .sort((a, b) => a.value - b.value)
                  .map((card, i) => (
                    <div
                      key={card.id}
                      className={dealt ? 'card-deal' : ''}
                      style={{
                        marginRight: i < game.hands[0].length - 1 ? -16 : 0,
                        animationDelay: `${i * 0.04}s`,
                      }}
                    >
                      <CardFace card={card} />
                    </div>
                  ))}
              </div>
            </div>

            {/* Bid buttons */}
            {bidStep === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
                <div style={{ fontSize: 14, color: PAPER, textAlign: 'center' }}>
                  Veux-tu être le <span style={{ color: GOLD }}>地主</span> ?
                </div>
                <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 280 }}>
                  <button
                    onClick={() => playerBid(true)}
                    style={{
                      flex: 1, height: 52, borderRadius: 10,
                      background: `linear-gradient(135deg, #9A6E2A, ${GOLD})`,
                      color: INK, border: 'none',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    👑 Prendre
                  </button>
                  <button
                    onClick={() => playerBid(false)}
                    style={{
                      flex: 1, height: 52, borderRadius: 10,
                      background: 'transparent',
                      color: `${PAPER}60`,
                      border: `1px solid ${PAPER}25`,
                      fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Passer
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: `${PAPER}60`, fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}>
                  {bids[0] === false && <span>Tu as passé. </span>}
                  {bidStep >= 1 && <span>IA 1 réfléchit...</span>}
                  {bidStep >= 2 && bids[1] === false && <span> IA 2 réfléchit...</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      fontSize: 11, color: bids[i] === null ? `${PAPER}30` : bids[i] ? GOLD : `${PAPER}40`,
                    }}>
                      {playerLabel(i as PlayerIdx)}: {bids[i] === null ? '...' : bids[i] ? '👑' : 'pass'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* GAME SCREEN                                  */}
        {/* ════════════════════════════════════════════ */}
        {phase === 'playing' && game && game.winner === null && (
          <>
            {/* ── HEADER (8vh) ── */}
            <div style={{
              height: '8vh', minHeight: 48,
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              borderBottom: `1px solid ${PAPER}08`,
            }}>
              <div style={{
                fontFamily: "'Ma Shan Zheng', cursive",
                fontSize: 22, color: GOLD,
                textShadow: `0 0 20px rgba(201,168,76,0.3)`,
              }}>斗地主</div>

              {/* Level selector */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([1, 2, 3] as AILevel[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setAiLevel(l)}
                    style={{
                      width: 34, height: 26,
                      borderRadius: 5,
                      border: aiLevel === l ? `1px solid ${GOLD}` : `1px solid ${PAPER}15`,
                      background: aiLevel === l ? `${GOLD}18` : 'transparent',
                      color: aiLevel === l ? GOLD : `${PAPER}40`,
                      fontSize: 10, cursor: 'pointer',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* ── AI ZONE (15vh) ── */}
            <div style={{
              height: '15vh', minHeight: 80,
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-around',
              padding: '0 16px',
            }}>
              {([1, 2] as const).map(aiIdx => (
                <div key={aiIdx} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 4,
                }}>
                  <div style={{ display: 'flex', fontSize: 11, color: `${PAPER}50`, gap: 4, alignItems: 'center' }}>
                    {game.landlord === aiIdx && (
                      <span style={{ color: GOLD }}>👑</span>
                    )}
                    <span>IA {aiIdx}</span>
                    <span style={{
                      background: `${PAPER}12`, borderRadius: 8,
                      padding: '1px 6px', fontSize: 10,
                      color: game.currentPlayer === aiIdx ? GOLD : `${PAPER}50`,
                    }}>
                      {game.hands[aiIdx].length}
                    </span>
                  </div>
                  {/* Card backs */}
                  <div style={{ display: 'flex', position: 'relative' }}>
                    {Array.from({ length: Math.min(game.hands[aiIdx].length, 6) }).map((_, i) => (
                      <div key={i} style={{ marginRight: -14, position: 'relative', zIndex: i }}>
                        <CardBack size={0.6} />
                      </div>
                    ))}
                    {game.hands[aiIdx].length > 6 && (
                      <div style={{
                        width: 31, height: 47, marginRight: -14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: `${PAPER}60`,
                      }}>+{game.hands[aiIdx].length - 6}</div>
                    )}
                  </div>
                  {game.currentPlayer === aiIdx && thinking && (
                    <div style={{ fontSize: 9, color: `${GOLD}80`, letterSpacing: 1 }}>réfléchit…</div>
                  )}
                </div>
              ))}
            </div>

            {/* ── CENTRAL ZONE (25vh) ── */}
            <div style={{
              height: '25vh', minHeight: 130,
              display: 'flex', flexDirection: 'column',
              borderTop: `1px solid ${PAPER}06`,
              borderBottom: `1px solid ${PAPER}06`,
              overflow: 'hidden',
            }}>
              {/* History strip — last 4 actions scrollable */}
              {game.playLog.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  overflowX: 'auto', overflowY: 'hidden',
                  padding: '4px 12px',
                  borderBottom: `1px solid ${PAPER}06`,
                  minHeight: 32, flexShrink: 0,
                  direction: 'rtl', // newest at left
                }}>
                  {game.playLog.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        direction: 'ltr',
                        display: 'flex', alignItems: 'center', gap: 4,
                        flexShrink: 0,
                        opacity: i === 0 ? 0 : (1 - i * 0.2),  // hide [0]=same as lastPlayed
                        fontSize: 10,
                        color: i === 1 ? PAPER : `${PAPER}50`,
                        background: i === 1 ? `${PAPER}08` : 'transparent',
                        borderRadius: 5, padding: '2px 6px',
                        border: i === 1 ? `1px solid ${PAPER}12` : 'none',
                      }}
                    >
                      <span style={{ color: `${GOLD}70` }}>{playerLabel(entry.player)}</span>
                      {entry.passed
                        ? <span style={{ color: `${PAPER}30` }}>passe</span>
                        : (
                          <>
                            <span style={{ color: `${PAPER}50` }}>·</span>
                            {entry.combo.cards.slice(0, 4).map(c => (
                              <CardFace key={c.id} card={c} small />
                            ))}
                            {entry.combo.cards.length > 4 && (
                              <span style={{ color: `${PAPER}40` }}>+{entry.combo.cards.length - 4}</span>
                            )}
                          </>
                        )
                      }
                    </div>
                  ))}
                </div>
              )}

              {/* Main current play */}
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '4px 16px',
              }}>
                {game.lastPlayed ? (
                  <>
                    <div style={{ fontSize: 11, color: `${PAPER}40`, letterSpacing: 1 }}>
                      {game.lastPlayedBy === 0 ? 'Tu as joué' : `IA ${game.lastPlayedBy} a joué`}
                      {' · '}
                      <span style={{ color: `${GOLD}80` }}>{game.lastPlayed.type.replace(/_/g, '+')}</span>
                    </div>
                    <div
                      className="combo-appear"
                      style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}
                    >
                      {game.lastPlayed.cards.map(card => (
                        <CardFace key={card.id} card={card} small />
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', opacity: 0.3 }}>
                    <div style={{ fontSize: 22, marginBottom: 2 }}>
                      {game.landlord !== null && '👑'}
                    </div>
                    <div style={{ fontSize: 11, color: `${PAPER}50`, letterSpacing: 1 }}>
                      Table libre · Joue n'importe quelle combinaison
                    </div>
                  </div>
                )}

                {/* Turn indicator + landlord badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    fontSize: 11,
                    color: isMyTurn ? GOLD : `${PAPER}40`,
                    letterSpacing: 1,
                    fontFamily: "'Cinzel Decorative', serif",
                  }}>
                    {isMyTurn
                      ? '⟶ À TOI'
                      : thinking
                        ? `IA ${game.currentPlayer} réfléchit…`
                        : `Tour de ${playerLabel(game.currentPlayer)}`
                    }
                  </div>
                  {game.landlord !== null && (
                    <div style={{ fontSize: 9, color: `${GOLD}50` }}>
                      👑 {playerLabel(game.landlord)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── HAND ZONE (37vh) ── */}
            <div
              className={shake ? 'hand-shake' : ''}
              style={{
                height: '37vh', minHeight: 120,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '0 0 6px 16px',
                /* overflow must stay visible so translateY(-10px) isn't clipped */
                overflow: 'visible',
              }}
            >
              <div style={{ fontSize: 11, color: `${PAPER}30`, marginBottom: 4, paddingRight: 16 }}>
                Ta main
                {game.landlord === 0 && <span style={{ color: `${GOLD}60`, marginLeft: 6 }}>👑 地主</span>}
                <span style={{ marginLeft: 6 }}>({game.hands[0].length})</span>
              </div>
              {/* Wrapper adds top padding = card lift so overflow isn't clipped */}
              <div style={{ paddingTop: 14, overflow: 'visible' }}>
                <div style={{
                  display: 'flex',
                  overflowX: 'auto',
                  /* paddingTop gives room for translateY(-10px) without clipping */
                  paddingTop: 12,
                  paddingBottom: 8,
                  WebkitOverflowScrolling: 'touch',
                  alignItems: 'flex-end',
                }}>
                  {game.hands[0]
                    .slice()
                    .sort((a, b) => a.value - b.value)
                    .map((card, i, arr) => (
                      <div
                        key={card.id}
                        style={{ marginRight: i < arr.length - 1 ? -16 : 8, flexShrink: 0 }}
                      >
                        <CardFace
                          card={card}
                          selected={selected.has(card.id)}
                          hinted={hintIds.has(card.id)}
                          onClick={isMyTurn ? () => toggleCard(card.id) : undefined}
                        />
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* ── ACTIONS ZONE (15vh) ── */}
            <div style={{
              height: '15vh', minHeight: 72,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 10,
              padding: '0 16px',
              borderTop: `1px solid ${PAPER}08`,
            }}>
              <button
                onClick={handlePlayerPlay}
                disabled={!isMyTurn}
                style={{
                  flex: 2, minHeight: 52, borderRadius: 10,
                  background: isMyTurn
                    ? `linear-gradient(135deg, #9A6E2A, ${GOLD})`
                    : `${PAPER}08`,
                  color: isMyTurn ? INK : `${PAPER}25`,
                  border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: isMyTurn ? 'pointer' : 'default',
                  fontFamily: "'Cinzel Decorative', serif",
                  letterSpacing: 1,
                  transition: 'all 0.15s',
                }}
              >
                JOUER
              </button>
              <button
                onClick={handlePlayerPass}
                disabled={!isMyTurn || !canPass}
                style={{
                  flex: 1, minHeight: 52, borderRadius: 10,
                  background: 'transparent',
                  color: (isMyTurn && canPass) ? `${PAPER}70` : `${PAPER}20`,
                  border: `1px solid ${(isMyTurn && canPass) ? PAPER + '30' : PAPER + '10'}`,
                  fontSize: 13, cursor: (isMyTurn && canPass) ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                Passer
              </button>
              <button
                onClick={handleHint}
                disabled={!isMyTurn}
                style={{
                  flex: 1, minHeight: 52, borderRadius: 10,
                  background: 'transparent',
                  color: isMyTurn ? `${GOLD}80` : `${PAPER}20`,
                  border: `1px solid ${isMyTurn ? GOLD + '30' : PAPER + '10'}`,
                  fontSize: 20, cursor: isMyTurn ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
                title="Astuce"
              >
                💡
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════ */}
        {/* END SCREEN                                   */}
        {/* ════════════════════════════════════════════ */}
        {(phase === 'ended' || (game?.winner !== null && phase === 'playing')) && game && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 24, zIndex: 50,
            animation: 'fadeInUp 0.4s ease',
          }}>
            <div style={{
              fontFamily: "'Ma Shan Zheng', cursive",
              fontSize: 44, color: GOLD,
              textShadow: `0 0 40px rgba(201,168,76,0.5)`,
            }}>斗地主</div>

            <div style={{
              fontSize: 18, color: PAPER,
              textAlign: 'center', padding: '0 24px',
              lineHeight: 1.5,
            }}>
              {winnerMessage()}
            </div>

            {/* Card counts */}
            <div style={{
              display: 'flex', gap: 16,
              border: `1px solid ${PAPER}12`,
              borderRadius: 10, padding: '12px 20px',
            }}>
              {([0, 1, 2] as PlayerIdx[]).map(i => (
                <div key={i} style={{ textAlign: 'center', fontSize: 12 }}>
                  <div style={{ color: `${PAPER}50`, marginBottom: 2 }}>{playerLabel(i)}</div>
                  <div style={{
                    color: game.winner === i ? GOLD : `${PAPER}70`,
                    fontWeight: game.winner === i ? 700 : 400,
                  }}>
                    {game.hands[i].length === 0 ? '✓ vide' : `${game.hands[i].length} cartes`}
                  </div>
                  {game.landlord === i && (
                    <div style={{ color: `${GOLD}70`, fontSize: 10 }}>地主</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={startGame}
                style={{
                  background: `linear-gradient(135deg, #9A6E2A, ${GOLD})`,
                  color: INK, border: 'none',
                  padding: '13px 32px', borderRadius: 10,
                  fontSize: 14, fontWeight: 700,
                  fontFamily: "'Cinzel Decorative', serif",
                  letterSpacing: 1, cursor: 'pointer',
                }}
              >
                Rejouer
              </button>
              <button
                onClick={() => { setPhase('start'); setGame(null) }}
                style={{
                  background: 'transparent',
                  color: `${PAPER}50`,
                  border: `1px solid ${PAPER}20`,
                  padding: '13px 20px', borderRadius: 10,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
