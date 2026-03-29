export interface User {
  id: string
  display_name: string
  player_id: string
  avatar_url: string | null
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  requester?: User
  addressee?: User
}

export interface Room {
  id: string
  name: string
  code: string
  created_by: string
  created_at: string
  members?: RoomMember[]
}

export interface RoomMember {
  room_id: string
  user_id: string
  player_slot: number
  joined_at: string
  user?: User
}

export interface Session {
  id: string
  room_id: string
  started_at: string
  ended_at: string | null
}

export interface Round {
  id: string
  room_id: string
  session_id: string
  landlord_slot: number
  winner: 'landlord' | 'peasants'
  pts: number
  multiplier: number
  played_at: string
}
