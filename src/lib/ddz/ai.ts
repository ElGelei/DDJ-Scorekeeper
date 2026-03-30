// ────────────────────────────────────────────────────────
//  DDZ AI — rule-based, levels 1-3
// ────────────────────────────────────────────────────────

import {
  Card, Combo,
  parseCombo, isValidPlay, RANK_VALUES,
} from './engine'

export type AILevel = 1 | 2 | 3

export interface AIInput {
  hand: Card[]
  /** Combo the AI must beat, or null if it leads the trick */
  lastPlayed: Combo | null
  /** All cards that have already been played (for level-3 memory) */
  playedCards: Card[]
  /** true = this AI is the landlord */
  isLandlord: boolean
  /** Number of cards remaining in each player's hand [0=human,1=ai1,2=ai2] */
  playerCardCounts: number[]
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
    // Attach the lowest available pair
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

      // Pure airplane
      result.push(airplaneCards)

      const remaining = hand.filter(c => !airplaneIds.has(c.id)).sort((a, b) => a.value - b.value)

      // Airplane + lowest solo wings
      if (remaining.length >= len) {
        result.push([...airplaneCards, ...remaining.slice(0, len)])
      }

      // Airplane + lowest pair wings
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

// ── AI levels ──────────────────────────────────────────

function isBombOrRocket(cards: Card[]): boolean {
  const t = parseCombo(cards)?.type
  return t === 'BOMB' || t === 'ROCKET'
}

function comboValue(cards: Card[]): number {
  return parseCombo(cards)?.value ?? 0
}

/** Level 1 — picks a random valid play, or passes. */
function level1(input: AIInput): Card[] | null {
  const plays = getAllValidPlays(input.hand, input.lastPlayed)
  if (plays.length === 0) return null
  return plays[Math.floor(Math.random() * plays.length)]
}

/** Level 2 — avoids wasting bombs, prefers low cards. */
function level2(input: AIInput): Card[] | null {
  let plays = getAllValidPlays(input.hand, input.lastPlayed)
  if (plays.length === 0) return null

  // Separate bombs/rockets from regular plays
  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))

  // Prefer non-bomb plays; only use a bomb if forced
  if (nonBombs.length > 0) plays = nonBombs

  // When leading (no lastPlayed), avoid high cards (2s, jokers) unless hand is small
  if (!input.lastPlayed && input.hand.length > 5) {
    const safe = plays.filter(p => p.every(c => c.value <= 14))
    if (safe.length > 0) plays = safe
  }

  // Play the combo with the lowest primary value
  return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
}

/** Estimates how many turns remain before someone empties their hand. */
function turnsRemaining(counts: number[]): number {
  return Math.min(...counts)
}

/** Counts high cards (2s and jokers) in a hand. */
function countHighCards(hand: Card[]): number {
  return hand.filter(c => c.value >= 15).length
}

/** Level 3 — strategic: tracks played cards, role-aware, knows when to bomb. */
function level3(input: AIInput): Card[] | null {
  const { hand, lastPlayed, playedCards, isLandlord, playerCardCounts } = input

  let plays = getAllValidPlays(hand, lastPlayed)
  if (plays.length === 0) return null

  const bombs    = plays.filter(isBombOrRocket)
  const nonBombs = plays.filter(p => !isBombOrRocket(p))
  const urgency  = turnsRemaining(playerCardCounts)

  // Bomb strategy: use bomb only if urgent or no other option
  if (nonBombs.length > 0) {
    plays = nonBombs
    // Use a bomb if opponent is about to win (≤2 cards left) and we can't stop them otherwise
    const opponentWinning = playerCardCounts.some((cnt, i) => {
      const isOpponent = isLandlord ? (i === 1 || i === 2) : i === 0
      return isOpponent && cnt <= 2
    })
    if (opponentWinning && bombs.length > 0) {
      return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
    }
  } else if (bombs.length > 0) {
    // No non-bomb option — use lowest bomb
    return bombs.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // Landlord strategy: attack aggressively, empty hand fast
  if (isLandlord) {
    // Lead with the highest combo we can to dominate
    if (!lastPlayed) {
      // Play the strongest non-bomb combo (highest value)
      return plays.sort((a, b) => comboValue(b) - comboValue(a))[0]
    }
    // Responding: beat with lowest possible to preserve hand
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // Farmer strategy: coordinate — don't block the other farmer
  // If another farmer (non-zero index) has ≤ 3 cards, pass to let them win
  const otherFarmerAhead = playerCardCounts.some((cnt, i) => {
    return i !== 0 && !isLandlord && cnt <= 3
  })
  if (otherFarmerAhead && lastPlayed) {
    // Pass unless we'd otherwise lose the round to the landlord
    const landlordIdx = 0 // assume player 0 is human; landlord can be any
    // If we must respond to landlord, play our weakest valid combo
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // Default: play lowest valid combo when responding; highest when leading
  if (lastPlayed) {
    return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
  }

  // Leading: if hand is large, prefer multi-card combos to empty hand faster
  const multiCard = plays.filter(p => p.length > 1).sort((a, b) => comboValue(a) - comboValue(b))
  if (multiCard.length > 0 && hand.length > 6) return multiCard[0]

  return plays.sort((a, b) => comboValue(a) - comboValue(b))[0]
}

// ── Public API ─────────────────────────────────────────

/**
 * Main AI entry point.
 * Returns the cards to play, or null to pass.
 */
export function aiPlay(input: AIInput, level: AILevel): Card[] | null {
  switch (level) {
    case 1: return level1(input)
    case 2: return level2(input)
    case 3: return level3(input)
  }
}

/** Simple heuristic: should AI bid to become landlord? */
export function shouldBid(hand: Card[]): boolean {
  const highCards = countHighCards(hand)
  const grp = groupCards(hand)
  const hasBomb = [...grp.values()].some(cs => cs.length >= 4)
  return highCards >= 2 || hasBomb || Math.random() < 0.25
}
