import { Archive, BarChart3, BookOpen, BriefcaseBusiness, Building2, CircleHelp, ClipboardCheck, Factory, FileCheck2, FileText, Handshake, House, Landmark, Leaf, Mail, MapPin, Package, Route, Scale, Settings, ShoppingCart, Snowflake, Sparkles, Ticket, TrafficCone, Truck, Upload, Users, Warehouse, Wrench } from 'lucide-react'

// Presentation only: module routes, permission keys and labels stay unchanged.
const icons = {
  '/dashboard': BarChart3, '/kiosk': House, '/taskuri': ClipboardCheck,
  '/my-vehicle': Truck, '/hr': Users, '/gestiune': Warehouse, '/stocuri': Warehouse,
  '/productie': Factory, '/mecanizare': Wrench, '/flota': Wrench,
  '/asternere': Route, '/achizitii': ShoppingCart, '/logistica': Truck,
  '/contracte': FileCheck2, '/crm/oferte': FileText, '/crm/leads': BriefcaseBusiness,
  '/crm/clients': Users, '/crm': Handshake, '/referate': ClipboardCheck,
  '/teren': MapPin, '/salubrizare': Route, '/siguranta-circ': TrafficCone,
  '/deszapezire': Snowflake, '/mediu': Leaf, '/contabilitate': Landmark,
  '/documente': FileText, '/mesaje': Mail, '/sesizari': Ticket,
  '/juridic': Scale, '/arhiva': Archive, '/secretariat': Mail,
  '/setari': Settings, '/ofertare-interna': FileText, '/import-date-vechi': Upload,
  '/ai-assistant': Sparkles, '/ajutor': CircleHelp, '/departament': Building2,
}
const symbols = { '📦': Package, '📊': BarChart3, '🧰': Wrench, '📋': ClipboardCheck }

export default function ModuleIcon({ route = '', symbol, size = 19, className = '' }) {
  const key = Object.keys(icons).sort((a, b) => b.length - a.length)
    .find(path => route === path || route.startsWith(`${path}/`) || route.startsWith(`${path}?`))
  const Icon = symbols[symbol] || icons[key] || BookOpen
  return <Icon size={size} strokeWidth={1.8} className={`shrink-0 ${className}`} aria-hidden="true" />
}
