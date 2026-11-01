import { courses } from '../../data/siteContent.js'
import TextLink from '../ui/TextLink.jsx'
import CourseCard from './CourseCard.jsx'
import SectionHeading from './SectionHeading.jsx'

export default function CoursesSection() {
  return (
    <section className="section-wrap courses-section" id="courses">
      <SectionHeading
        label="01 / Find your track"
        title="Courses built"
        highlight="around you."
        intro="The right support at the right stage. Choose a track, find your rhythm and keep moving forward."
      />
      <div className="course-grid">
        {courses.map((course) => <CourseCard course={course} key={course.title} />)}
      </div>
      <div className="soon-card reveal">
        <span className="soon-stamp">SOON</span>
        <div><p className="section-label">02 / On the horizon</p><h3>New batches are taking shape.</h3></div>
        <p>Be the first to know when our next learning track opens.</p>
        <TextLink href="#about">Join the waitlist</TextLink>
      </div>
    </section>
  )
}
