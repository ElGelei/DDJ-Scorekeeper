// ────────────────────────────────────────────────────────
//  DDZ AI — rule-based, levels 1-5
// ────────────────────────────────────────────────────────

import {
  Card, Combo,
  parseCombo, isValidPlay,
} from './engine'

export type AILevel = 1 | 2 | 3 | 4 | 5

/** A record of a player passing on a specific combo — used by level 5. */
export interface PassEvent {
  playerIdx: number
  against: Combo
}

export interface AIInput {
  hand: Card[]
  /** Combo the AI must beat, or null if it leads the trick */
  lastPlayed: Combo | null
  /** All cards that have already been played (for level-3+ memory) */
  playedCards: Card[]
  /** true = this AI is the landlord */
  isLandlord: boolean
  /** Remaining card counts per player [0=human, 1=AI1, 2=AI2] */
  playerCardCounts: number[]
  /** Which player index this AI occupies. Required for levels 4-5. */
  myPlayerIdx?: number
  /** Which player index is the landlord. Required for levels 4-5. */
  landlordIdx?: number
  /** History of passes keyed by the combo they declined. Required for level 5. */
  passHistory?: PassEvent[]
}

// ── Combo enumeration ──────────────────────────────────

function groupCards(hand: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>()
  for (const c of hand) {
    if (!map.has(c.value)) map.set(c.value, [])
    map.get(c.value)!.push(c)
  }
  return map
}

/**
 * Generates a representative set of all valid combos playable from `hand`.
 * One combo per (type, configuration) — enough for AI decision-making.
 */
export function generateCombos(hand: Card[]): Card[][] {
  const result: Card[][] = []
  const grp = groupCards(hand)
  const vals = [...grp.keys()].sort((a, b) => a - b)
  const normalVals = vals.filter(v => v >= 3 && v <= 14)

  // Singles
  for (const c of hand) result.push([c])

  // Pairs
  for (const [, cs] of grp) {
    if (cs.length >= 2) result.push(cs.slice(0, 2))
  }

  // Triples
  for (const [, cs] of grp) {
    if (cs.length >= 3) result.push(cs.slice(0, 3))
  }

  // Bombs
  for (const [, cs] of grp) {
    if (cs.length >= 4) result.push(cs.slice(0, 4))
  }

  // Rocket
  if (grp.has(16) && grp.has(17)) {
    result.push([grp.get(16)![0], grp.get(17)![0]])
  }

  // Triple+solo — pair each triple with the lowest and highest available card
  for (const [v, cs] of grp) {
    if (cs.length < 3) continue
    const triple = cs.slice(0, 3)
    const others = hand.filter(c => c.value !== v).sort((a, b) => a.value - b.value)
    if (others.length > 0) result.push([...triple, others[0]])
    if (others.length > 1) result.push([...triple, others[others.length - 1]])
  }

  // Triple+pair
  for (const [v, cs] of grp) {
    if (cs.length < 3) continue
    const triple = cs.slice(0, 3)
    for (const [v2, cs2] of [...grp.entries()].sort(([a], [b]) => a - b)) {
      if (v2 !== v && cs2.length >= 2) {
        result.push([...triple, ...cs2.slice(0, 2)])
        break
      }
    }
  }

  // Straights
  for (let i = 0; i < normalVals.length; i++) {
    for (let len = 5; i + len <= normalVals.length; len++) {
      const seq = normalVals.slice(i, i + len)
      if (seq.some((v, j) => j > 0 && v !== seq[j - 1] + 1)) break
      if (len > 12) break
      result.push(seq.map(v => grp.get(v)![0]))
    }
  }

  // Straight pairs
  for (let i = 0; i < normalVals.length; i++) {
    for (let len = 3; i + len <= normalVals.length; len++) {
      const seq = normalVals.slice(i, i + len)
      if (seq.some((v, j) => j > 0 && v !== seq[j - 1] + 1)) break
      if (!seq.every(v => (grp.get(v)?.length ?? 0) >= 2)) break
      result.push(seq.flatMap(v => grp.get(v)!.slice(0, 2)))
    }
  }

  // Airplanes (pure + solo wings + pair wings)
  for (let i = 0; i < normalVals.length; i++) {
    if ((grp.get(normalVals[i])?.length ?? 0) < 3) continue
    for (let len = 2; i + len <= normalVals.length; len++) {
      const seq = normalVals.slice(i, i + len)
      if (seq.some((v, j) => j > 0 && v !== seq[j - 1] + 1)) break
      if (!seq.every(v => (grp.get(v)?.length ?? 0) >= 3)) break

      const airplaneIds = new Set<string>()
      const airplaneCards: Card[] = []
      for (const v of seq) {
        grp.get(v)!.slice(0, 3).forEach(c => { airplaneIds.add(c.id); airplaneCards.push(c) })
      }

      result.push(airplaneCards)

      const remaining = hand.filter(c => !airplaneIds.has(c.id)).sort((a, b) => a.value - b.value)

      if (remaining.length >= len) {
        result.push([...airplaneCards, ...remaining.slice(0, len)])
      }

      if (remaining.length >= len * 2) {
        const pairWings: Card[] = []
        const remGrp = groupCards(remaining)
        for (const [, cs] of [...remGrp.entries()].sort(([a], [b]) => a - b)) {
          if (cs.length >= 2 && pairWings.length / 2 < len) pairWings.push(...cs.slice(0, 2))
        }
        if (pairWings.length === len * 2) result.push([...airplaneCards, ...pairWings])
      }
    }
  }

  return result
}

