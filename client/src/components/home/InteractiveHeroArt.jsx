import { useRef, useState } from 'react'

export default function InteractiveHeroArt() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0 })

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }
    setDragging(true)
  }

  function handlePointerMove(event) {
    if (!dragging) return
    setOffset({
      x: Math.max(-110, Math.min(55, event.clientX - start.current.x)),
      y: Math.max(-35, Math.min(35, event.clientY - start.current.y)),
    })
  }

  function handlePointerUp() {
    setDragging(false)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="hero-art" aria-label="LearnAlaya learning illustration">
      <div className="art-sun">✦</div>
      <div className="art-card art-card-back"><span>learn</span><strong>with<br />purpose.</strong></div>
      <div
        className={`art-card art-card-front ${dragging ? 'is-dragging' : ''}`}
        style={{ '--drag-x': `${offset.x}px`, '--drag-y': `${offset.y}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="card-kicker">Drag me</span>
        <strong>bright<br /><mark>chapter.</mark></strong>
        <div className="card-footer"><span>LA / 01</span><span>↗</span></div>
      </div>
      <span className="art-caption">CURIOUS<br />MINDS CLUB</span>
    </div>
  )
}
