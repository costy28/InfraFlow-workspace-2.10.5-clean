import Badge from './Badge'

const statusMap = {
  draft: ['gray', 'Draft'],
  in_circuit: ['blue', 'În circuit'],
  aprobat: ['green', 'Aprobat'],
  respins: ['red', 'Respins'],
  anulat: ['gray', 'Anulat'],
  arhivat: ['gray', 'Arhivat'],
  deschis: ['yellow', 'Deschis'],
  in_lucru: ['blue', 'În lucru'],
  in_asteptare: ['yellow', 'În așteptare'],
  rezolvat: ['green', 'Rezolvat'],
  inchis: ['green', 'Închis'],
  trimis: ['blue', 'Trimis'],
  validat_gps: ['green', 'Validat GPS'],
  completat: ['green', 'Completat'],
  critic: ['red', 'Critic'],
  critica: ['red', 'Critică'],
  urgent: ['red', 'Urgent'],
  urgenta: ['red', 'Urgentă'],
  normal: ['gray', 'Normal'],
}

export default function StatusBadge({ status, children, ...props }) {
  const key = String(status || '').toLowerCase()
  const [variant, text] = statusMap[key] || ['gray', children || String(status || '-').replaceAll('_', ' ')]
  return (
    <Badge variant={variant} {...props}>
      {children || text}
    </Badge>
  )
}
