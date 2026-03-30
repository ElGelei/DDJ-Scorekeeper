import { describe, it, expect } from 'vitest'
import {
  createDeck, shuffle, deal,
  parseCombo, isValidPlay,
  RANK_VALUES,
  type Card, type Combo,
} from './engine'

// ── Helpers ────────────────────────────────────────────

function c(rank: string, suit: string = '♠'): Card {
  return { id: `${rank}-${suit}`, rank: rank as any, suit: suit as any, value: RANK_VALUES[rank] }
}

function cards(...specs: string[]): Card[] {
  // Each spec is "rank-suit" e.g. "3-♠" or just "rank" defaulting to ♠
  return specs.map(s => {
    const [rank, suit] = s.includes('-') ? s.split('-') : [s, '♠']
    return c(rank, suit)
  })
}

// ── createDeck ─────────────────────────────────────────

describe('createDeck', () => {
  it('produces 54 cards', () => {
    expect(createDeck()).toHaveLength(54)
  })

  it('contains 4 suits × 13 ranks + 2 jokers', () => {
    const deck = createDeck()
    const jokers = deck.filter(c => c.rank === 'PJ' || c.rank === 'GJ')
    const normal = deck.filter(c => c.rank !== 'PJ' && c.rank !== 'GJ')
    expect(jokers).toHaveLength(2)
    expect(normal).toHaveLength(52)
  })

  it('all card ids are unique', () => {
    const deck = createDeck()
    const ids = deck.map(c => c.id)
    expect(new Set(ids).size).toBe(54)
  })

  it('cards have correct values', () => {
    const deck = createDeck()
    const three = deck.find(c => c.rank === '3' && c.suit === '♠')!
    const gj    = deck.find(c => c.rank === 'GJ')!
    expect(three.value).toBe(3)
    expect(gj.value).toBe(17)
  })
})

// ── shuffle ────────────────────────────────────────────

describe('shuffle', () => {
  it('returns same number of cards', () => {
    const deck = createDeck()
    expect(shuffle(deck)).toHaveLength(54)
  })

  it('does not mutate the original', () => {
    const deck = createDeck()
    const first = deck[0]
    shuffle(deck)
    expect(deck[0]).toBe(first)
  })

  it('contains same cards (different order)', () => {
    const deck = createDeck()
    const shuffled = shuffle(deck)
    const origIds = deck.map(c => c.id).sort()
    const shuffIds = shuffled.map(c => c.id).sort()
    expect(shuffIds).toEqual(origIds)
  })
})

// ── deal ───────────────────────────────────────────────

describe('deal', () => {
  it('gives 17 cards to each player and 3 landlord cards', () => {
    const deck = createDeck()
    const { hands, landlordCards } = deal(deck)
    expect(hands[0]).toHaveLength(17)
    expect(hands[1]).toHaveLength(17)
    expect(hands[2]).toHaveLength(17)
    expect(landlordCards).toHaveLength(3)
  })

  it('covers all 54 cards without overlap', () => {
    const deck = createDeck()
    const { hands, landlordCards } = deal(deck)
    const allIds = [
      ...hands[0], ...hands[1], ...hands[2], ...landlordCards
    ].map(c => c.id)
    expect(new Set(allIds).size).toBe(54)
  })
})

// ── parseCombo ─────────────────────────────────────────

