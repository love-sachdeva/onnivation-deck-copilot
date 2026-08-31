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
  | "add_page_from_layout"
  | "move_element"
  | "resize_element"
  | "format_text"
  | "insert_text"
  | "insert_shape"
  | "delete_element"
  | "set_template_field";

export type ElementRole =
  | "section_heading"
  | "section_eyebrow"
  | "section_dot"
  | "header_line"
  | "footer_line"
  | "footer_text"
  | "route_origin"
  | "route_destination"
  | "route_arrow"
  | `priority_${number}_card`
  | `priority_${number}_icon`
  | `priority_${number}_label`
  | `person_${number}_card`
  | `person_${number}_image`
  | `person_${number}_name`
  | `focus_${number}_card`
  | `focus_${number}_logo`
  | `focus_${number}_name`
  | `focus_${number}_description`
  | `investor_${number}_logo`
  | `investor_${number}_name`;

export type ElementSelector = {
  kind?: "text" | "image" | "shape" | "group" | "embed";
  role?: ElementRole;
  exactText?: string;
  containsText?: string;
  occurrence?: number;
  near?: { top: number; left: number; tolerance?: number };
};

export type GeometryPatch = {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  deltaX?: number;
  deltaY?: number;
  preserveAspectRatio?: boolean;
};

export type FormattingPatch = {
  fontRef?: string;
  fontSize?: number;
  fontWeight?: "normal" | "thin" | "extralight" | "light" | "medium" | "semibold" | "bold" | "ultrabold" | "heavy";
  fontStyle?: "normal" | "italic";
  color?: string;
  textAlign?: "start" | "center" | "end" | "justify";
  lineHeightEm?: number;
};

export type InsertSpec = {
  text?: string;
  top: number;
  left: number;
  width: number;
  height?: number;
  rotation?: number;
  fill?: string;
  strokeColor?: string;
  strokeWeight?: number;
  cornerRadius?: number;
};

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
  fontRef?: string;
  fontSize?: number;
  fontWeight?: "normal" | "thin" | "extralight" | "light" | "medium" | "semibold" | "bold" | "ultrabold" | "heavy";
  fontStyle?: "normal" | "italic";
  color?: string;
  textAlign?: "start" | "center" | "end" | "justify";
  lineHeightEm?: number;
};

export type ImageNodeSnapshot = {
  top: number;
  left: number;
  width: number;
  height: number;
  locked: boolean;
  mediaRef?: string;
};

export type ElementNodeSnapshot = {
  kind: "text" | "image" | "shape" | "group" | "embed" | "unsupported";
  text?: string;
  top: number;
  left: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  color?: string;
  strokeColor?: string;
  strokeWeight?: number;
  mediaRef?: string;
};

export type DeckPageSnapshot = {
  number: number;
  id: string;
  width: number;
  height: number;
  background?: string;
  contractKey?: string;
  family?: string;
  lockedByContract?: boolean;
  texts: TextNodeSnapshot[];
  images: ImageNodeSnapshot[];
  elements: ElementNodeSnapshot[];
  issues: DeckIssue[];
};

export type DeckAudit = {
  connected: boolean;
  title: string;
  pageCount: number;
  width: number;
  height: number;
  inferredClient?: string;
  templateVersion: string;
  expectedPageCount: number;
  matchedContracts: number;
  unmatchedContracts: string[];
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
  status?: "executable" | "needs_input" | "blocked";
  blockedReason?: string;
  find?: string;
  replace?: string;
  pageKeys?: string[];
  target?: ElementSelector;
  geometry?: GeometryPatch;
  formatting?: FormattingPatch;
  insert?: InsertSpec;
  sourcePageKey?: string;
  afterPageKey?: string;
  asset?: {
    sourceUrl: string;
    mimeType: "image/jpeg" | "image/heic" | "image/png" | "image/svg+xml" | "image/webp" | "image/tiff";
    title: string;
  };
  expectedAffectedElements?: { min: number; max: number };
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
  failures: string[];
  appliedOperationIds: string[];
};
