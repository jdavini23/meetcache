export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer 
      id="main-footer"
      className="bg-cream px-6 pb-16 mt-auto"
    >
      <div className="max-w-6xl mx-auto pt-10 border-t border-ink/10 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Wordmark logo */}
        <div 
          id="footer-logo"
          className="font-serif text-2xl font-bold tracking-tight text-ink cursor-pointer"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Cache<span className="text-terracotta">.</span>
        </div>

        {/* Brand Tagline & Info */}
        <div 
          id="footer-tagline"
          className="font-sans text-[10px] uppercase tracking-widest text-ink/50 flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center sm:text-left"
        >
          <span>Made for parents</span>
          <span className="hidden sm:inline text-ink/20">•</span>
          <a 
            href="https://meetcache.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-terracotta hover:underline transition-colors duration-200"
          >
            meetcache.com
          </a>
          <span className="hidden sm:inline text-ink/20">•</span>
          <a href="/privacy" className="hover:text-terracotta hover:underline transition-colors duration-200">Privacy</a>
          <span className="hidden sm:inline text-ink/20">•</span>
          <span>&copy; {currentYear} Cache</span>
        </div>
      </div>
    </footer>
  );
}