describe('parseCombo', () => {
  it('returns null for empty array', () => {
    expect(parseCombo([])).toBeNull()
  })

  // SINGLE
  it('recognises SINGLE', () => {
    const combo = parseCombo(cards('7'))!
    expect(combo.type).toBe('SINGLE')
    expect(combo.value).toBe(7)
    expect(combo.length).toBe(1)
  })

  it('recognises SINGLE with joker', () => {
    const combo = parseCombo([c('GJ')])!
    expect(combo.type).toBe('SINGLE')
    expect(combo.value).toBe(17)
  })

  // PAIR
  it('recognises PAIR', () => {
    const combo = parseCombo(cards('K-♠', 'K-♥'))!
    expect(combo.type).toBe('PAIR')
    expect(combo.value).toBe(13)
  })

  it('rejects two different ranks as PAIR', () => {
    expect(parseCombo(cards('3', '4'))).toBeNull()
  })

  // TRIPLE
  it('recognises TRIPLE', () => {
    const combo = parseCombo([c('A','♠'), c('A','♥'), c('A','♦')])!
    expect(combo.type).toBe('TRIPLE')
    expect(combo.value).toBe(14)
  })

  // BOMB
  it('recognises BOMB (four of a kind)', () => {
    const combo = parseCombo([
      c('5','♠'), c('5','♥'), c('5','♦'), c('5','♣'),
    ])!
    expect(combo.type).toBe('BOMB')
    expect(combo.value).toBe(5)
  })

  // ROCKET
  it('recognises ROCKET (both jokers)', () => {
    const combo = parseCombo([c('PJ'), c('GJ')])!
    expect(combo.type).toBe('ROCKET')
    expect(combo.value).toBe(17)
  })

  it('does not treat two non-joker cards as rocket', () => {
    expect(parseCombo(cards('2-♠', '2-♥'))?.type).toBe('PAIR')
  })

  // TRIPLE_SOLO
  it('recognises TRIPLE_SOLO', () => {
    const combo = parseCombo([
      c('8','♠'), c('8','♥'), c('8','♦'), c('3','♣'),
    ])!
    expect(combo.type).toBe('TRIPLE_SOLO')
    expect(combo.value).toBe(8)
    expect(combo.length).toBe(4)
  })

  it('does not confuse BOMB with TRIPLE_SOLO', () => {
    expect(parseCombo([c('8','♠'),c('8','♥'),c('8','♦'),c('8','♣')])!.type).toBe('BOMB')
  })

  // TRIPLE_PAIR
  it('recognises TRIPLE_PAIR', () => {
    const combo = parseCombo([
      c('J','♠'), c('J','♥'), c('J','♦'), c('9','♣'), c('9','♠'),
    ])!
    expect(combo.type).toBe('TRIPLE_PAIR')
    expect(combo.value).toBe(11)
    expect(combo.length).toBe(5)
  })

  // STRAIGHT
  it('recognises STRAIGHT (5 cards)', () => {
    const combo = parseCombo(cards('3','4','5','6','7'))!
    expect(combo.type).toBe('STRAIGHT')
    expect(combo.value).toBe(7)
    expect(combo.length).toBe(5)
  })

  it('recognises STRAIGHT (12 cards, max)', () => {
    const combo = parseCombo(cards('3','4','5','6','7','8','9','10','J','Q','K','A'))!
    expect(combo.type).toBe('STRAIGHT')
    expect(combo.value).toBe(14)
    expect(combo.length).toBe(12)
  })

  it('rejects STRAIGHT with 2 in it', () => {
    // 10-J-Q-K-A-2 is not valid
    expect(parseCombo([
      c('10'), c('J'), c('Q'), c('K'), c('A'), c('2'),
    ])).toBeNull()
  })

  it('rejects STRAIGHT shorter than 5', () => {
    expect(parseCombo(cards('3','4','5','6'))).toBeNull()
  })

  it('rejects non-consecutive STRAIGHT', () => {
    expect(parseCombo(cards('3','4','5','7','8'))).toBeNull()
  })

  // STRAIGHT_PAIR
  it('recognises STRAIGHT_PAIR (3 pairs)', () => {
    const combo = parseCombo([
      c('4','♠'),c('4','♥'), c('5','♠'),c('5','♥'), c('6','♠'),c('6','♥'),
    ])!
    expect(combo.type).toBe('STRAIGHT_PAIR')
    expect(combo.value).toBe(6)
    expect(combo.length).toBe(6)
  })

  it('rejects STRAIGHT_PAIR with only 2 pairs', () => {
    expect(parseCombo([
      c('4','♠'),c('4','♥'), c('5','♠'),c('5','♥'),
    ])).toBeNull()
  })

  it('rejects STRAIGHT_PAIR containing 2', () => {
    expect(parseCombo([
      c('K','♠'),c('K','♥'), c('A','♠'),c('A','♥'), c('2','♠'),c('2','♥'),
    ])).toBeNull()
  })

  // AIRPLANE
  it('recognises AIRPLANE (2 triples)', () => {
    const combo = parseCombo([
      c('5','♠'),c('5','♥'),c('5','♦'),
      c('6','♠'),c('6','♥'),c('6','♦'),
    ])!
    expect(combo.type).toBe('AIRPLANE')
    expect(combo.value).toBe(6)
    expect(combo.length).toBe(6)
  })

  it('recognises AIRPLANE (3 triples)', () => {
    const combo = parseCombo([
      c('7','♠'),c('7','♥'),c('7','♦'),
      c('8','♠'),c('8','♥'),c('8','♦'),
      c('9','♠'),c('9','♥'),c('9','♦'),
    ])!
    expect(combo.type).toBe('AIRPLANE')
    expect(combo.value).toBe(9)
  })

  it('rejects non-consecutive triples as AIRPLANE', () => {
    // 333 + 555 (gap at 4) — should parse as null or something else
    const combo = parseCombo([
      c('3','♠'),c('3','♥'),c('3','♦'),
      c('5','♠'),c('5','♥'),c('5','♦'),
    ])
    expect(combo?.type).not.toBe('AIRPLANE')
  })

  // AIRPLANE_SOLO
  it('recognises AIRPLANE_SOLO (2 triples + 2 solo)', () => {
    const combo = parseCombo([
      c('3','♠'),c('3','♥'),c('3','♦'),
      c('4','♠'),c('4','♥'),c('4','♦'),
      c('K','♠'), c('A','♠'),
    ])!
    expect(combo.type).toBe('AIRPLANE_SOLO')
    expect(combo.value).toBe(4)
    expect(combo.length).toBe(8)
  })

  it('recognises AIRPLANE_SOLO (3 triples + 3 solo)', () => {
    const combo = parseCombo([
      c('5','♠'),c('5','♥'),c('5','♦'),
      c('6','♠'),c('6','♥'),c('6','♦'),
      c('7','♠'),c('7','♥'),c('7','♦'),
      c('3','♠'), c('4','♠'), c('8','♠'),
    ])!
    expect(combo.type).toBe('AIRPLANE_SOLO')
    expect(combo.value).toBe(7)
    expect(combo.length).toBe(12)
  })

  // AIRPLANE_PAIR
  it('recognises AIRPLANE_PAIR (2 triples + 2 pairs)', () => {
    const combo = parseCombo([
      c('3','♠'),c('3','♥'),c('3','♦'),
      c('4','♠'),c('4','♥'),c('4','♦'),
      c('K','♠'),c('K','♥'),
      c('A','♠'),c('A','♥'),
    ])!
    expect(combo.type).toBe('AIRPLANE_PAIR')
    expect(combo.value).toBe(4)
    expect(combo.length).toBe(10)
  })

  // Prefers AIRPLANE over sub-sequence AIRPLANE_SOLO
  it('identifies pure 4-triple AIRPLANE correctly', () => {
    const combo = parseCombo([
      c('3','♠'),c('3','♥'),c('3','♦'),
      c('4','♠'),c('4','♥'),c('4','♦'),
      c('5','♠'),c('5','♥'),c('5','♦'),
      c('6','♠'),c('6','♥'),c('6','♦'),
    ])!
    expect(combo.type).toBe('AIRPLANE')
    expect(combo.value).toBe(6)
    expect(combo.length).toBe(12)
  })
})

