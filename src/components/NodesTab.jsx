import { typeLabel } from '../devices/index.js'
import ControlSection from './ControlSection.jsx'
import EntityCard from './EntityCard.jsx'

export default function NodesTab({ nodes, selectedId, onSelect, onUpdate }) {
  const selected = nodes.find((n) => n.id === selectedId) ?? null
  const online = nodes.filter((n) => n.online).length

  return (
    <div className="stack">
      <ControlSection
        title="Node Control"
        subtitle="Node commands — sent to the selected node only."
        target={selected}
        online={selected?.online}
        disabledNote={selected && !selected.online ? 'This node is offline — controls are disabled.' : null}
        emptyText={nodes.length ? 'Select a node from the list below to control it.' : 'No nodes available.'}
        info={
          selected
            ? [
                { label: 'Node ID', value: selected.id },
                { label: 'Type', value: typeLabel(selected.type) },
                { label: 'Product', value: selected.product },
                { label: 'MAC', value: selected.mac },
                { label: 'Connection', value: selected.online ? 'online' : 'offline' },
              ]
            : []
        }
        onChange={(patch) => onUpdate(selected.id, patch)}
      />

      <section className="card">
        <header className="list-head">
          <strong>{nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}</strong>
          <span className="count"><span className="dot dot-on" />{online}</span>
          <span className="count"><span className="dot dot-bad" />{nodes.length - online}</span>
        </header>

        {nodes.length === 0 ? (
          <p className="empty">No nodes provisioned yet.</p>
        ) : (
          <div className="entity-grid">
            {nodes.map((node) => (
              <EntityCard
                key={node.id}
                name={node.name}
                on={node.on && node.online}
                disabled={!node.online}
                selected={node.id === selectedId}
                onToggle={(on) => onUpdate(node.id, { on })}
                onSelect={() => onSelect(node.id)}
              >
                <span className={`dot ${node.online ? 'dot-on' : 'dot-bad'}`} />
                {node.online ? 'Online' : 'Offline'}
                <span className="type-tag">{typeLabel(node.type)}</span>
                <span className="mono entity-card-id">{node.id}</span>
              </EntityCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
