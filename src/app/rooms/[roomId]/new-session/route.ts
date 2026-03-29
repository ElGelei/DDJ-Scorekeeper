import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({ room_id: params.roomId })
    .select()
    .single()

  if (error || !session) {
    return NextResponse.redirect(new URL(`/rooms/${params.roomId}`, request.url))
  }

  return NextResponse.redirect(
    new URL(`/rooms/${params.roomId}/session/${session.id}`, request.url)
  )
}
