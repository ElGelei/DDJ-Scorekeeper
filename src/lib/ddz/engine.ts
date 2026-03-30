// ────────────────────────────────────────────────────────
//  DDZ Engine — pure TypeScript, no dependencies
// ────────────────────────────────────────────────────────

export const RANK_VALUES: Record<string, number> = {
  '3': 3,  '4': 4,  '5': 5,  '6': 6,  '7': 7,
  '8': 8,  '9': 9,  '10': 10, 'J': 11, 'Q': 12,
  'K': 13, 'A': 14, '2': 15, 'PJ': 16, 'GJ': 17,
}

export type Rank =
  | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A' | '2' | 'PJ' | 'GJ'

export type Suit = '♠' | '♥' | '♦' | '♣' | ''

export interface Card {
  id: string    // unique, e.g. "3-♠" or "PJ"
  rank: Rank
  suit: Suit
  value: number // numeric rank for comparison
}

export type ComboType =
  | 'SINGLE'
  | 'PAIR'
  | 'TRIPLE'
  | 'TRIPLE_SOLO'
  | 'TRIPLE_PAIR'
  | 'STRAIGHT'
  | 'STRAIGHT_PAIR'
  | 'AIRPLANE'
  | 'AIRPLANE_SOLO'
  | 'AIRPLANE_PAIR'
  | 'BOMB'
  | 'ROCKET'

export interface Combo {
  type: ComboType
  /** Primary rank used for comparison (e.g. triple rank, highest straight card) */
  value: number
  /** Total number of cards */
  length: number
  cards: Card[]
}

// ── Deck creation ──────────────────────────────────────

const NORMAL_RANKS: Rank[] = [
  '3','4','5','6','7','8','9','10','J','Q','K','A','2',
]
const SUITS: Suit[] = ['♠','♥','♦','♣']

/** Returns a fresh, ordered 54-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of NORMAL_RANKS) {
      deck.push({ id: `${rank}-${suit}`, rank, suit, value: RANK_VALUES[rank] })
    }
  }
  deck.push({ id: 'PJ', rank: 'PJ', suit: '', value: 16 })
  deck.push({ id: 'GJ', rank: 'GJ', suit: '', value: 17 })
  return deck
}

/** Fisher-Yates shuffle (returns new array). */
export function shuffle(deck: Card[]): Card[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/** Deal 17 cards to each of 3 players + 3 landlord cards. */
export function deal(deck: Card[]): {
  hands: [Card[], Card[], Card[]]
  landlordCards: Card[]
} {
  return {
    hands: [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)],
    landlordCards: deck.slice(51),
  }
}

// ── Internal helpers ───────────────────────────────────

/** Groups cards by value, returns sorted [value, count][] pairs. */
function groupByValue(cards: Card[]): [number, number][] {
  const map = new Map<number, number>()
  for (const c of cards) map.set(c.value, (map.get(c.value) ?? 0) + 1)
  return [...map.entries()].sort(([a], [b]) => a - b)
}

function isConsecutive(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v === values[i - 1] + 1)
}

// ── parseCombo ─────────────────────────────────────────

/**
 * Identifies the combination formed by the given cards.
 * Returns null if the cards don't form a valid DDZ combo.
 */
