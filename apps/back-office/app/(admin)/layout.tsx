import Link from 'next/link';
import type { ReactNode } from 'react';

// Phoenix · Back Office · Admin layout
// Sidebar con navegación a los catálogos + workspaces.
// Phase 0-1: sin auth todavía. Phase 1 agrega middleware de auth con Supabase.

const NAV_ITEMS = [
  {
    section: 'Catálogos (Master data)',
    items: [
      { label: 'Especialidades', href: '/admin/specialties', icon: '🩺', mockup: 'B.36' },
      { label: 'Bufetes', href: '/admin/lawyers', icon: '⚖️', mockup: 'B.30' },
      { label: 'Aseguradoras', href: '/admin/insurances', icon: '🛡️', mockup: 'B.32' },
      { label: 'Servicios (CPT)', href: '/admin/services', icon: '💲', mockup: 'B.33' },
      { label: 'Diagnósticos (ICD-10 + SNOMED)', href: '/admin/diagnoses', icon: '📋', mockup: 'B.35' },
    ],
  },
  {
    section: 'Workspaces',
    items: [
      { label: 'Front Office', href: '/front-office', icon: '🏥', mockup: 'B.1–B.4' },
      { label: 'Intake (Edson)', href: '/intake', icon: '📞', mockup: 'B.12–B.13' },
      { label: 'Billing (Brunella)', href: '/billing', icon: '💼', mockup: 'B.25–B.28' },
      { label: 'Dashboard', href: '/dashboard', icon: '📊', mockup: 'B.29' },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg-0">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-bg-1 px-4 py-6 flex flex-col">
        <Link href="/admin/specialties" className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">LienMaster v3</div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">Back Office</div>
          </div>
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {NAV_ITEMS.map((section) => (
            <div key={section.section}>
              <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-2 px-2">
                {section.section}
              </div>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-2 py-2 rounded-md text-text-2 hover:text-white hover:bg-white/5 text-[13px] transition-colors group"
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      <span className="text-text-muted text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.mockup}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="pt-4 border-t border-border text-text-muted text-[10px] leading-relaxed">
          <div className="font-semibold text-text-2 mb-1">Phoenix · Phase 1</div>
          <div>Catálogos en construcción</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="border-b border-border bg-bg-1 px-8 py-4 flex items-center justify-between">
          <div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">LM v3 · Back Office</div>
            <div className="text-white font-semibold text-base">Super Admin clínico</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-text-muted text-xs">phoenix-dev · local</div>
            <div className="w-8 h-8 rounded-full bg-gradient-cyan flex items-center justify-center text-white text-xs font-bold">
              ES
            </div>
          </div>
        </div>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
