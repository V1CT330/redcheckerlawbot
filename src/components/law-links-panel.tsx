import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { MALAWI_LAW_LINKS, type LawLink } from "@/lib/malawi-law-links";
import { Input } from "@/components/ui/input";

const CATEGORY_LABEL: Record<LawLink["category"], string> = {
  constitution: "Constitution",
  acts: "Acts of Parliament",
  cases: "Case law",
  policy: "Policy & Government",
  help: "Get help",
};

export function LawLinksPanel() {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const filtered = term
    ? MALAWI_LAW_LINKS.filter(
        (l) =>
          l.title.toLowerCase().includes(term) ||
          l.description.toLowerCase().includes(term) ||
          l.category.includes(term),
      )
    : MALAWI_LAW_LINKS;

  const grouped = filtered.reduce<Record<string, LawLink[]>>((acc, l) => {
    (acc[l.category] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Malawi law…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[cat as LawLink["category"]]}
            </h4>
            <ul className="space-y-1">
              {items.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{l.title}</span>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {l.description}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground">No links match "{q}".</p>
        )}
      </div>
    </div>
  );
}
