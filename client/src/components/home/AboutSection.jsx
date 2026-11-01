import Button from '../ui/Button.jsx'

export default function AboutSection() {
  return (
    <section className="about-section section-wrap" id="about">
      <div className="about-art"><span>EVERY<br />STUDENT<br /><b>MATTERS.</b></span><i>✦</i></div>
      <div className="about-copy">
        <p className="section-label">04 / A better starting point</p>
        <h2>Let’s make<br /><span>progress visible.</span></h2>
        <p>LearnAlaya is being built for students who want to understand deeply, practise consistently and grow without the pressure to have it all figured out.</p>
        <Button href="#login">Start a conversation</Button>
      </div>
    </section>
  )
}
