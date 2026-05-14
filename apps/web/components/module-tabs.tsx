import Link from 'next/link';
import { cn } from '@precision/ui';

interface Tab {
  key: string;
  label: string;
  href: string;
}

export function ModuleTabs({ tabs, activeTab }: { tabs: Tab[]; activeTab: string }) {
  return (
    <div className="border-b border-border px-6">
      <nav className="flex">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                'relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                isActive ? 'text-brand' : 'text-text-3 hover:text-text-2',
              )}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
