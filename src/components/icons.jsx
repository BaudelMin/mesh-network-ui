const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const GridIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <rect x="2" y="2" width="9" height="9" rx="1.5" />
    <rect x="13" y="2" width="9" height="9" rx="1.5" />
    <rect x="2" y="13" width="9" height="9" rx="1.5" />
    <rect x="13" y="13" width="9" height="9" rx="1.5" />
  </svg>
)

export const InfoIcon = () => (
  <svg {...base}>
    <line x1="12" y1="10" x2="12" y2="20" />
    <circle cx="12" cy="5" r="0.6" fill="currentColor" />
  </svg>
)

export const SwapIcon = () => (
  <svg {...base}>
    <path d="M4 8h15l-4-4" />
    <path d="M20 16H5l4 4" />
  </svg>
)

export const UsersIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <circle cx="8" cy="8" r="3.5" />
    <circle cx="16.5" cy="8" r="3.5" />
    <path d="M1.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6z" />
    <path d="M13 14.3c1-.2 2.2-.3 3.5-.3 3.5 0 6 2 6 6h-6.5" />
  </svg>
)

export const TriangleIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M12 3 22 20H2z" />
  </svg>
)

export const RefreshIcon = () => (
  <svg {...base} strokeWidth={2.5}>
    <path d="M20 12a8 8 0 1 1-2.35-5.65" />
    <path d="M20 4v5h-5" />
  </svg>
)

export const AlertIcon = () => (
  <svg {...base}>
    <path d="M12 3 22 20H2z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </svg>
)

export const PlayIcon = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M6 4l14 8-14 8z" />
  </svg>
)
