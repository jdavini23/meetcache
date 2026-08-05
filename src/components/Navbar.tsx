interface NavbarProps {
  onJoinClick: () => void;
}

export default function Navbar({ onJoinClick }: NavbarProps) {
  return (
    <nav 
      id="top-navigation"
      className="sticky top-0 z-50 w-full backdrop-blur-md bg-cream/80 border-b border-ink/10 py-5 transition-all duration-200"
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        {/* Wordmark */}
        <div 
          id="nav-logo"
          className="font-serif text-2xl font-bold tracking-tight text-ink select-none cursor-pointer"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Cache<span className="text-terracotta">.</span>
        </div>

        {/* CTA Button */}
        <button
          id="nav-cta-button"
          onClick={onJoinClick}
          className="font-sans text-sm font-medium border border-ink px-5 py-2 rounded-full hover:bg-ink hover:text-cream transition-colors duration-200 cursor-pointer shadow-sm active:scale-[0.98]"
        >
          Get early access
        </button>
      </div>
    </nav>
  );
}
