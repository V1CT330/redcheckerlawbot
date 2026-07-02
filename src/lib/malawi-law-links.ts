export type LawLink = {
  title: string;
  url: string;
  description: string;
  category: "constitution" | "acts" | "policy" | "cases" | "help";
};

export const MALAWI_LAW_LINKS: LawLink[] = [
  {
    category: "constitution",
    title: "Constitution of the Republic of Malawi (1994)",
    url: "https://malawilii.org/akn/mw/act/1994/20/eng@2017-02-14",
    description: "Full text of the Constitution as amended, on MalawiLII.",
  },
  {
    category: "acts",
    title: "MalawiLII — Acts of Parliament",
    url: "https://malawilii.org/legislation/",
    description: "Searchable database of all Malawian Acts and Statutory Instruments.",
  },
  {
    category: "acts",
    title: "Penal Code (Cap. 7:01)",
    url: "https://malawilii.org/akn/mw/act/1930/22/eng",
    description: "Malawi's principal criminal statute.",
  },
  {
    category: "acts",
    title: "Employment Act (Cap. 55:02)",
    url: "https://malawilii.org/akn/mw/act/2000/6/eng",
    description: "Rights and duties of employees and employers.",
  },
  {
    category: "acts",
    title: "Marriage, Divorce and Family Relations Act",
    url: "https://malawilii.org/akn/mw/act/2015/4/eng",
    description: "Marriage, divorce, custody and maintenance.",
  },
  {
    category: "acts",
    title: "Land Act 2016",
    url: "https://malawilii.org/akn/mw/act/2016/16/eng",
    description: "Ownership, use and administration of land.",
  },
  {
    category: "cases",
    title: "MalawiLII — Judgments",
    url: "https://malawilii.org/judgments/",
    description: "Supreme Court of Appeal and High Court decisions.",
  },
  {
    category: "policy",
    title: "Malawi Government Portal",
    url: "https://www.malawi.gov.mw/",
    description: "Ministries, public policies and official notices.",
  },
  {
    category: "help",
    title: "Legal Aid Bureau — 847 (toll-free)",
    url: "https://legalaidbureau.mw/",
    description: "Free legal assistance for those who cannot afford a lawyer.",
  },
  {
    category: "help",
    title: "Malawi Human Rights Commission",
    url: "https://www.mhrcmw.org/",
    description: "Report human rights violations and get guidance.",
  },
];

/** Domains the AI web-search tool is allowed to cite. */
export const MALAWI_LAW_DOMAINS = [
  "malawilii.org",
  "gov.mw",
  "laws.gov.mw",
  "malawi.gov.mw",
  "legalaidbureau.mw",
  "mhrcmw.org",
  "parliament.gov.mw",
];
