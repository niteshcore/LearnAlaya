import { benefits } from '../../data/siteContent.js'
import SectionHeading from './SectionHeading.jsx'

export default function WhySection() {
  return (
    <section className="why-section" id="why-us">
      <div className="section-wrap">
        <SectionHeading
          light
          label="03 / The LearnAlaya way"
          title="More than"
          highlight="tuition."
          intro="We make space for questions, celebrate the small wins and help every student see what they are capable of."
        />
        <div className="benefit-grid">
          {benefits.map(([number, title, copy]) => (
            <article className="benefit" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </div>
    </section>
  )
}
