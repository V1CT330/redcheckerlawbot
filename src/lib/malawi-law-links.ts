export type LawLink = {
  title: string;
  url: string;
  description: string;
  category: "constitution" | "acts" | "policy" | "cases" | "help";
};

export const MALAWI_LAW_LINKS: LawLink[] = [
  {
    category: "constitution",
    title: "Constitution of the Republic of Malawi",
    url: "https://malawilii.org/akn/mw/act/1994/20/eng@2017-02-14",
    description:
      "Constitutional text hosted by MalawiLII. Verify whether a more recent consolidated version is available before relying on it.",
  },
  {
    category: "acts",
    title: "MalawiLII Legislation",
    url: "https://malawilii.org/legislation/",
    description:
      "Search legislation published on MalawiLII. Check amendment history and current legal status where available.",
  },
  {
    category: "acts",
    title: "Penal Code",
    url: "https://malawilii.org/akn/mw/act/1930/22/eng",
    description:
      "Malawi criminal legislation. Verify the relevant provision and amendments before explaining an offence or penalty.",
  },
  {
    category: "acts",
    title: "Employment Act",
    url: "https://malawilii.org/akn/mw/act/2000/6/eng",
    description:
      "Legislation concerning employment relationships, subject to applicable amendments.",
  },
  {
    category: "acts",
    title: "Marriage, Divorce and Family Relations Act",
    url: "https://malawilii.org/akn/mw/act/2015/4/eng",
    description:
      "Legislation concerning marriage, divorce and related family matters.",
  },
  {
    category: "acts",
    title: "Land Act",
    url: "https://malawilii.org/akn/mw/act/2016/16/eng",
    description:
      "Legislation concerning land administration and related matters. Check amendments and current status.",
  },
  {
    category: "cases",
    title: "MalawiLII Judgments",
    url: "https://malawilii.org/judgments/",
    description:
      "Search published Malawian court judgments and verify the court, case citation, date and outcome.",
  },
  {
    category: "policy",
    title: "Malawi Government Portal",
    url: "https://www.malawi.gov.mw/",
    description:
      "Government information, ministry publications and public announcements.",
  },
  {
    category: "help",
    title: "Legal Aid Bureau",
    url: "https://legalaidbureau.mw/",
    description:
      "Information about legal assistance and services for eligible people in Malawi.",
  },
  {
    category: "help",
    title: "Malawi Human Rights Commission",
    url: "https://www.mhrcmw.org/",
    description:
      "Information about human rights, complaints and the Commission's work.",
  },
];

/**
 * Domains permitted for Malawi legal research.
 *
 * Search results must still be checked for relevance and reliability.
 * Being hosted on an approved domain does not automatically prove that
 * a page is current, authoritative or legally applicable.
 */
export const MALAWI_LAW_DOMAINS = [
  "malawilii.org",
  "malawi.gov.mw",
  "gov.mw",
  "laws.gov.mw",
  "legalaidbureau.mw",
  "mhrcmw.org",
  "parliament.gov.mw",
];
