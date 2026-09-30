import { typeLabel } from '../devices/index.js'
import ControlSection from './ControlSection.jsx'
import EntityCard from './EntityCard.jsx'

const hex = (n) => `0x${n.toString(16).toUpperCase()}`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function GroupsTab({ groups, nodes, selectedId, onSelect, onUpdate }) {
  const selected = groups.find((g) => g.id === selectedId) ?? null
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name ?? id

  return (
    <div className="stack">
      <ControlSection
        title="Group Control"
        subtitle="Group commands — broadcast to the group address, all members update simultaneously."
        target={selected}
        emptyText={groups.length ? 'Select a group from the list below to control it.' : 'No groups available.'}
        info={
          selected
            ? [
                { label: 'Group ID', value: selected.id },
                { label: 'Address', value: hex(selected.address) },
                { label: 'Type', value: typeLabel(selected.type) },
                { label: 'Members', value: selected.members.map(nodeName).join(', ') || '—' },
              ]
            : []
        }
        onChange={(patch) => onUpdate(selected.id, patch)}
      />

      <section className="card">
        <header className="list-head">
          <strong>{plural(groups.length, 'group')}</strong>
        </header>

        {groups.length === 0 ? (
          <p className="empty">No groups configured.</p>
        ) : (
          <div className="entity-grid">
            {groups.map((g) => (
              <EntityCard
                key={g.id}
                name={g.name}
                on={g.on}
                selected={g.id === selectedId}
                onToggle={(on) => onUpdate(g.id, { on })}
                onSelect={() => onSelect(g.id)}
              >
                <span className="mono">{hex(g.address)}</span>
                <span className="type-tag">{typeLabel(g.type)}</span>
                <span className="entity-card-id">{plural(g.members.length, 'node')}</span>
              </EntityCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
