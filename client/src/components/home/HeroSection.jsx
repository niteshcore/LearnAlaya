import Button from '../ui/Button.jsx'
import Pill from '../ui/Pill.jsx'
import TextLink from '../ui/TextLink.jsx'
import InteractiveHeroArt from './InteractiveHeroArt.jsx'

export default function HeroSection() {
  return (
    <section className="hero section-wrap">
      <div className="hero-copy">
        <Pill>Admissions open for 2026–27</Pill>
        <h1>Make learning<br /><em>click.</em></h1>
        <p className="hero-lede">
          A focused, friendly learning space where strong concepts turn into lasting confidence.
        </p>
        <div className="hero-actions">
          <Button href="#courses">Explore courses</Button>
          <TextLink href="#about">Meet your mentors</TextLink>
        </div>
        <div className="hero-proof">
          <div className="avatar-stack" aria-hidden="true"><span>R</span><span>A</span><span>M</span></div>
          <p><strong>Small batches.</strong><br />Big progress.</p>
        </div>
      </div>
      <InteractiveHeroArt />
    </section>
  )
}