/**
 * All playable combos from `hand` that beat `lastPlayed`
 * (or all combos when lastPlayed is null).
 */
export function getAllValidPlays(hand: Card[], lastPlayed: Combo | null): Card[][] {
  const all = generateCombos(hand)
  if (!lastPlayed) return all
  return all.filter(cards => {
    const c = parseCombo(cards)
    return c !== null && isValidPlay(c, lastPlayed)
  })
}

// ── Common helpers ──────────────────────────────────────

function isBombOrRocket(cards: Card[]): boolean {
  const t = parseCombo(cards)?.type
  return t === 'BOMB' || t === 'ROCKET'
}

function comboValue(cards: Card[]): number {
  return parseCombo(cards)?.value ?? 0
}

// ── Hand analysis (levels 4+) ──────────────────────────

interface HandAnalysis {
  estimatedTurns: number  // greedy turns to empty
  isFast: boolean         // estimatedTurns ≤ ceil(n/3)
  bombCount: number
  hasRocket: boolean
  isolatedSingles: Card[] // cards not part of any multi-card group
}

/**
 * Greedy lower-bound estimate of turns needed to empty a hand.
 * Order: bombs/rocket → triples → pairs → singles.
 */
function estimateTurnsToEmpty(hand: Card[]): number {
  if (hand.length === 0) return 0
  const grp = groupCards(hand)
  const covered = new Set<string>()
  let turns = 0

  // Rocket
  if (grp.has(16) && grp.has(17)) {
    grp.get(16)!.forEach(c => covered.add(c.id))
    grp.get(17)!.forEach(c => covered.add(c.id))
    turns++
  }
  // Bombs
  for (const [, cs] of grp) {
    const avail = cs.filter(c => !covered.has(c.id))
    if (avail.length >= 4) { avail.slice(0, 4).forEach(c => covered.add(c.id)); turns++ }
  }
  // Triples
  for (const [, cs] of grp) {
    const avail = cs.filter(c => !covered.has(c.id))
    if (avail.length >= 3) { avail.slice(0, 3).forEach(c => covered.add(c.id)); turns++ }
  }
  // Pairs
  for (const [, cs] of grp) {
    const avail = cs.filter(c => !covered.has(c.id))
    if (avail.length >= 2) { avail.slice(0, 2).forEach(c => covered.add(c.id)); turns++ }
  }
  // Singles
  turns += hand.filter(c => !covered.has(c.id)).length
  return turns
}

