import type { DeckPageSnapshot } from "./deck-types";

export type SlideFamily =
  | "cover"
  | "priority-map"
  | "programme-overview"
  | "section-divider"
  | "people-grid"
  | "investor-grid"
  | "focus-grid"
  | "itinerary"
  | "breakout-matrix"
  | "faq";

export type SlideContract = {
  key: string;
  legacyPage: number;
  family: SlideFamily;
  label: string;
  locked?: boolean;
  slots?: number;
  identityAll?: string[];
  identityAny?: string[];
  dynamicFields: string[];
  knownIssues?: string[];
};

const peopleFields = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return [
      `person_${slot}_image`,
      `person_${slot}_name`,
      `person_${slot}_role`,
      `person_${slot}_credential`,
      `person_${slot}_value_line`,
    ];
  }).flat();

const focusFields = (count: number) => [
  "focus_stack_heading",
  ...Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return [
      `focus_${slot}_logo`,
      `focus_${slot}_name`,
      `focus_${slot}_description`,
      `focus_${slot}_url`,
    ];
  }).flat(),
];

const itineraryFields = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return [`itinerary_${slot}_time`, `itinerary_${slot}_title`, `itinerary_${slot}_detail`];
  }).flat();

const breakoutFields = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return [
      `breakout_${slot}_attendee_name`,
      `breakout_${slot}_designation`,
      `breakout_${slot}_company_name`,
      `breakout_${slot}_company_description`,
    ];
  }).flat();

export const NIKE_TEMPLATE_VERSION = "2026-08-31.34";
export const NIKE_EXPECTED_SLIDES = 34;
export const LOCKED_REFERENCE_KEYS = new Set(["masterclass-people-3b", "vc-divider", "vc-investors"]);

/**
 * The semantic manifest is the source of truth. legacyPage is only a tie-breaker:
 * inserting or deleting a slide must not make the app edit the wrong layout.
 */