// ── isValidPlay ────────────────────────────────────────

function combo(type: Combo['type'], value: number, length: number): Combo {
  return { type, value, length, cards: [] }
}

describe('isValidPlay', () => {
  it('any combo is valid when no last play', () => {
    expect(isValidPlay(combo('SINGLE', 3, 1), null)).toBe(true)
    expect(isValidPlay(combo('PAIR', 3, 2), null)).toBe(true)
    expect(isValidPlay(combo('BOMB', 3, 4), null)).toBe(true)
  })

  // SINGLE beats SINGLE
  it('higher single beats lower single', () => {
    expect(isValidPlay(combo('SINGLE', 5, 1), combo('SINGLE', 4, 1))).toBe(true)
    expect(isValidPlay(combo('SINGLE', 3, 1), combo('SINGLE', 4, 1))).toBe(false)
  })

  // Same type, same length comparison
  it('higher pair beats lower pair', () => {
    expect(isValidPlay(combo('PAIR', 10, 2), combo('PAIR', 9, 2))).toBe(true)
    expect(isValidPlay(combo('PAIR', 9, 2), combo('PAIR', 9, 2))).toBe(false)
  })

  // Type mismatch
  it('pair cannot beat a single', () => {
    expect(isValidPlay(combo('PAIR', 14, 2), combo('SINGLE', 3, 1))).toBe(false)
  })

  // Length mismatch for straights
  it('straight of different length cannot beat', () => {
    expect(isValidPlay(combo('STRAIGHT', 8, 6), combo('STRAIGHT', 7, 5))).toBe(false)
  })

  it('same-length higher straight beats lower', () => {
    expect(isValidPlay(combo('STRAIGHT', 8, 5), combo('STRAIGHT', 7, 5))).toBe(true)
  })

  // BOMB beats non-bomb
  it('BOMB beats any non-bomb', () => {
    expect(isValidPlay(combo('BOMB', 3, 4), combo('STRAIGHT', 14, 12))).toBe(true)
    expect(isValidPlay(combo('BOMB', 3, 4), combo('SINGLE', 17, 1))).toBe(true)
  })

  // BOMB beats lower BOMB
  it('higher BOMB beats lower BOMB', () => {
    expect(isValidPlay(combo('BOMB', 7, 4), combo('BOMB', 6, 4))).toBe(true)
    expect(isValidPlay(combo('BOMB', 5, 4), combo('BOMB', 6, 4))).toBe(false)
  })

  // ROCKET beats everything
  it('ROCKET beats BOMB', () => {
    expect(isValidPlay(combo('ROCKET', 17, 2), combo('BOMB', 14, 4))).toBe(true)
  })

  it('ROCKET beats any combo', () => {
    expect(isValidPlay(combo('ROCKET', 17, 2), combo('SINGLE', 16, 1))).toBe(true)
  })

  // Nothing beats ROCKET
  it('BOMB cannot beat ROCKET', () => {
    expect(isValidPlay(combo('BOMB', 14, 4), combo('ROCKET', 17, 2))).toBe(false)
  })

  it('SINGLE cannot beat ROCKET', () => {
    expect(isValidPlay(combo('SINGLE', 17, 1), combo('ROCKET', 17, 2))).toBe(false)
  })

  // Airplane_solo must match length
  it('AIRPLANE_SOLO must match length', () => {
    expect(isValidPlay(combo('AIRPLANE_SOLO', 9, 8), combo('AIRPLANE_SOLO', 8, 8))).toBe(true)
    expect(isValidPlay(combo('AIRPLANE_SOLO', 9, 10), combo('AIRPLANE_SOLO', 8, 8))).toBe(false)
  })

  // TRIPLE_SOLO
  it('TRIPLE_SOLO must match type and beat by value', () => {
    expect(isValidPlay(combo('TRIPLE_SOLO', 8, 4), combo('TRIPLE_SOLO', 7, 4))).toBe(true)
    expect(isValidPlay(combo('TRIPLE_SOLO', 6, 4), combo('TRIPLE_SOLO', 7, 4))).toBe(false)
  })
})