function analyseHand(hand: Card[]): HandAnalysis {
  if (hand.length === 0) {
    return { estimatedTurns: 0, isFast: true, bombCount: 0, hasRocket: false, isolatedSingles: [] }
  }
  const grp = groupCards(hand)
  const bombCount  = [...grp.values()].filter(cs => cs.length >= 4).length
  const hasRocket  = grp.has(16) && grp.has(17)
  const isolatedSingles = hand.filter(c => (grp.get(c.value)?.length ?? 0) === 1)
  const estimatedTurns  = estimateTurnsToEmpty(hand)
  const isFast = estimatedTurns <= Math.ceil(hand.length / 3)
  return { estimatedTurns, isFast, bombCount, hasRocket, isolatedSingles }
}

// ── Endgame search (levels 4-5) ────────────────────────

/**
 * Depth-first search for a winning first move when hand is small (≤6 cards).
 * Assumes we win every trick we play (optimistic, for fast exact wins only).
 * Returns the first winning card selection, or null if none found.
 */
function findWinningSequence(
  hand: Card[],
  lastPlayed: Combo | null,
  depth: number,
): Card[] | null {
  if (hand.length === 0) return []  // already empty = already won
  if (depth > 4) return null        // depth cap

  const plays = getAllValidPlays(hand, lastPlayed)
  if (plays.length === 0) return null

  // Prefer plays that remove the most cards
  const sorted = plays.slice().sort((a, b) => b.length - a.length)

  for (const play of sorted) {
    const ids = new Set(play.map(c => c.id))
    const newHand = hand.filter(c => !ids.has(c.id))
    if (newHand.length === 0) return play  // direct win
    // Assume we retain the lead and try to clear the rest
    const continuation = findWinningSequence(newHand, null, depth + 1)
    if (continuation !== null) return play
  }
  return null
}

// ── Pass-inference helpers (level 5) ───────────────────

/**
 * Estimates probability (0–1) that a play will go through without being beaten,
 * based on how often opponents have passed on equal-or-higher combos of the same type.
 */
function estimateSuccessProbability(
  play: Card[],
  myIdx: number,
  passHistory: PassEvent[],
): number {
  const combo = parseCombo(play)
  if (!combo) return 0
  if (combo.type === 'BOMB' || combo.type === 'ROCKET') return 1.0

  let p = 0.60 // baseline for unknown opponents

  const relevantPasses = passHistory.filter(e =>
    e.playerIdx !== myIdx &&
    e.against.type === combo.type &&
    e.against.value >= combo.value,
  )
  if (relevantPasses.length >= 2) p = Math.min(0.95, p + 0.30)
  else if (relevantPasses.length >= 1) p = Math.min(0.85, p + 0.18)

  return p
}

/**
 * Score a candidate play for 1-ply lookahead.
 * Higher = better. Factors in success probability and hand improvement.
 */
function scorePlay(play: Card[], input: AIInput): number {
  const { hand, myPlayerIdx = 0, passHistory = [] } = input
  const ids = new Set(play.map(c => c.id))
  const newHand = hand.filter(c => !ids.has(c.id))

  const turnsBefore = estimateTurnsToEmpty(hand)
  const turnsAfter  = estimateTurnsToEmpty(newHand)
  const improvement = turnsBefore - turnsAfter
  const successP    = estimateSuccessProbability(play, myPlayerIdx, passHistory)

  // Reward improvements; penalise likely-to-be-beaten plays
  return successP * (improvement + play.length * 0.4) - (1 - successP) * 1.5
}

// ── Shared role helpers ─────────────────────────────────

