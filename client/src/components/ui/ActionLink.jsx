import { Link } from 'react-router-dom'

// Renders a router Link for `to`, an anchor for `href`, otherwise a <button>.
export default function ActionLink({ to, href, type = 'button', ...props }) {
  if (to) return <Link to={to} {...props} />
  if (href) return <a href={href} {...props} />
  return <button type={type} {...props} />
}
