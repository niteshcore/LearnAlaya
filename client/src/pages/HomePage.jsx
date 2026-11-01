import AboutSection from '../components/home/AboutSection.jsx'
import CoursesSection from '../components/home/CoursesSection.jsx'
import HeroSection from '../components/home/HeroSection.jsx'
import Marquee from '../components/home/Marquee.jsx'
import WhySection from '../components/home/WhySection.jsx'
import Footer from '../components/layout/Footer.jsx'
import Navbar from '../components/layout/Navbar.jsx'

export default function HomePage() {
  return (
    <div className="site-shell">
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
