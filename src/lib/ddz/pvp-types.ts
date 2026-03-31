import type { Card, Combo } from './engine'

export type GameStatus = 'bidding' | 'playing' | 'finished'
export type MoveType = 'bid' | 'play' | 'pass' | 'timeout'

/** Everything visible to all players */
export interface PublicGameState {
  gameId: string
  roomId: string
  status: GameStatus
  currentPlayerSlot: number
  landlordSlot: number | null
  landlordCards: Card[] | null
  multiplier: number
  baseBid: number
  bids: (number | null)[]   // [slot0, slot1, slot2]
  cardCounts: [number, number, number]
  lastMove: LastMove | null
  lastActionAt: string
}

export interface LastMove {
  slot: number
  type: MoveType
  cards: Card[] | null
  combo: Combo | null
  bidValue?: number
}

/** Private to each player */
export interface PrivatePlayerState {
  hand: Card[]
  slot: number
}

/** Combined response */
export interface GameStateResponse {
  public: PublicGameState
  private: PrivatePlayerState
}
