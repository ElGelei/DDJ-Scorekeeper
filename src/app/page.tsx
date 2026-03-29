import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-crimson/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-64 h-64 rounded-full bg-gold/5 blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-sm w-full animate-fade-in">
        {/* Chinese title */}
        <div className="mb-2">
          <span className="font-chinese text-7xl text-gold-gradient bg-gold-gradient bg-clip-text text-transparent">
            斗地主
          </span>
        </div>

        {/* Ornamental divider */}
        <div className="flex items-center gap-3 justify-center mb-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/50" />
          <span className="text-gold text-xs">♦</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/50" />
        </div>

        {/* English subtitle */}
        <h1 className="font-display text-xl text-parchment/90 mb-1 tracking-widest">
          DOH DI JOW
        </h1>
        <p className="font-body text-parchment/50 text-sm italic mb-12">
          Fight the Landlord · 打分神器
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full py-4 bg-gold-gradient text-ink font-display font-bold tracking-widest rounded-lg text-sm uppercase transition-all duration-200 hover:opacity-90 active:scale-95"
          >
            Enter the Game
          </Link>
          <Link
            href="/login?tab=signup"
            className="w-full py-4 border border-gold/40 text-gold font-display tracking-widest rounded-lg text-sm uppercase transition-all duration-200 hover:border-gold hover:bg-gold/5 active:scale-95"
          >
            Create Account
          </Link>
        </div>

        {/* Card suits decoration */}
        <div className="mt-12 flex justify-center gap-6 text-2xl opacity-20">
          <span>♠</span>
          <span className="text-crimson">♥</span>
          <span className="text-crimson">♦</span>
          <span>♣</span>
        </div>
      </div>
    </main>
  )
}