export const NIKE_SLIDE_CONTRACTS: SlideContract[] = [
  {
    key: "cover",
    legacyPage: 1,
    family: "cover",
    label: "Boarding pass cover",
    identityAll: ["BOARDING PASS"],
    identityAny: ["PASSENGER", "ROUTE", "DURATION", "GATE"],
    dynamicFields: [
      "client_name_header",
      "cover_trip_title",
      "cover_passenger",
      "cover_route",
      "cover_dates",
      "cover_class",
      "cover_duration",
      "cover_gate",
      "cover_value_line",
      "footer_trip_name",
    ],
    knownIssues: ["BOARDING PASS must remain static and cover_trip_title must be a separate dynamic region."],
  },
  {
    key: "priority-map",
    legacyPage: 2,
    family: "priority-map",
    label: "Priority mapping · 10 slots",
    slots: 10,
    identityAll: ["PRIORITY MAPPING"],
    identityAny: ["Mapped to", "10 focus areas"],
    dynamicFields: [
      "priority_heading",
      ...Array.from({ length: 10 }, (_, index) => [`priority_${index + 1}_icon`, `priority_${index + 1}_label`]).flat(),
    ],
  },
  {
    key: "programme-overview",
    legacyPage: 3,
    family: "programme-overview",
    label: "Programme overview",
    identityAll: ["Three days, Three kinds of rooms"],
    identityAny: ["Masterclasses", "VC Connects", "Focus Sessions"],
    dynamicFields: ["programme_heading", "masterclass_tailored_question"],
  },
  {
    key: "masterclass-divider",
    legacyPage: 4,
    family: "section-divider",
    label: "Masterclass divider",
    identityAll: ["MASTERCLASS"],
    identityAny: ["Leadership sessions", "Masterclass"],
    dynamicFields: ["masterclass_leadership_subtitle", "footer_trip_name"],
  },
  {
    key: "masterclass-people-3a",
    legacyPage: 5,
    family: "people-grid",
    label: "Masterclass · three people",
    slots: 3,
    identityAny: ["Deep Nishar", "Gokul Rajaram", "Arvind KC"],
    dynamicFields: ["masterclass_subtitle", ...peopleFields(3), "footer_trip_name"],
  },
  {
    key: "masterclass-people-2",
    legacyPage: 6,
    family: "people-grid",
    label: "Masterclass · two people",
    slots: 2,
    identityAny: ["Deep Nishar", "Gokul Rajaram"],
    dynamicFields: ["masterclass_subtitle", ...peopleFields(2), "footer_trip_name"],
  },
  {
    key: "masterclass-people-3b",
    legacyPage: 7,
    family: "people-grid",
    label: "Masterclass · three people reference",
    locked: true,
    slots: 3,
    identityAny: ["Bret Taylor", "Sriram Krishnan", "Chintan Turakhia"],
    dynamicFields: ["masterclass_subtitle", ...peopleFields(3), "footer_trip_name"],
  },
  {
    key: "vc-divider",
    legacyPage: 8,
    family: "section-divider",
    label: "VC Connects divider reference",
    locked: true,
    identityAll: ["VC", "Connects"],
    dynamicFields: ["vc_section_subtitle", "footer_trip_name"],
  },
  {
    key: "vc-people-2",
    legacyPage: 9,
    family: "people-grid",
    label: "VC Connects · two people",
    slots: 2,
    identityAny: ["Ravi Mhatre", "Hemant Taneja"],
    dynamicFields: ["vc_section_heading", "vc_section_subtitle", ...peopleFields(2), "footer_trip_name"],
  },
  {
    key: "vc-investors",
    legacyPage: 10,
    family: "investor-grid",
    label: "VC investor logo grid reference",
    locked: true,
    slots: 6,
    identityAny: ["investors funding", "greylock", "SEQUOIA", "GENERAL CATALYST", "ICONIQ"],
    dynamicFields: [
      "vc_section_heading",
      ...Array.from({ length: 6 }, (_, index) => [`investor_${index + 1}_logo`, `investor_${index + 1}_name`]).flat(),
      "footer_trip_name",
    ],
  },
  {
    key: "focus-divider",
    legacyPage: 11,
    family: "section-divider",
    label: "Focus Sessions divider",
    identityAll: ["Focus sessions"],
    dynamicFields: ["focus_section_heading", "footer_trip_name"],
  },
  {
    key: "focus-ai-infrastructure-4",
    legacyPage: 12,
    family: "focus-grid",
    label: "AI infrastructure · four companies",
    slots: 4,
    identityAll: ["Building the AI Infrastructure Stack"],
    identityAny: ["Fireworks AI", "Band", "Vast Data", "Eon"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-agentic-1",
    legacyPage: 13,
    family: "focus-grid",
    label: "Agentic AI · one company",
    slots: 1,
    identityAll: ["Agentic AI Platform"],
    identityAny: ["Sycamore"],
    dynamicFields: [...focusFields(1), "footer_trip_name"],
    knownIssues: ["This source slide is unfinished and must fail the quality gate until its single card is complete."],
  },
  {
    key: "focus-dev-productivity-3",
    legacyPage: 14,
    family: "focus-grid",
    label: "Developer productivity · three companies",
    slots: 3,
    identityAll: ["Dev Productivity and SDLC Stack"],
    identityAny: ["Temporal", "Signadot", "Cognition"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "focus-dev-productivity-2",
    legacyPage: 15,
    family: "focus-grid",
    label: "Developer productivity · two companies",
    slots: 2,
    identityAll: ["Dev Productivity and SDLC Stack"],
    identityAny: ["Factory", "Replit"],
    dynamicFields: [...focusFields(2), "footer_trip_name"],
  },
  {
    key: "focus-zeroops-3",
    legacyPage: 16,
    family: "focus-grid",
    label: "ZeroOps · three companies",
    slots: 3,
    identityAll: ["Purpose-Built AI for ZeroOps"],
    identityAny: ["Skan AI", "Serval", "Unstructured"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "focus-zeroops-2",
    legacyPage: 17,
    family: "focus-grid",
    label: "ZeroOps · two companies",
    slots: 2,
    identityAll: ["Purpose-Built AI for ZeroOps"],
    identityAny: ["Axiamatic", "Poetic"],
    dynamicFields: [...focusFields(2), "footer_trip_name"],
  },
  {
    key: "focus-cost-3",
    legacyPage: 18,
    family: "focus-grid",
    label: "Cost optimisation · three companies",
    slots: 3,
    identityAll: ["The Cost Optimisation Stack"],
    identityAny: ["Flarion", "Zipher", "Cast.ai"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "focus-cost-2",
    legacyPage: 19,
    family: "focus-grid",
    label: "Cost optimisation · two companies",
    slots: 2,
    identityAll: ["The Cost Optimisation Stack"],
    identityAny: ["Pointfive", "Finout"],
    dynamicFields: [...focusFields(2), "footer_trip_name"],
  },
  {
    key: "focus-observability-2",
    legacyPage: 20,
    family: "focus-grid",
    label: "Observability · two companies",
    slots: 2,
    identityAll: ["Observability Stack"],
    identityAny: ["Coralogix", "BrainTrust"],
    dynamicFields: [...focusFields(2), "footer_trip_name"],
  },
  {
    key: "focus-security-4a",
    legacyPage: 21,
    family: "focus-grid",
    label: "Security · four companies",
    slots: 4,
    identityAll: ["Building your Security Stack"],
    identityAny: ["Skyflow", "Bedrock Data", "Lema Security", "Aikido"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-security-4b",
    legacyPage: 22,
    family: "focus-grid",
    label: "Security · four companies continuation",
    slots: 4,
    identityAll: ["Building your Security Stack"],
    identityAny: ["Straiker", "Chainguard", "Pluto", "Upwind"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-supply-chain-4",
    legacyPage: 23,
    family: "focus-grid",
    label: "Supply chain · four companies",
    slots: 4,
    identityAll: ["Supply Chain Stack"],
    identityAny: ["Pallet", "Loop", "Keychain", "Alloy.ai"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-analytics-3",
    legacyPage: 24,
    family: "focus-grid",
    label: "Analytics · three companies",
    slots: 3,
    identityAll: ["Built for Analytics and Intelligence"],
    identityAny: ["Wisdom.ai", "Conviva", "Contentsquare"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "focus-analytics-2",
    legacyPage: 25,
    family: "focus-grid",
    label: "Analytics · two companies",
    slots: 2,
    identityAll: ["Built for Analytics and Intelligence"],
    identityAny: ["Glean", "Metafore"],
    dynamicFields: [...focusFields(2), "footer_trip_name"],
  },
  {
    key: "focus-market-intelligence-3",
    legacyPage: 26,
    family: "focus-grid",
    label: "Market intelligence · three companies",
    slots: 3,
    identityAll: ["Built for Market Intelligence"],
    identityAny: ["Aaru", "TinyFish", "Simile"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "focus-marketing-4",
    legacyPage: 27,
    family: "focus-grid",
    label: "Marketing and engagement · four companies",
    slots: 4,
    identityAll: ["AI-Led Marketing & Consumer Engagement"],
    identityAny: ["Profound", "Nectar Social", "Hightouch", "Typeface"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-voice-4",
    legacyPage: 28,
    family: "focus-grid",
    label: "Voice AI · four companies",
    slots: 4,
    identityAll: ["The Voice AI Stack"],
    identityAny: ["Sierra", "LiveKit", "Sanas", "Smallest.ai"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-hr-4",
    legacyPage: 29,
    family: "focus-grid",
    label: "HR · four companies",
    slots: 4,
    identityAll: ["Empowering the HR Team"],
    identityAny: ["Phenom", "Aeqium", "Gem", "Mercor"],
    dynamicFields: [...focusFields(4), "footer_trip_name"],
  },
  {
    key: "focus-legal-accounting-3",
    legacyPage: 30,
    family: "focus-grid",
    label: "Legal and accounting · three companies",
    slots: 3,
    identityAll: ["Purpose Built for Legal and Accounting"],
    identityAny: ["Harvey", "Eudia", "Maxima"],
    dynamicFields: [...focusFields(3), "footer_trip_name"],
  },
  {
    key: "itinerary-sample",
    legacyPage: 31,
    family: "itinerary",
    label: "Sample itinerary",
    slots: 8,
    identityAll: ["Sample Itinerary"],
    identityAny: ["Masterclass Session 1", "Breakout Session 4"],
    dynamicFields: ["itinerary_heading", ...itineraryFields(8), "route_origin", "route_destination", "footer_trip_name"],
  },
  {
    key: "breakout-matrix-1",
    legacyPage: 32,
    family: "breakout-matrix",
    label: "Breakout matrix · group one",
    slots: 7,
    identityAll: ["Breakout Session - Hightouch Office"],
    identityAny: ["Gail Goldie", "Matt Elliott", "Myles O’Grady"],
    dynamicFields: ["breakout_heading", ...breakoutFields(7), "breakout_slot_1", "breakout_slot_2", "route_origin", "route_destination", "footer_trip_name"],
  },
  {
    key: "breakout-matrix-2",
    legacyPage: 33,
    family: "breakout-matrix",
    label: "Breakout matrix · group two",
    slots: 7,
    identityAll: ["Breakout Session - Hightouch Office"],
    identityAny: ["Rhys Kyff", "Gavin Kelly", "Michelle McGreal"],
    dynamicFields: ["breakout_heading", ...breakoutFields(7), "breakout_slot_1", "breakout_slot_2", "route_origin", "route_destination", "footer_trip_name"],
  },
  {
    key: "faq",
    legacyPage: 34,
    family: "faq",
    label: "Frequently asked questions",
    slots: 5,
    identityAll: ["FAQ"],
    identityAny: ["What is the format of each Session?", "Who is running point on the ground in SF?"],
    dynamicFields: [
      "faq_heading",
      ...Array.from({ length: 5 }, (_, index) => [`faq_${index + 1}_question`, `faq_${index + 1}_answer`]).flat(),
      "route_origin",
      "route_destination",
      "footer_trip_name",
    ],
  },
];

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function pageText(page: Pick<DeckPageSnapshot, "texts">) {
  return normalize(page.texts.map((item) => item.text).join("\n"));
}

function identityScore(contract: SlideContract, page: Pick<DeckPageSnapshot, "number" | "texts">) {
  const text = pageText(page);
  const all = contract.identityAll || [];
  const any = contract.identityAny || [];
  let score = page.number === contract.legacyPage ? 1.5 : 0;
  for (const value of all) score += text.includes(normalize(value)) ? 6 : -8;
  for (const value of any) if (text.includes(normalize(value))) score += 3;
  return score;
}

export function resolveSlideContracts(pages: Array<Pick<DeckPageSnapshot, "number" | "texts">>) {
  const unused = new Set(NIKE_SLIDE_CONTRACTS.map((contract) => contract.key));
  const resolved = new Map<number, SlideContract>();

  // Unique copy/person/company text is stronger than a raw page index. Resolve the
  // highest-confidence pairs first so repeated headings cannot steal each other.
  const pairs = pages.flatMap((page) =>
    NIKE_SLIDE_CONTRACTS.map((contract) => ({ page, contract, score: identityScore(contract, page) })),
  ).sort((a, b) => b.score - a.score);

  for (const pair of pairs) {
    if (pair.score <= 0 || resolved.has(pair.page.number) || !unused.has(pair.contract.key)) continue;
    resolved.set(pair.page.number, pair.contract);
    unused.delete(pair.contract.key);
  }

  return resolved;
}

export function contractByKey(key?: string) {
  return key ? NIKE_SLIDE_CONTRACTS.find((contract) => contract.key === key) : undefined;
}

export function isLockedContract(key?: string) {
  return Boolean(key && LOCKED_REFERENCE_KEYS.has(key));
}

export function canonicalSourceForFamily(family: SlideFamily, slots?: number) {
  const candidates = NIKE_SLIDE_CONTRACTS.filter((contract) =>
    contract.family === family &&
    !contract.locked &&
    (slots === undefined || contract.slots === slots) &&
    !contract.knownIssues?.length,
  );
  return candidates[0];
}
