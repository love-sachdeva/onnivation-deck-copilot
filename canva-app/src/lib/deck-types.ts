export type Risk = "safe" | "review";

export type OperationType =
  | "audit_deck"
  | "replace_text"
  | "replace_image"
  | "update_client"
  | "normalize_headers"
  | "normalize_footers"
  | "center_route_arrows"
  | "normalize_backgrounds"
  | "update_priorities"
  | "update_people"
  | "update_focus_sessions"
  | "update_itinerary"
  | "add_page_from_layout";

export type DeckIssue = {
  code: string;
  page: number;
  severity: "error" | "warning" | "info";
  message: string;
  expected?: string;
  actual?: string;
};

export type TextNodeSnapshot = {
  text: string;
  top: number;
  left: number;
  width: number;
  height: number;
  locked: boolean;
};

export type ImageNodeSnapshot = {
  top: number;
  left: number;
  width: number;
  height: number;
  locked: boolean;
};

export type DeckPageSnapshot = {
  number: number;
  id: string;
  width: number;
  height: number;
  background?: string;
  texts: TextNodeSnapshot[];
  images: ImageNodeSnapshot[];
  issues: DeckIssue[];
};

export type DeckAudit = {
  connected: boolean;
  title: string;
  pageCount: number;
  width: number;
  height: number;
  inferredClient?: string;
  pages: DeckPageSnapshot[];
  issues: DeckIssue[];
  scannedAt: string;
};

export type PlanOperation = {
  id: string;
  type: OperationType;
  title: string;
  detail: string;
  pages: number[];
  risk: Risk;
  enabled: boolean;
  find?: string;
  replace?: string;
  params?: Record<string, string | number | boolean | string[]>;
};

export type DeckPlan = {
  summary: string;
  confidence: number;
  source: "claude" | "openai" | "local";
  requiresResearch: boolean;
  researchNotes: string[];
  sources: Array<{ title: string; url: string }>;
  operations: PlanOperation[];
  plannerWarning?: string;
};

export type ApplyResult = {
  changedElements: number;
  changedPages: number[];
  skipped: string[];
};
