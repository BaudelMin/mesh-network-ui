import { countMembersByKind, NODE_KINDS } from '../api/adapters.js'
import { typeLabel } from '../devices/index.js'
import ControlSection from './ControlSection.jsx'
import EntityCard from './EntityCard.jsx'

const hex = (n) => (typeof n === 'number' ? `0x${n.toString(16).toUpperCase()}` : '—')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// [{ kind, text }], e.g. "2 lights", "1 shade", "1 not found": lights and shades
// are always shown (even at 0), counted with the driver's rule (isShadeProduct);
// "not found" only when a member id isn't in the Nodes list.
function memberCounts(memberIds, nodes) {
  const counts = countMembersByKind(memberIds, nodes)
  const rows = Object.keys(NODE_KINDS).map((kind) => ({ kind, text: plural(counts[kind], kind) }))
  if (counts.unknown) rows.push({ kind: 'unknown', text: `${counts.unknown} not found` })
  return rows
}

const describeCounts = (rows) => rows.map((r) => r.text).join(' · ')

// `nodes` is the full Nodes list (shades included), so every member is counted and named.
export default function GroupsTab({ groups, nodes, waiting, selectedId, onSelect, onUpdate }) {
  const selected = groups.find((g) => g.id === selectedId) ?? null
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name ?? id

  return (
    <div className="stack">
      <ControlSection
        title="Group Control"
        subtitle="Group commands — broadcast to the group address, all members update simultaneously."
        target={selected}
        emptyText={
          groups.length ? 'Select a group from the list below to control it.' : waiting ? 'Waiting for gateway…' : 'No groups available.'
        }
        info={
          selected
            ? [
                { label: 'Address', value: hex(selected.address) },
                { label: 'Type', value: typeLabel(selected.type) },
                { label: 'Devices', value: describeCounts(memberCounts(selected.members, nodes)) },
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
          <p className="empty">{waiting ? 'Waiting for gateway…' : 'No groups configured.'}</p>
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
                <span className="kind-counts">{describeCounts(memberCounts(g.members, nodes))}</span>
              </EntityCard>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
