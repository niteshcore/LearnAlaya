import { Fragment } from 'react'
import { marqueeItems } from '../../data/siteContent.js'

export default function Marquee() {
  return (
    <div className="marquee" aria-label="LearnAlaya highlights">
      <div className="marquee-track">
        {marqueeItems.map((item, index) => (
          <Fragment key={index}>{item} <span>✦</span> </Fragment>
        ))}
      </div>
    </div>
  )
}