// ── Integration: parse then validate ──────────────────

describe('integration: parseCombo + isValidPlay', () => {
  it('correctly compares two actual STRAIGHT plays', () => {
    const low  = parseCombo(cards('3','4','5','6','7'))!
    const high = parseCombo(cards('5','6','7','8','9'))!
    expect(isValidPlay(high, low)).toBe(true)
    expect(isValidPlay(low, high)).toBe(false)
  })

  it('BOMB beats a high STRAIGHT', () => {
    const str  = parseCombo(cards('8','9','10','J','Q','K'))!
    const bomb = parseCombo([c('3','♠'),c('3','♥'),c('3','♦'),c('3','♣')])!
    expect(isValidPlay(bomb, str)).toBe(true)
  })

  it('ROCKET beats a BOMB', () => {
    const bomb   = parseCombo([c('A','♠'),c('A','♥'),c('A','♦'),c('A','♣')])!
    const rocket = parseCombo([c('PJ'), c('GJ')])!
    expect(isValidPlay(rocket, bomb)).toBe(true)
  })

  it('round-trip: deal → parse every card as SINGLE', () => {
    const deck = shuffle(createDeck())
    const { hands } = deal(deck)
    for (const hand of hands) {
      for (const card of hand) {
        const combo = parseCombo([card])!
        expect(combo.type).toBe('SINGLE')
        expect(combo.value).toBe(card.value)
      }
    }
  })
})
