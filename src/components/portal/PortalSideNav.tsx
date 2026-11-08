"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalNavLink = { href: string; label: string; exact?: boolean; badge?: number };
export type PortalNavGroup = { label: string; links: PortalNavLink[] };

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalSideNav({ groups }: { groups: PortalNavGroup[] }) {
  const pathname = usePathname() || "/";

  return (
    <nav className="side-nav" aria-label="Practice workspace">
      {groups.map((group) => (
        <div key={group.label} className="side-group">
          <p className="side-group-label">{group.label}</p>
          <ul className="side-group-list">
            {group.links.map((link) => {
              const active = isActive(pathname, link.href, link.exact);
              return (
                <li key={link.href}>
                  <Link href={link.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                    <span className="side-dot" aria-hidden />
                    <span className="side-link-label">{link.label}</span>
                    {link.badge && link.badge > 0 ? <span className="side-badge">{link.badge > 99 ? "99+" : link.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
