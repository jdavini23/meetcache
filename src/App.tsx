import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ProductExample from './components/ProductExample';
import GeneralAIComparison from './components/GeneralAIComparison';
import TrustSafety from './components/TrustSafety';
import HowItWorks from './components/HowItWorks';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import CacheApp from './components/CacheApp';
import Privacy from './components/Privacy';

export default function App() {
  if (window.location.pathname.startsWith('/app')) return <CacheApp />;
  if (window.location.pathname === '/privacy') return <Privacy />;
  const handleScrollToSignup = () => {
    // Scroll to the main waitlist registration form container in the hero section
    const formElement = document.getElementById('hero-form-container');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Find the email input inside and focus it for excellent UX
      const emailInput = document.getElementById('hero-email-input') as HTMLInputElement | null;
      if (emailInput) {
        setTimeout(() => {
          emailInput.focus();
        }, 800); // Wait for the smooth scroll to finish/center
      }
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col selection:bg-terracotta/20 selection:text-terracotta overflow-x-hidden">
      {/* Sticky Top Navigation */}
      <Navbar onJoinClick={handleScrollToSignup} />

      {/* Main Content Sections */}
      <main className="flex-1">
        <Hero />
        <ProductExample />
        <GeneralAIComparison />
        <TrustSafety />
        <HowItWorks />
        <FinalCTA />
      </main>

      {/* 7. Footer */}
      <Footer />
    </div>
  );
}
