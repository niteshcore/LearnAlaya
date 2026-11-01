import ActionLink from './ActionLink.jsx'

export default function Brand({ tagline = 'Learn boldly. Grow steadily.', className = '', ...props }) {
  return (
    <ActionLink className={`brand ${className}`.trim()} {...props}>
      <span className="brand-mark">L</span>
      <span>
        <strong>LearnAlaya</strong>
        <small>{tagline}</small>
      </span>
    </ActionLink>
  )
}
