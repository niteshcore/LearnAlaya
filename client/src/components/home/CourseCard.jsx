import ArrowIcon from '../ui/ArrowIcon.jsx'

export default function CourseCard({ course }) {
  return (
    <article className={`course-card ${course.tone}`} tabIndex="0">
      <div className="course-top"><span className="course-status"><i /> {course.eyebrow}</span><span className="course-icon">{course.icon}</span></div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="course-bottom"><span>{course.grades}</span><a href="#login" aria-label={`Learn more about ${course.title}`}><ArrowIcon /></a></div>
    </article>
  )
}