/** Returns { allies, opponents } from the perspective of `myIdx` and `llIdx`. */
function identifyRoles(
  myIdx: number,
  llIdx: number,
  isLandlord: boolean,
  count: number,
): { allies: number[]; opponents: number[] } {
  const allies: number[] = []
  const opponents: number[] = []
  for (let i = 0; i < count; i++) {
    if (i === myIdx) continue
    if (i === llIdx || isLandlord) opponents.push(i)
    else allies.push(i)
  }
  return { allies, opponents }
}

// ── Levels 1–3 ──────────────────────────────────────────

/** Level 1 — random valid play, or pass. */
function level1(input: AIInput): Card[] | null {
  const plays = getAllValidPlays(input.hand, input.lastPlayed)
  if (plays.length === 0) return null
  return plays[Math.floor(Math.random() * plays.length)]
}

/** Level 2 — avoids wasting bombs, prefers low cards. */
function level2(input: AIInput): Card[] | null {
  let plays = getAllValidPlays(input.hand, input.lastPlayed)
  if (plays.length === 0) return null

  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))

  if (nonBombs.length > 0) plays = nonBombs

  if (!input.lastPlayed && input.hand.length > 5) {
    const safe = plays.filter(p => p.every(c => c.value <= 14))
    if (safe.length > 0) plays = safe
  }

  return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
}

