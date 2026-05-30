import Link from 'next/link';

type TopNavProps = {
  active: 'dashboard' | 'status';
};

const links = [
  { href: '/', label: 'Dashboard', key: 'dashboard' as const },
  { href: '/status?range=week', label: 'Status', key: 'status' as const },
];

export function TopNav({ active }: TopNavProps) {
  return (
    <nav className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/60 px-3 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex flex-col">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
          Calorie tracker
        </span>
        <span className="text-sm text-slate-400">Fast logging, cleaner status.</span>
      </div>

      <div className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-black/20 p-1 sm:w-auto">
        {links.map((link) => {
          const isActive = link.key === active;

          return (
            <Link
              key={link.key}
              href={link.href}
              className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-medium transition sm:flex-none ${
                isActive
                  ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}