export function parseCombo(cards: Card[]): Combo | null {
  const n = cards.length
  if (n === 0) return null

  const sorted = [...cards].sort((a, b) => a.value - b.value)
  const groups = groupByValue(sorted)

  const make = (type: ComboType, value: number): Combo =>
    ({ type, value, length: n, cards: sorted })

  // ── ROCKET ──────────────────────────────────────────
  if (
    n === 2 &&
    groups.length === 2 &&
    groups[0][0] === 16 &&
    groups[1][0] === 17
  ) return make('ROCKET', 17)

  // ── SINGLE ──────────────────────────────────────────
  if (n === 1) return make('SINGLE', sorted[0].value)

  // ── PAIR ────────────────────────────────────────────
  if (n === 2 && groups.length === 1 && groups[0][1] === 2)
    return make('PAIR', groups[0][0])

  // ── TRIPLE ──────────────────────────────────────────
  if (n === 3 && groups.length === 1 && groups[0][1] === 3)
    return make('TRIPLE', groups[0][0])

  // ── BOMB ────────────────────────────────────────────
  if (n === 4 && groups.length === 1 && groups[0][1] === 4)
    return make('BOMB', groups[0][0])

  // ── TRIPLE_SOLO (3+1) ────────────────────────────────
  if (n === 4) {
    const triple = groups.find(([, c]) => c === 3)
    const single = groups.find(([, c]) => c === 1)
    if (triple && single) return make('TRIPLE_SOLO', triple[0])
  }

  // ── TRIPLE_PAIR (3+2) ────────────────────────────────
  if (n === 5) {
    const triple = groups.find(([, c]) => c === 3)
    const pair   = groups.find(([, c]) => c === 2)
    if (triple && pair) return make('TRIPLE_PAIR', triple[0])
  }

  // ── STRAIGHT (≥5 cards, all distinct, consecutive, no 2/joker) ──
  if (n >= 5 && n <= 12 && groups.length === n) {
    const vals = groups.map(([v]) => v)
    if (
      groups.every(([, c]) => c === 1) &&
      vals.every(v => v <= 14) &&
      isConsecutive(vals)
    ) return make('STRAIGHT', vals[vals.length - 1])
  }

  // ── STRAIGHT_PAIR (≥3 consecutive pairs, no 2/joker) ──
  if (n >= 6 && n % 2 === 0 && groups.length === n / 2) {
    const vals = groups.map(([v]) => v)
    if (
      groups.every(([, c]) => c === 2) &&
      vals.every(v => v <= 14) &&
      isConsecutive(vals)
    ) return make('STRAIGHT_PAIR', vals[vals.length - 1])
  }

  // ── AIRPLANE variants ────────────────────────────────
  // Eligible airplane ranks: value ≤ 14 AND count ≥ 3
  const tripleRanks = groups
    .filter(([v, c]) => c >= 3 && v <= 14)
    .map(([v]) => v)
    .sort((a, b) => a - b)

  if (tripleRanks.length >= 2) {
    for (let start = 0; start < tripleRanks.length; start++) {
      // Find max consecutive run from this start
      let maxLen = 1
      while (
        start + maxLen < tripleRanks.length &&
        tripleRanks[start + maxLen] === tripleRanks[start + maxLen - 1] + 1
      ) maxLen++

      // Try longest sequences first (avoids mis-identifying sub-sequences)
      for (let len = maxLen; len >= 2; len--) {
        const seq = tripleRanks.slice(start, start + len)
        if (!isConsecutive(seq)) continue

        const airplaneCount = seq.length * 3
        const kickerCount = n - airplaneCount
        if (kickerCount < 0) continue

        // Build remaining card map after taking 3 from each airplane rank
        const rem = new Map(groups)
        for (const v of seq) {
          const c = rem.get(v)!
          if (c === 3) rem.delete(v)
          else rem.set(v, c - 3)
        }
        const remTotal = [...rem.values()].reduce((a, b) => a + b, 0)
        if (remTotal !== kickerCount) continue

        const highVal = seq[seq.length - 1]

        // Pure AIRPLANE
        if (kickerCount === 0) return make('AIRPLANE', highVal)

        // AIRPLANE_SOLO: exactly n solo kicker cards
        if (kickerCount === seq.length) return make('AIRPLANE_SOLO', highVal)

        // AIRPLANE_PAIR: exactly n pair kicker cards
        if (kickerCount === seq.length * 2) {
          const remEntries = [...rem.entries()]
          const totalPairs = remEntries.reduce((s, [, c]) => s + Math.floor(c / 2), 0)
          if (
            remEntries.every(([, c]) => c % 2 === 0) &&
            totalPairs === seq.length
          ) return make('AIRPLANE_PAIR', highVal)
        }
      }
    }
  }

  return null
}

// ── isValidPlay ────────────────────────────────────────

/**
 * Returns true if `played` can beat `lastPlayed`.
 * Pass `null` for lastPlayed when the player leads the trick.
 */
export function isValidPlay(played: Combo, lastPlayed: Combo | null): boolean {
  if (!lastPlayed) return true

  // ROCKET beats everything
  if (played.type === 'ROCKET') return true

  // BOMB beats everything except ROCKET
  if (played.type === 'BOMB') {
    if (lastPlayed.type === 'ROCKET') return false
    if (lastPlayed.type === 'BOMB') return played.value > lastPlayed.value
    return true
  }

  // Non-bomb cannot beat ROCKET or BOMB
  if (lastPlayed.type === 'ROCKET' || lastPlayed.type === 'BOMB') return false

  // Must match type AND length, then beat by value
  if (played.type !== lastPlayed.type) return false
  if (played.length !== lastPlayed.length) return false
  return played.value > lastPlayed.value
}
