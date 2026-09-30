import { PlayIcon } from './icons.jsx'
import { Card, Chip } from './ui.jsx'

export default function ScenesTab({ scenes, nodes, notify }) {
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name ?? id

  return (
    <Card title="Scenes" subtitle="Scenes stored on-device via the BLE Mesh Scene model. Recall applies the saved state to every registered node.">
      {scenes.length === 0 ? (
        <p className="empty">No scenes configured.</p>
      ) : (
        <div className="grid-2">
          {scenes.map((s) => (
            <article key={s.id} className="item">
              <div className="item-head">
                <div>
                  <h3 className="item-title">{s.name}</h3>
                  <p className="muted small">
                    scene_id: {s.id} · {s.members.length} {s.members.length === 1 ? 'node' : 'nodes'} registered
                  </p>
                </div>
                <span className="badge">#{s.number}</span>
              </div>
              <div className="chips">
                {s.members.map((id) => <Chip key={id}>{nodeName(id)}</Chip>)}
              </div>
              <div className="item-foot">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => notify(`Recalled scene ${s.name}`)}>
                  <PlayIcon /> Recall
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  )
}
