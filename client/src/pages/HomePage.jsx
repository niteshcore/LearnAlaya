import AboutSection from '../components/home/AboutSection.jsx'
import CoursesSection from '../components/home/CoursesSection.jsx'
import HeroSection from '../components/home/HeroSection.jsx'
import Marquee from '../components/home/Marquee.jsx'
import WhySection from '../components/home/WhySection.jsx'
import Footer from '../components/layout/Footer.jsx'
import Navbar from '../components/layout/Navbar.jsx'
import useScrollReveal from '../hooks/useScrollReveal.js'

export default function HomePage() {
  const revealRoot = useScrollReveal()

  return (
    <div className="site-shell" ref={revealRoot}>
      <Navbar />
      <main id="top">
        <HeroSection />
        <Marquee />
        <CoursesSection />
        <WhySection />
        <AboutSection />
      </main>
      <Footer />
    </div>
  )
}