/** Level 3 — role-aware, basic coordination, situational bombs. */
function level3(input: AIInput): Card[] | null {
  const { hand, lastPlayed, isLandlord, playerCardCounts } = input

  let plays = getAllValidPlays(hand, lastPlayed)
  if (plays.length === 0) return null

  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))

  if (nonBombs.length > 0) {
    plays = nonBombs
    const opponentWinning = playerCardCounts.some((cnt, i) => {
      const isOpponent = isLandlord ? (i === 1 || i === 2) : i === 0
      return isOpponent && cnt <= 2
    })
    if (opponentWinning && bombs.length > 0) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
  } else if (bombs.length > 0) {
    return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  if (isLandlord) {
    if (!lastPlayed) return plays.sort((a, b) => comboValue(b) - comboValue(a))[0]
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  const otherFarmerAhead = playerCardCounts.some((cnt, i) => i !== 0 && !isLandlord && cnt <= 3)
  if (otherFarmerAhead && lastPlayed) {
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  if (lastPlayed) return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]

  const multiCard = plays.filter(p => p.length > 1).sort((a, b) => comboValue(a) - comboValue(b))
  if (multiCard.length > 0 && hand.length > 6) return multiCard[0]
  return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
}

// ── Level 4 — Advanced ──────────────────────────────────

/**
 * Level 4 — Advanced.
 *
 * Adds over level 3:
 * - Full hand analysis (fast/slow, isolated singles)
 * - Precise bomb discipline: never bomb if ally farmer can win soon
 * - Farmer: pass to let near-winning ally finish; take control if ally is blocked
 * - Landlord: fast hand → lead with biggest combos; slow hand → clear isolated singles first
 * - Endgame: switches to exact search when ≤6 cards remain
 */
function level4(input: AIInput): Card[] | null {
  const { hand, lastPlayed, isLandlord, playerCardCounts } = input
  const myIdx = input.myPlayerIdx ?? (isLandlord ? 0 : 1)
  const llIdx = input.landlordIdx ?? (isLandlord ? myIdx : 0)

  let plays = getAllValidPlays(hand, lastPlayed)
  if (plays.length === 0) return null

  const analysis = analyseHand(hand)
  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))

  const { allies, opponents } = identifyRoles(myIdx, llIdx, isLandlord, playerCardCounts.length)

  const allyMinCards     = allies.length > 0 ? Math.min(...allies.map(i => playerCardCounts[i])) : Infinity
  const opponentMinCards = opponents.length > 0 ? Math.min(...opponents.map(i => playerCardCounts[i])) : Infinity
  const allyCanWinSoon   = allyMinCards <= 2
  const opponentWinning  = opponentMinCards <= 2

  // ── Endgame exact search ──
  if (hand.length <= 6) {
    const winning = findWinningSequence(hand, lastPlayed, 0)
    if (winning && winning.length > 0) {
      const combo = parseCombo(winning)
      if (combo && isValidPlay(combo, lastPlayed)) return winning
    }
  }

  // ── Bomb discipline ──
  if (nonBombs.length > 0) {
    // NEVER bomb if ally farmer is about to win
    if (!allyCanWinSoon && opponentWinning && bombs.length > 0) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
    plays = nonBombs
  } else if (bombs.length > 0) {
    // Only bomb if ally isn't about to save us, or we must lead (can't pass)
    if (!allyCanWinSoon) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
    // Ally nearly done — pass if possible, else play lowest bomb
    if (lastPlayed !== null) return null
    return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // ── Farmer strategy ──
  if (!isLandlord) {
    // Ally is very close to winning — support them
    if (allyCanWinSoon) {
      if (lastPlayed !== null) return null  // pass to let ally finish
      // Leading: play lowest single to give control back cheaply
      const singles = plays.filter(p => p.length === 1)
      return (singles.length > 0 ? singles : plays).sort((a, b) => comboValue(a) - comboValue(b))[0]
    }

    // Opponent (landlord) is about to win — act urgently
    if (opponentWinning) {
      if (!lastPlayed) {
        // Lead with highest combo to dominate
        return plays.sort((a, b) => comboValue(b) - comboValue(a))[0]
      }
      // Respond with lowest to at least contest
      return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }

    // Ally is blocked (many cards left) — take control
    const allyBlocked = allies.some(i => playerCardCounts[i] > 8)
    if (allyBlocked && !lastPlayed) {
      const multi = plays.filter(p => p.length > 1)
      if (multi.length > 0) {
        return multi.sort((a, b) => b.length - a.length || comboValue(b) - comboValue(a))[0]
      }
    }

    // Responding: play lowest
    if (lastPlayed) return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]

    // Leading freely: dump isolated singles first, then combo
    if (analysis.isolatedSingles.length > 0) {
      const dumpable = plays.filter(p =>
        p.length === 1 && analysis.isolatedSingles.some(s => s.id === p[0].id),
      )
      if (dumpable.length > 0) return dumpable.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
    const multi = plays.filter(p => p.length > 1)
    if (multi.length > 0 && hand.length > 4) return multi.sort((a, b) => comboValue(a) - comboValue(b))[0]
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // ── Landlord strategy ──
  if (!lastPlayed) {
    if (analysis.isFast) {
      // Fast hand: lead biggest combos to end game quickly
      const multi = plays.filter(p => p.length > 1 && !isBombOrRocket(p))
      if (multi.length > 0) {
        return multi.sort((a, b) => b.length - a.length || comboValue(b) - comboValue(a))[0]
      }
      return plays.sort((a, b) => comboValue(b) - comboValue(a))[0]
    } else {
      // Slow hand: clear isolated singles first
      if (analysis.isolatedSingles.length > 0) {
        const dumpable = plays.filter(p =>
          p.length === 1 && analysis.isolatedSingles.some(s => s.id === p[0].id),
        )
        if (dumpable.length > 0) return dumpable.sort((a, b) => comboValue(a) - comboValue(b))[0]
      }
      return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
  }

  // Responding: beat with lowest to preserve hand
  return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
}

// ── Level 5 — Expert ────────────────────────────────────

/**
 * Level 5 — Expert.
 *
 * Adds over level 4:
 * - Pass inference: estimates probability a play will go through based on
 *   opponents' pass history
 * - 1-ply lookahead: scores each candidate play by (success probability × hand improvement)
 * - Strict bomb policy: only bomb when it enables an immediate win or opponent
 *   is at ≤1 card and we hold ≥2 bombs
 * - Farmer style inference: defers to the ally who is running low faster
 * - Endgame: exact search kicks in at ≤5 cards
 */
function level5(input: AIInput): Card[] | null {
  const { hand, lastPlayed, isLandlord, playerCardCounts, passHistory = [] } = input
  const myIdx = input.myPlayerIdx ?? (isLandlord ? 0 : 1)
  const llIdx = input.landlordIdx ?? (isLandlord ? myIdx : 0)

  let plays = getAllValidPlays(hand, lastPlayed)
  if (plays.length === 0) return null

  const analysis = analyseHand(hand)
  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))

  const { allies, opponents } = identifyRoles(myIdx, llIdx, isLandlord, playerCardCounts.length)

  const allyMinCards     = allies.length > 0 ? Math.min(...allies.map(i => playerCardCounts[i])) : Infinity
  const opponentMinCards = opponents.length > 0 ? Math.min(...opponents.map(i => playerCardCounts[i])) : Infinity
  const allyCanWinSoon   = allyMinCards <= 1
  const opponentAt1      = opponentMinCards <= 1

  // ── Strict bomb policy ──
  if (nonBombs.length > 0) {
    const bombWinsNow = bombs.some(b => b.length === hand.length)  // bomb = last cards
    const canAffordBomb = analysis.bombCount >= 2

    if (!allyCanWinSoon && (bombWinsNow || (opponentAt1 && canAffordBomb)) && bombs.length > 0) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
    plays = nonBombs
  } else if (bombs.length > 0) {
    if (!allyCanWinSoon) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
    if (lastPlayed !== null) return null  // pass to let ally finish
    return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  if (plays.length === 0) return null

  // ── Exact endgame search (≤5 cards) ──
  if (hand.length <= 5) {
    const winning = findWinningSequence(hand, lastPlayed, 0)
    if (winning && winning.length > 0) {
      const combo = parseCombo(winning)
      if (combo && isValidPlay(combo, lastPlayed)) return winning
    }
  }

  // ── Farmer: defer to faster-depleting ally ──
  if (!isLandlord && allies.length > 0) {
    const fastestAlly = allies.reduce((best, i) =>
      playerCardCounts[i] < playerCardCounts[best] ? i : best, allies[0],
    )
    const allyDepleting = playerCardCounts[fastestAlly] < hand.length * 0.7

    if (allyDepleting && allyMinCards <= 3 && lastPlayed !== null) {
      // Defer: if we can pass, do so; otherwise play lowest
      const lowerThanAlly = plays.filter(p => comboValue(p) < 14)
      if (lowerThanAlly.length > 0) {
        return lowerThanAlly.sort((a, b) => comboValue(a) - comboValue(b))[0]
      }
      return null  // pass
    }
  }

  // ── 1-ply lookahead ──
  const candidates = plays
    .slice(0, 18)  // cap for performance
    .map(p => ({ play: p, score: scorePlay(p, input) }))
    .sort((a, b) => b.score - a.score)

  if (candidates.length > 0) {
    const best = candidates[0].play
    const bestCombo = parseCombo(best)
    if (bestCombo && isValidPlay(bestCombo, lastPlayed)) return best
  }

  // ── Fallback: level 4 logic ──
  return level4(input)
}

// ── Public API ─────────────────────────────────────────

/**
 * Main AI entry point. Returns the cards to play, or null to pass.
 */
export function aiPlay(input: AIInput, level: AILevel): Card[] | null {
  switch (level) {
    case 1: return level1(input)
    case 2: return level2(input)
    case 3: return level3(input)
    case 4: return level4(input)
    case 5: return level5(input)
  }
}

/** Simple heuristic: should AI bid to become landlord? */
export function shouldBid(hand: Card[]): boolean {
  const grp = groupCards(hand)
  const highCards = hand.filter(c => c.value >= 15).length
  const hasBomb   = [...grp.values()].some(cs => cs.length >= 4)
  return highCards >= 2 || hasBomb || Math.random() < 0.25
}
