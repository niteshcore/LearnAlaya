export default function SectionHeading({ label, title, highlight, intro, light = false }) {
  return (
    <div className={`section-heading reveal${light ? ' light-heading' : ''}`}>
      <div><p className="section-label">{label}</p><h2>{title}<br /><span>{highlight}</span></h2></div>
      <p className="section-intro">{intro}</p>
    </div>
  )
}
