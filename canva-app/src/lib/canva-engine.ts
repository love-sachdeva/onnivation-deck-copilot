"use client";

import type {
  DesignEditing,
  ElementAtPoint,
  GroupContentAtPoint,
  ImageRef,
  PageBackgroundFill,
  RichtextFormatting,
  TextRegion,
  VideoRef,
} from "@canva/design";

import type {
  ApplyResult,
  DeckAudit,
  DeckIssue,
  ElementNodeSnapshot,
  ElementSelector,
  ImageNodeSnapshot,
  DeckPageSnapshot,
  FormattingPatch,
  PlanOperation,
  TextNodeSnapshot,
} from "./deck-types";
import {
  NIKE_EXPECTED_SLIDES,
  NIKE_SLIDE_CONTRACTS,
  NIKE_TEMPLATE_VERSION,
  resolveSlideContracts,
} from "./deck-contract";
import { guardOperation } from "./plan-guard";

type Element = DesignEditing.AbsoluteElement | DesignEditing.GroupContentElement;

type LocatedElement = {
  element: Element;
  absoluteTop: number;
  absoluteLeft: number;
  parentTop: number;
  parentLeft: number;
  depth: number;
};

type CanvaSdk = typeof import("@canva/design");

type SerializedMedia =
  | { type: "image"; ref: ImageRef }
  | { type: "video"; ref: VideoRef };

type SerializedElement = {
  kind: "text" | "shape" | "rect" | "group" | "embed";
  top: number;
  left: number;
  width: number;
  height: number;
  rotation: number;
  transparency: number;
  regions?: TextRegion[];
  color?: string;
  media?: SerializedMedia;
  stroke?: { weight: number; color: string };
  paths?: Array<{
    d: string;
    color?: string;
    media?: SerializedMedia;
    stroke?: { weight: number; color: string };
  }>;
  viewBox?: { top: number; left: number; width: number; height: number };
  children?: SerializedElement[];
  url?: string;
};

type SerializedPage = {
  width: number;
  height: number;
  background?: PageBackgroundFill;
  elements: SerializedElement[];
};

const TOKENS = {
  cream: "#fcf5ed",
  paper: "#fffaf9",
  navy: "#0b196b",
  forest: "#205047",
  gold: "#c9a227",
  dotMediaRef: "MAHSii6-IGc",
  headingFontRef: "YACgEdeqDWI,0",
  eyebrowFontRef: "YAFdJj8NdaU,1",
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function walkElements(
  elements: readonly Element[],
  visit: (located: LocatedElement) => void,
  parentTop = 0,
  parentLeft = 0,
  depth = 0,
) {
  for (const element of elements) {
    const absoluteTop = parentTop + element.top;
    const absoluteLeft = parentLeft + element.left;
    visit({ element, absoluteTop, absoluteLeft, parentTop, parentLeft, depth });
    if (element.type === "group") {
      walkElements(element.contents.toArray(), visit, absoluteTop, absoluteLeft, depth + 1);
    }
  }
}

function readBackground(page: DesignEditing.AbsolutePage) {
  const color = page.background?.colorContainer.ref;
  return color?.type === "solid" ? color.color.toLowerCase() : undefined;
}

function imageRefForElement(element: Element) {
  if (element.type === "rect") {
    const media = element.fill.mediaContainer.ref;
    return media?.type === "image" ? String(media.imageRef) : undefined;
  }
  if (element.type === "shape") {
    const media = element.paths.toArray().map((path) => path.fill.mediaContainer.ref).find((item) => item?.type === "image");
    return media?.type === "image" ? String(media.imageRef) : undefined;
  }
  return undefined;
}

function firstTextFormatting(element: DesignEditing.TextElement) {
  return element.text.readTextRegions().find((region) => region.text.length)?.formatting;
}

function elementColor(element: Element) {
  if (element.type === "rect") return colorFromContainer(element.fill.colorContainer);
  if (element.type === "shape") {
    return element.paths.toArray().map((path) => colorFromContainer(path.fill.colorContainer)).find(Boolean);
  }
  return undefined;
}

function elementStroke(element: Element) {
  if (element.type === "rect") return strokeSnapshot(element.stroke);
  if (element.type === "shape") return element.paths.toArray().map((path) => path.stroke ? strokeSnapshot(path.stroke) : undefined).find(Boolean);
  return undefined;
}

function pageSnapshot(page: DesignEditing.AbsolutePage, number: number): DeckPageSnapshot {
  const texts: TextNodeSnapshot[] = [];
  const images: ImageNodeSnapshot[] = [];
  const elements: ElementNodeSnapshot[] = [];
  const nonTexts: LocatedElement[] = [];
  const issues: DeckIssue[] = [];

  walkElements(page.elements.toArray(), (located) => {
    const { element, absoluteTop, absoluteLeft } = located;
    if (element.type === "text") {
      const text = element.text.readPlaintext().trim();
      const formatting = firstTextFormatting(element);
      if (text) {
        texts.push({
          text,
          top: round(absoluteTop),
          left: round(absoluteLeft),
          width: round(element.width),
          height: round(element.height),
          locked: element.locked,
          fontRef: formatting?.fontRef ? String(formatting.fontRef) : undefined,
          fontSize: formatting?.fontSize,
          fontWeight: formatting?.fontWeight,
          fontStyle: formatting?.fontStyle,
          color: formatting?.color,
          textAlign: formatting?.textAlign,
          lineHeightEm: formatting?.lineHeightEm,
        });
      }
    } else {
      nonTexts.push(located);
      const mediaRef = imageRefForElement(element);
      const hasImage = Boolean(mediaRef);
      if (hasImage) {
        images.push({
          top: round(absoluteTop),
          left: round(absoluteLeft),
          width: round(element.width),
          height: round(element.height),
          locked: element.locked,
          mediaRef,
        });
      }
    }

    const mediaRef = imageRefForElement(element);
    const stroke = elementStroke(element);
    elements.push({
      kind: element.type === "rect" || element.type === "shape"
        ? mediaRef ? "image" : "shape"
        : element.type,
      text: element.type === "text" ? element.text.readPlaintext().trim() || undefined : undefined,
      top: round(absoluteTop),
      left: round(absoluteLeft),
      width: round(element.width),
      height: round(element.height),
      rotation: round(element.rotation),
      locked: element.locked,
      color: elementColor(element),
      strokeColor: stroke?.color,
      strokeWeight: stroke?.weight,
      mediaRef,
    });
  });

  const background = readBackground(page);
  if (number === 1 && background && background !== TOKENS.navy) {
    issues.push({
      code: "cover-background",
      page: number,
      severity: "warning",
      message: "Cover background differs from the canonical navy token.",
      expected: TOKENS.navy.toUpperCase(),
      actual: background.toUpperCase(),
    });
  }
  if (number > 1 && background && background !== TOKENS.cream && background !== TOKENS.paper) {
    issues.push({
      code: "standard-background",
      page: number,
      severity: "warning",
      message: "Standard slide background is outside the approved cream/paper tokens.",
      expected: `${TOKENS.cream.toUpperCase()} or ${TOKENS.paper.toUpperCase()}`,
      actual: background.toUpperCase(),
    });
  }

  const footer = texts.find((item) => /\bONNIVATION\b/i.test(item.text) && item.top > 930);
  if (!footer) {
    issues.push({
      code: "missing-footer",
      page: number,
      severity: number === 1 ? "info" : "error",
      message: "No editable Onnivation footer was found on this slide.",
    });
  } else if (footer.height > 42 || footer.text.includes("\n")) {
    issues.push({ code: "footer-wrap", page: number, severity: "error", message: "Footer content wraps or exceeds the approved single-line height." });
  }

  for (const text of texts) {
    if (/\|\s*\|/.test(text.text)) {
      issues.push({
        code: "double-separator",
        page: number,
        severity: "error",
        message: `Duplicate separator in “${text.text.slice(0, 70)}”.`,
      });
    }
    if (text.text.length > 175 && text.height < 58) {
      issues.push({
        code: "possible-overflow",
        page: number,
        severity: "warning",
        message: "Long copy may overflow its current text box.",
        actual: `${text.text.length} characters in a ${text.height}px-high box`,
      });
    }
  }

  if (number > 1) {
    const headerRail = elements.find((item) => item.kind === "shape" && item.width > 1500 && Math.abs(item.top - 85) <= 3);
    const footerRail = elements.find((item) => item.kind === "shape" && item.width > 1500 && Math.abs(item.top - 965) <= 3);
    if (!headerRail || Math.abs(headerRail.left - 71) > 2 || Math.abs(headerRail.width - 1778) > 3 || Math.abs(headerRail.height - 2) > 2) {
      issues.push({ code: "header-gold-rail", page: number, severity: "warning", message: "Header rail does not match the 71 / 85 / 1778 × 2 canonical geometry." });
    } else if (headerRail.color?.toLowerCase() !== TOKENS.gold) {
      issues.push({ code: "header-gold-color", page: number, severity: "warning", message: "Header rail is not the canonical #C9A227 gold." });
    }
    if (!footerRail || Math.abs(footerRail.left - 71) > 2 || Math.abs(footerRail.width - 1778) > 3 || Math.abs(footerRail.height - 2) > 2) {
      issues.push({ code: "footer-gold-rail", page: number, severity: "warning", message: "Footer rail does not match the 71 / 965 / 1778 × 2 canonical geometry." });
    } else if (footerRail.color?.toLowerCase() !== TOKENS.gold) {
      issues.push({ code: "footer-gold-color", page: number, severity: "warning", message: "Footer rail is not the canonical #C9A227 gold." });
    }
    const dot = images.find((item) => Math.abs(item.top - 44.9) < 8 && Math.abs(item.left - 45.434) < 8);
    if (!dot) issues.push({ code: "missing-section-dot", page: number, severity: "warning", message: "Canonical section dot was not found at the shared top-left anchor." });
    else if (dot.mediaRef && dot.mediaRef !== TOKENS.dotMediaRef) {
      issues.push({ code: "wrong-section-dot", page: number, severity: "warning", message: "Section dot uses a non-canonical media asset.", expected: TOKENS.dotMediaRef, actual: dot.mediaRef });
    }
  }

  if (number > 1) {
    const routeTexts = texts
      .filter((item) => item.top < 95 && item.left > 1250 && item.text.length < 40)
      .sort((a, b) => a.left - b.left)
      .slice(-2);
    if (routeTexts.length === 2) {
      const [origin, destination] = routeTexts;
      if (Math.abs(origin.top - 41.97) > 1 || Math.abs(destination.top - 42.41) > 1) {
        issues.push({
          code: "header-rail",
          page: number,
          severity: "warning",
          message: "Route labels are off the standard vertical rail.",
        });
      }
      const candidates = nonTexts.filter(({ element, absoluteTop, absoluteLeft }) =>
        absoluteTop < 100 &&
        absoluteLeft > origin.left + origin.width - 18 &&
        absoluteLeft < destination.left + 18 &&
        element.width >= 15 &&
        element.width <= 95 &&
        element.height <= 55,
      );
      const arrow = candidates.sort((a, b) => Math.abs(a.element.width - 46) - Math.abs(b.element.width - 46))[0];
      if (arrow) {
        const expected = (origin.left + origin.width + destination.left) / 2 - arrow.element.width / 2;
        if (Math.abs(arrow.absoluteLeft - expected) > 1) {
          issues.push({
            code: "route-arrow",
            page: number,
            severity: "warning",
            message: "Route arrow is not mathematically centered between the two labels.",
            expected: `${round(expected)}px`,
            actual: `${round(arrow.absoluteLeft)}px`,
          });
        }
      }
    }
  }

  return {
    number,
    id: String(page.id),
    width: page.dimensions?.width || 0,
    height: page.dimensions?.height || 0,
    background,
    texts,
    images,
    elements,
    issues,
  };
}

function inferClient(pages: DeckPageSnapshot[]) {
  const cover = pages[0];
  if (!cover) return undefined;
  return cover.texts.find((item) =>
    item.top >= 45 &&
    item.top <= 120 &&
    item.left >= 330 &&
    item.left <= 1100 &&
    item.text.length >= 2 &&
    item.text.length <= 60 &&
    !/ONNIVATION/i.test(item.text) &&
    !/^\W+$/.test(item.text),
  )?.text;
}

function colorFromContainer(container: { ref: DesignEditing.ColorFill | undefined }) {
  return container.ref?.type === "solid" ? container.ref.color : undefined;
}

function mediaFromContainer(container: { ref: DesignEditing.MediaFill | undefined }): SerializedMedia | undefined {
  const media = container.ref;
  if (!media) return undefined;
  return media.type === "image"
    ? { type: "image", ref: media.imageRef }
    : { type: "video", ref: media.videoRef };
}

function strokeSnapshot(stroke: DesignEditing.Stroke | undefined) {
  if (!stroke) return undefined;
  const color = colorFromContainer(stroke.colorContainer);
  return color ? { weight: stroke.weight, color } : undefined;
}

function serializeElement(element: Element): SerializedElement | null {
  if (element.type === "unsupported") return null;
  const common = {
    top: element.top,
    left: element.left,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    transparency: element.transparency,
  };
  if (element.type === "text") {
    return { kind: "text", ...common, regions: element.text.readTextRegions() };
  }
  if (element.type === "rect") {
    return {
      kind: "rect",
      ...common,
      color: colorFromContainer(element.fill.colorContainer),
      media: mediaFromContainer(element.fill.mediaContainer),
      stroke: strokeSnapshot(element.stroke),
    };
  }
  if (element.type === "shape") {
    return {
      kind: "shape",
      ...common,
      viewBox: {
        top: element.viewBox.top,
        left: element.viewBox.left,
        width: element.viewBox.width,
        height: element.viewBox.height,
      },
      paths: element.paths.toArray().map((path) => ({
        d: path.d,
        color: colorFromContainer(path.fill.colorContainer),
        media: mediaFromContainer(path.fill.mediaContainer),
        stroke: path.stroke ? strokeSnapshot(path.stroke) : undefined,
      })),
    };
  }
  if (element.type === "group") {
    return {
      kind: "group",
      ...common,
      children: element.contents.toArray().map(serializeElement).filter((item): item is SerializedElement => Boolean(item)),
    };
  }
  return { kind: "embed", ...common, url: element.url };
}

function serializePage(page: DesignEditing.AbsolutePage): SerializedPage {
  const backgroundColor = page.background ? colorFromContainer(page.background.colorContainer) : undefined;
  const backgroundMedia = page.background ? mediaFromContainer(page.background.mediaContainer) : undefined;
  const background: PageBackgroundFill | undefined = backgroundMedia
    ? {
        asset: backgroundMedia.type === "image"
          ? { type: "image", ref: backgroundMedia.ref, altText: { text: "", decorative: true } }
          : { type: "video", ref: backgroundMedia.ref, altText: { text: "", decorative: true } },
      }
    : backgroundColor
      ? { color: backgroundColor }
      : undefined;
  return {
    width: page.dimensions?.width || 1920,
    height: page.dimensions?.height || 1080,
    background,
    elements: page.elements.toArray().map(serializeElement).filter((item): item is SerializedElement => Boolean(item)),
  };
}

function mediaFill(media?: SerializedMedia) {
  if (!media) return undefined;
  return media.type === "image"
    ? { type: "image" as const, ref: media.ref, altText: { text: "", decorative: true } }
    : { type: "video" as const, ref: media.ref, altText: { text: "", decorative: true } };
}

function hydrateElement(element: SerializedElement, sdk: CanvaSdk): ElementAtPoint | null {
  const common = {
    top: element.top,
    left: element.left,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    transparency: element.transparency,
  };
  if (element.kind === "text") {
    const range = sdk.createRichtextRange();
    let index = 0;
    for (const region of element.regions || []) {
      const bounds = range.appendText(region.text, region.formatting);
      if (region.formatting) {
        range.formatText(bounds.bounds, region.formatting);
        range.formatParagraph(bounds.bounds, region.formatting as RichtextFormatting);
      }
      index += region.text.length;
    }
    if (index === 0) range.appendText(" ");
    return { type: "richtext", range, ...common };
  }
  if (element.kind === "rect") {
    if (element.media?.type === "image") {
      return { type: "image", ref: element.media.ref, altText: undefined, ...common };
    }
    if (element.media?.type === "video") {
      return { type: "video", ref: element.media.ref, altText: undefined, ...common };
    }
    return {
      type: "shape",
      ...common,
      viewBox: { top: 0, left: 0, width: element.width, height: element.height },
      paths: [{
        d: `M 0 0 H ${element.width} V ${element.height} H 0 Z`,
        fill: { color: element.color || "#ffffff" },
        stroke: element.stroke ? { ...element.stroke, strokeAlign: "inset" } : undefined,
      }],
    };
  }
  if (element.kind === "shape") {
    return {
      type: "shape",
      ...common,
      viewBox: element.viewBox || { top: 0, left: 0, width: element.width, height: element.height },
      paths: (element.paths || []).map((path) => ({
        d: path.d,
        fill: path.media ? { asset: mediaFill(path.media) } : { color: path.color || "#ffffff" },
        stroke: path.stroke ? { ...path.stroke, strokeAlign: "inset" as const } : undefined,
      })),
    };
  }
  if (element.kind === "group") {
    const children = (element.children || []).map((child) => hydrateElement(child, sdk)).filter((item): item is ElementAtPoint => Boolean(item));
    if (children.length < 2) return children[0] || null;
    return { type: "group", children: children as GroupContentAtPoint[], ...common };
  }
  return element.url ? { type: "embed", url: element.url, ...common } : null;
}

function stateFromSerialized(element: SerializedElement, helpers: DesignEditing.PageHelpers) {
  const builder = helpers.elementStateBuilder;
  const common = {
    top: element.top,
    left: element.left,
    width: element.width,
    rotation: element.rotation,
    transparency: element.transparency,
  };
  if (element.kind === "text") {
    return builder.createTextElement({ ...common, text: { regions: element.regions || [] } });
  }
  if (element.kind === "rect") {
    const fill = element.media?.type === "image"
      ? { mediaContainer: { type: "image" as const, imageRef: element.media.ref, flipX: false, flipY: false } }
      : element.media?.type === "video"
        ? { mediaContainer: { type: "video" as const, videoRef: element.media.ref, flipX: false, flipY: false } }
        : { colorContainer: { type: "solid" as const, color: element.color || "#ffffff" } };
    return builder.createRectElement({
      ...common,
      height: element.height,
      fill,
      stroke: element.stroke ? { weight: element.stroke.weight, colorContainer: { type: "solid", color: element.stroke.color } } : undefined,
    });
  }
  if (element.kind === "shape") {
    return builder.createShapeElement({
      ...common,
      height: element.height,
      viewBox: element.viewBox || { top: 0, left: 0, width: element.width, height: element.height },
      paths: (element.paths || []).map((path) => ({
        d: path.d,
        fill: path.media?.type === "image"
          ? { mediaContainer: { type: "image" as const, imageRef: path.media.ref, flipX: false, flipY: false }, isMediaEditable: true }
          : path.media?.type === "video"
            ? { mediaContainer: { type: "video" as const, videoRef: path.media.ref, flipX: false, flipY: false }, isMediaEditable: true }
            : { colorContainer: { type: "solid" as const, color: path.color || "#ffffff" } },
        stroke: path.stroke ? { weight: path.stroke.weight, colorContainer: { type: "solid" as const, color: path.stroke.color } } : undefined,
      })),
    });
  }
  if (element.kind === "embed" && element.url) {
    return builder.createEmbedElement({ top: element.top, left: element.left, width: element.width, height: element.height, rotation: element.rotation, transparency: element.transparency, url: element.url });
  }
  return undefined;
}

function scaledElement(element: SerializedElement, scaleX: number, scaleY: number, absoluteTop: number, absoluteLeft: number): SerializedElement {
  const scaled: SerializedElement = {
    ...element,
    top: absoluteTop + element.top * scaleY,
    left: absoluteLeft + element.left * scaleX,
    width: element.width * scaleX,
    height: element.height * scaleY,
  };
  if (element.kind === "text") {
    scaled.regions = element.regions?.map((region) => ({
      ...region,
      formatting: region.formatting?.fontSize
        ? { ...region.formatting, fontSize: region.formatting.fontSize * Math.min(scaleX, scaleY) }
        : region.formatting,
    }));
  }
  return scaled;
}

function containsUnsupported(element: Element): boolean {
  return element.type === "unsupported" || (element.type === "group" && element.contents.toArray().some(containsUnsupported));
}

async function resizeElement(
  page: DesignEditing.AbsolutePage,
  helpers: DesignEditing.PageHelpers,
  target: LocatedElement,
  width: number,
  height: number,
) {
  if (target.element.locked || target.element.type === "unsupported" || containsUnsupported(target.element)) return false;
  const serialized = serializeElement(target.element);
  if (!serialized) return false;
  if (target.element.type === "group") {
    const scaleX = width / target.element.width;
    const scaleY = height / target.element.height;
    const inserted: Exclude<DesignEditing.AbsoluteElement, DesignEditing.GroupElement | DesignEditing.UnsupportedElement>[] = [];
    for (const child of serialized.children || []) {
      const scaled = scaledElement(child, scaleX, scaleY, target.absoluteTop, target.absoluteLeft);
      const state = stateFromSerialized(scaled, helpers);
      if (!state) return false;
      const next = page.elements.insertBefore(target.element as DesignEditing.GroupElement, state);
      if (!next || next.type === "group" || next.type === "unsupported") return false;
      inserted.push(next);
    }
    if (!inserted.length) return false;
    await helpers.group({ elements: inserted });
    page.elements.delete(target.element as DesignEditing.GroupElement);
    return true;
  }
  const resized = { ...serialized, top: target.absoluteTop, left: target.absoluteLeft, width, height };
  const state = stateFromSerialized(resized, helpers);
  if (!state) return false;
  const topLevel = page.elements.toArray().find((element) => element === target.element);
  if (!topLevel) return false;
  const next = page.elements.insertBefore(topLevel, state);
  if (!next) return false;
  page.elements.delete(topLevel);
  return true;
}

export async function canUseCanva() {
  try {
    const { getDesignToken } = await import("@canva/design");
    await getDesignToken();
    return true;
  } catch {
    return false;
  }
}

export async function scanCanvaDeck(): Promise<DeckAudit> {
  const { getDesignMetadata, openDesign } = await import("@canva/design");
  const metadata = await getDesignMetadata();
  const pages: DeckPageSnapshot[] = [];

  await openDesign({ type: "all_pages" }, async (session) => {
    const refs = session.pageRefs.toArray();
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index];
      if (ref.type !== "absolute") continue;
      await session.helpers.openPage(ref, async ({ page }) => {
        pages.push(pageSnapshot(page, index + 1));
      });
    }
  });

  pages.sort((a, b) => a.number - b.number);
  const contracts = resolveSlideContracts(pages);
  for (const page of pages) {
    const contract = contracts.get(page.number);
    page.contractKey = contract?.key;
    page.family = contract?.family;
    page.lockedByContract = contract?.locked;
    if (!contract) {
      page.issues.push({
        code: "unmatched-slide-contract",
        page: page.number,
        severity: "error",
        message: "This slide could not be matched to a Nike semantic layout contract; automatic edits are blocked.",
      });
    }
    if (contract?.key === "focus-agentic-1") {
      const meaningfulBody = page.texts.filter((text) => text.top > 150 && text.top < 930 && !/FOCUS SESSIONS|Agentic AI Platform/i.test(text.text));
      if (meaningfulBody.length < 2) {
        page.issues.push({ code: "unfinished-source-slide", page: page.number, severity: "error", message: "The one-company Agentic AI source layout is unfinished." });
      }
    }
    if (contract?.family === "priority-map") {
      const cards = page.elements.filter((item) => item.kind === "shape" && item.width >= 280 && item.width <= 320 && item.height >= 255 && item.height <= 295);
      if (cards.length !== 10) {
        page.issues.push({ code: "priority-card-count", page: page.number, severity: "error", message: `Expected 10 priority cards; found ${cards.length}.`, expected: "10", actual: String(cards.length) });
      } else if (cards.some((card) => Math.abs(card.width - 300) > 1 || Math.abs(card.height - 278) > 1)) {
        page.issues.push({ code: "priority-card-geometry", page: page.number, severity: "warning", message: "Priority cards are not all 300 × 278." });
      }
    }
    if (contract?.family === "focus-grid" && contract.slots) {
      const bodyGroups = page.elements.filter((item) => item.kind === "group" && item.top > 150 && item.top < 930 && item.width > 250 && item.height > 150);
      if (bodyGroups.length && bodyGroups.length !== contract.slots) {
        page.issues.push({ code: "focus-card-count", page: page.number, severity: "warning", message: `The ${contract.slots}-slot layout exposes ${bodyGroups.length} repeated card groups.` });
      } else if (bodyGroups.length > 1) {
        const widthSpread = Math.max(...bodyGroups.map((item) => item.width)) - Math.min(...bodyGroups.map((item) => item.width));
        const heightSpread = Math.max(...bodyGroups.map((item) => item.height)) - Math.min(...bodyGroups.map((item) => item.height));
        if (widthSpread > 1 || heightSpread > 1) {
          page.issues.push({ code: "focus-card-geometry", page: page.number, severity: "warning", message: `Repeated Focus Session cards differ by ${round(widthSpread)} px in width and ${round(heightSpread)} px in height.` });
        }
      }
    }
    if (["masterclass-people-3a", "masterclass-people-2"].includes(contract?.key || "")) {
      const cards = page.elements.filter((item) => item.kind === "group" && item.top > 250 && item.top < 950 && item.width > 420 && item.width < 720 && item.height > 480);
      if (cards.length && cards.some((card) => Math.abs(card.width - 544.186) > 1 || Math.abs(card.height - 600) > 1)) {
        page.issues.push({ code: "person-card-geometry", page: page.number, severity: "warning", message: "Masterclass cards do not match the approved 544.186 × 600 geometry." });
      }
    }
    if (page.number > 1) {
      const eyebrow = page.texts.find((item) => item.top >= 35 && item.top <= 90 && item.left < 800 && !/ONNIVATION/i.test(item.text));
      if (eyebrow && eyebrow.fontRef && eyebrow.fontRef !== TOKENS.eyebrowFontRef) {
        page.issues.push({ code: "eyebrow-font", page: page.number, severity: "warning", message: "Eyebrow uses a non-canonical font family.", expected: TOKENS.eyebrowFontRef, actual: eyebrow.fontRef });
      }
      const heading = page.texts.filter((item) => item.top >= 100 && item.top <= 310).sort((a, b) => (b.fontSize || b.height) - (a.fontSize || a.height))[0];
      if (heading && heading.fontRef && heading.fontRef !== TOKENS.headingFontRef) {
        page.issues.push({ code: "heading-font", page: page.number, severity: "warning", message: "Main heading uses a non-canonical font family.", expected: TOKENS.headingFontRef, actual: heading.fontRef });
      }
    }
  }
  const matchedKeys = new Set([...contracts.values()].map((contract) => contract.key));
  const unmatchedContracts = NIKE_SLIDE_CONTRACTS.filter((contract) => !matchedKeys.has(contract.key)).map((contract) => contract.key);
  const issues = pages.flatMap((page) => page.issues);
  if (pages.length !== NIKE_EXPECTED_SLIDES) {
    issues.unshift({
      code: "template-page-count",
      page: 0,
      severity: "error",
      message: `Nike template version ${NIKE_TEMPLATE_VERSION} expects ${NIKE_EXPECTED_SLIDES} slides; found ${pages.length}.`,
      expected: String(NIKE_EXPECTED_SLIDES),
      actual: String(pages.length),
    });
  }
  return {
    connected: true,
    title: metadata.title || "Untitled Canva deck",
    pageCount: pages.length,
    width: pages[0]?.width || metadata.defaultPageDimensions?.width || 0,
    height: pages[0]?.height || metadata.defaultPageDimensions?.height || 0,
    inferredClient: inferClient(pages),
    templateVersion: NIKE_TEMPLATE_VERSION,
    expectedPageCount: NIKE_EXPECTED_SLIDES,
    matchedContracts: matchedKeys.size,
    unmatchedContracts,
    pages,
    issues,
    scannedAt: new Date().toISOString(),
  };
}

function replaceText(element: DesignEditing.TextElement, find: string, replacement: string) {
  const plaintext = element.text.readPlaintext();
  const indices: number[] = [];
  let cursor = plaintext.indexOf(find);
  while (cursor >= 0) {
    indices.push(cursor);
    cursor = plaintext.indexOf(find, cursor + find.length);
  }
  for (const index of indices.reverse()) {
    element.text.replaceText({ index, length: find.length }, replacement);
  }
  return indices.length;
}

function operationIsActive(operations: PlanOperation[], type: PlanOperation["type"]) {
  return operations.some((item) => item.enabled && item.type === type);
}

function isImageElement(element: Element) {
  return Boolean(imageRefForElement(element));
}

function selectorKindMatches(located: LocatedElement, kind: ElementSelector["kind"]) {
  if (!kind) return true;
  if (kind === "image") return isImageElement(located.element);
  if (kind === "shape") return (located.element.type === "shape" || located.element.type === "rect") && !isImageElement(located.element);
  return located.element.type === kind;
}

function numericRoleSlot(role?: string) {
  const value = role?.match(/_(\d+)_/)?.[1];
  return value ? Number(value) : undefined;
}

function sortedBodyImages(located: LocatedElement[]) {
  return located.filter((item) =>
    isImageElement(item.element) &&
    item.absoluteTop > 170 &&
    item.absoluteTop < 930 &&
    item.element.width > 35 &&
    item.element.height > 35 &&
    item.element.width < 900 &&
    item.element.height < 800,
  ).sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft);
}

function priorityCards(located: LocatedElement[]) {
  return located.filter((item) =>
    item.depth === 0 &&
    (item.element.type === "shape" || item.element.type === "rect") &&
    !isImageElement(item.element) &&
    item.element.width >= 280 && item.element.width <= 320 &&
    item.element.height >= 255 && item.element.height <= 295 &&
    item.absoluteTop > 300 && item.absoluteTop < 950,
  ).sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft);
}

function focusCards(located: LocatedElement[]) {
  const groups = located.filter((item) =>
    item.depth === 0 && item.element.type === "group" &&
    item.absoluteTop > 150 && item.absoluteTop < 930 &&
    item.element.width > 250 && item.element.width < 1000 &&
    item.element.height > 150 && item.element.height < 780,
  );
  if (groups.length) return groups.sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft);
  return located.filter((item) =>
    item.depth === 0 && (item.element.type === "shape" || item.element.type === "rect") &&
    item.absoluteTop > 180 && item.absoluteTop < 900 &&
    item.element.width > 250 && item.element.width < 900 &&
    item.element.height > 150 && item.element.height < 700,
  ).sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft);
}

function personCards(located: LocatedElement[]) {
  return located.filter((item) =>
    item.depth === 0 && item.element.type === "group" &&
    item.absoluteTop > 250 && item.absoluteTop < 950 &&
    item.element.width > 420 && item.element.width < 720 &&
    item.element.height > 480 && item.element.height < 780,
  ).sort((a, b) => a.absoluteLeft - b.absoluteLeft);
}

function within(item: LocatedElement, container: LocatedElement) {
  const centerX = item.absoluteLeft + item.element.width / 2;
  const centerY = item.absoluteTop + item.element.height / 2;
  return centerX >= container.absoluteLeft &&
    centerX <= container.absoluteLeft + container.element.width &&
    centerY >= container.absoluteTop &&
    centerY <= container.absoluteTop + container.element.height;
}

function roleCandidates(located: LocatedElement[], role: NonNullable<ElementSelector["role"]>): LocatedElement[] {
  const slot = numericRoleSlot(role) || 1;
  if (role === "section_heading") {
    return located.filter((item) => item.element.type === "text" && item.absoluteTop >= 100 && item.absoluteTop <= 310)
      .sort((a, b) => {
        const aSize = a.element.type === "text" ? firstTextFormatting(a.element)?.fontSize || a.element.height : 0;
        const bSize = b.element.type === "text" ? firstTextFormatting(b.element)?.fontSize || b.element.height : 0;
        return bSize - aSize || b.element.width - a.element.width;
      }).slice(0, 1);
  }
  if (role === "section_eyebrow") {
    return located.filter((item) =>
      item.element.type === "text" && item.absoluteTop >= 35 && item.absoluteTop <= 90 && item.absoluteLeft < 800 &&
      !/ONNIVATION/i.test(item.element.text.readPlaintext()),
    ).sort((a, b) => a.absoluteLeft - b.absoluteLeft).slice(0, 1);
  }
  if (role === "section_dot") {
    return located.filter((item) => isImageElement(item.element) && item.absoluteTop < 110 && item.absoluteLeft < 115)
      .sort((a, b) => Math.hypot(a.absoluteTop - 44.9, a.absoluteLeft - 45.434) - Math.hypot(b.absoluteTop - 44.9, b.absoluteLeft - 45.434)).slice(0, 1);
  }
  if (role === "header_line" || role === "footer_line") {
    const targetTop = role === "header_line" ? 85 : 965;
    return located.filter((item) =>
      item.depth === 0 && item.element.type !== "text" && item.element.width > 1450 && item.element.height < 60 && Math.abs(item.absoluteTop - targetTop) < 80,
    ).sort((a, b) => Math.abs(a.absoluteTop - targetTop) - Math.abs(b.absoluteTop - targetTop)).slice(0, 1);
  }
  if (role === "footer_text") {
    return located.filter((item) => item.element.type === "text" && item.absoluteTop > 930 && /ONNIVATION/i.test(item.element.text.readPlaintext())).slice(0, 1);
  }
  if (role === "route_origin" || role === "route_destination") {
    const route = located.filter((item) =>
      item.element.type === "text" && item.absoluteTop < 95 && item.absoluteLeft > 1250 && item.element.text.readPlaintext().trim().length < 40,
    ).sort((a, b) => a.absoluteLeft - b.absoluteLeft).slice(-2);
    return role === "route_origin" ? route.slice(0, 1) : route.slice(1, 2);
  }
  if (role === "route_arrow") {
    const origin = roleCandidates(located, "route_origin")[0];
    const destination = roleCandidates(located, "route_destination")[0];
    if (!origin || !destination) return [];
    return located.filter((item) =>
      item.depth === 0 && item.element.type !== "text" && item.absoluteTop < 100 &&
      item.absoluteLeft > origin.absoluteLeft + origin.element.width - 18 && item.absoluteLeft < destination.absoluteLeft + 18 &&
      item.element.width >= 15 && item.element.width <= 95 && item.element.height <= 55,
    ).sort((a, b) => Math.abs(a.element.width - 46) - Math.abs(b.element.width - 46)).slice(0, 1);
  }
  if (/^priority_\d+_card$/.test(role)) return priorityCards(located).slice(slot - 1, slot);
  if (/^priority_\d+_(?:icon|label)$/.test(role)) {
    const card = priorityCards(located)[slot - 1];
    if (!card) return [];
    const candidates = located.filter((item) => within(item, card));
    if (role.endsWith("_icon")) return candidates.filter((item) => isImageElement(item.element)).sort((a, b) => b.element.width * b.element.height - a.element.width * a.element.height).slice(0, 1);
    return candidates.filter((item) => item.element.type === "text" && !/FOCUS SESSIONS/i.test(item.element.text.readPlaintext()))
      .sort((a, b) => b.absoluteTop - a.absoluteTop).slice(0, 1);
  }
  if (/^focus_\d+_card$/.test(role)) return focusCards(located).slice(slot - 1, slot);
  if (/^focus_\d+_(?:logo|name|description)$/.test(role)) {
    const card = focusCards(located)[slot - 1];
    const candidates = card ? located.filter((item) => within(item, card)) : located;
    if (role.endsWith("_logo")) {
      const images = (card ? candidates : sortedBodyImages(located)).filter((item) => isImageElement(item.element));
      return images.sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft).slice(card ? 0 : slot - 1, card ? 1 : slot);
    }
    const texts = candidates.filter((item) => item.element.type === "text" && !/FOCUS SESSIONS/i.test(item.element.text.readPlaintext()));
    if (role.endsWith("_name")) {
      return texts.sort((a, b) => {
        const aSize = a.element.type === "text" ? firstTextFormatting(a.element)?.fontSize || 0 : 0;
        const bSize = b.element.type === "text" ? firstTextFormatting(b.element)?.fontSize || 0 : 0;
        return bSize - aSize || a.absoluteTop - b.absoluteTop;
      }).slice(0, 1);
    }
    return texts.sort((a, b) => {
      const aLength = a.element.type === "text" ? a.element.text.readPlaintext().length : 0;
      const bLength = b.element.type === "text" ? b.element.text.readPlaintext().length : 0;
      return bLength - aLength;
    }).slice(0, 1);
  }
  if (/^person_\d+_card$/.test(role)) return personCards(located).slice(slot - 1, slot);
  if (/^person_\d+_(?:image|name)$/.test(role)) {
    const card = personCards(located)[slot - 1];
    const candidates = card ? located.filter((item) => within(item, card)) : located;
    if (role.endsWith("_image")) {
      const images = candidates.filter((item) => isImageElement(item.element) && item.absoluteTop > 200 && item.absoluteTop < 930).sort((a, b) => a.absoluteLeft - b.absoluteLeft || b.element.height - a.element.height);
      return images.slice(card ? 0 : slot - 1, card ? 1 : slot);
    }
    const names = candidates.filter((item) => item.element.type === "text" && item.absoluteTop > 250 && item.absoluteTop < 930).sort((a, b) => {
      const aSize = a.element.type === "text" ? firstTextFormatting(a.element)?.fontSize || 0 : 0;
      const bSize = b.element.type === "text" ? firstTextFormatting(b.element)?.fontSize || 0 : 0;
      return a.absoluteLeft - b.absoluteLeft || bSize - aSize;
    });
    return names.slice(card ? 0 : slot - 1, card ? 1 : slot);
  }
  if (/^investor_\d+_logo$/.test(role)) return sortedBodyImages(located).slice(slot - 1, slot);
  if (/^investor_\d+_name$/.test(role)) {
    return located.filter((item) => item.element.type === "text" && item.absoluteTop > 250 && item.absoluteTop < 930)
      .sort((a, b) => a.absoluteTop - b.absoluteTop || a.absoluteLeft - b.absoluteLeft).slice(slot - 1, slot);
  }
  return [];
}

function locateTarget(located: LocatedElement[], selector?: ElementSelector) {
  if (!selector) return undefined;
  let candidates = selector.role ? roleCandidates(located, selector.role) : located.filter((item) => selectorKindMatches(item, selector.kind));
  if (selector.exactText !== undefined) {
    candidates = candidates.filter((item) => item.element.type === "text" && item.element.text.readPlaintext().trim() === selector.exactText);
  }
  if (selector.containsText !== undefined) {
    candidates = candidates.filter((item) => item.element.type === "text" && item.element.text.readPlaintext().includes(selector.containsText!));
  }
  if (selector.near) {
    const { top, left, tolerance = 40 } = selector.near;
    candidates = candidates.filter((item) => Math.hypot(item.absoluteTop - top, item.absoluteLeft - left) <= tolerance)
      .sort((a, b) => Math.hypot(a.absoluteTop - top, a.absoluteLeft - left) - Math.hypot(b.absoluteTop - top, b.absoluteLeft - left));
  }
  if (selector.occurrence !== undefined) return candidates[selector.occurrence - 1];
  return candidates.length === 1 ? candidates[0] : undefined;
}

function applyGeometry(target: LocatedElement, operation: PlanOperation) {
  const patch = operation.geometry;
  if (!patch || target.element.type === "unsupported" || target.element.locked) return false;
  let changed = false;
  if (patch.deltaX !== undefined) { target.element.left += patch.deltaX; changed = true; }
  if (patch.deltaY !== undefined) { target.element.top += patch.deltaY; changed = true; }
  if (patch.left !== undefined) { target.element.left = patch.left - target.parentLeft; changed = true; }
  if (patch.top !== undefined) { target.element.top = patch.top - target.parentTop; changed = true; }
  return changed;
}

function applyTextFormatting(element: DesignEditing.TextElement, patch?: FormattingPatch) {
  if (!patch) return false;
  const text = element.text.readPlaintext();
  if (!text.length) return false;
  const formatting: Partial<RichtextFormatting> = {
    ...patch,
    fontRef: patch.fontRef as RichtextFormatting["fontRef"],
  };
  element.text.formatText({ index: 0, length: text.length }, formatting);
  element.text.formatParagraph({ index: 0, length: text.length }, formatting as RichtextFormatting);
  return true;
}

export async function legacyApplyPlanToCanva(operations: PlanOperation[]): Promise<ApplyResult> {
  const sdk = await import("@canva/design");
  const { addPage, openDesign } = sdk;
  const active = operations.filter((item) => item.enabled);
  const changedPages = new Set<number>();
  const skipped: string[] = [];
  let changedElements = 0;

  const addPageOperations = active.filter((item) => item.type === "add_page_from_layout");
  const requestedSourcePages = new Set(
    addPageOperations
      .map((item) => Number(item.params?.sourcePage))
      .filter((page) => Number.isInteger(page) && page > 0),
  );
  const serializedPages = new Map<number, SerializedPage>();
  const uploadedImages = new Map<string, ImageRef>();

  const imageOperations = active.filter((item) => item.type === "replace_image");
  if (imageOperations.length) {
    const { upload } = await import("@canva/asset");
    for (const operation of imageOperations) {
      const sourceUrl = typeof operation.params?.sourceUrl === "string" ? operation.params.sourceUrl : undefined;
      const requestedMime = typeof operation.params?.mimeType === "string" ? operation.params.mimeType : "image/png";
      const allowedMimes = ["image/jpeg", "image/heic", "image/png", "image/svg+xml", "image/webp", "image/tiff"] as const;
      const mimeType = allowedMimes.find((mime) => mime === requestedMime);
      if (!sourceUrl || !sourceUrl.startsWith("https://") || !mimeType) {
        skipped.push(`${operation.title}: a direct HTTPS image URL and supported MIME type are required.`);
        continue;
      }
      try {
        const asset = await upload({
          type: "image",
          url: sourceUrl,
          thumbnailUrl: sourceUrl,
          mimeType,
          name: typeof operation.params?.title === "string" ? operation.params.title : operation.title,
          aiDisclosure: "none",
        });
        await asset.whenUploaded();
        uploadedImages.set(operation.id, asset.ref as ImageRef);
      } catch {
        skipped.push(`${operation.title}: Canva could not fetch the supplied official image URL; use a direct asset URL or upload override.`);
      }
    }
  }

  const deferred = active.filter((item) =>
    ["update_priorities", "update_people", "update_focus_sessions", "update_itinerary"].includes(item.type),
  );
  for (const item of deferred) {
    skipped.push(`${item.title}: requires approved content/assets or a selected canonical layout.`);
  }

  await openDesign({ type: "all_pages" }, async (session) => {
    const refs = session.pageRefs.toArray();
    for (let index = 0; index < refs.length; index += 1) {
      const pageNumber = index + 1;
      const ref = refs[index];
      if (ref.type !== "absolute" || ref.locked) continue;

      await session.helpers.openPage(ref, async ({ page }) => {
        if (requestedSourcePages.has(pageNumber)) serializedPages.set(pageNumber, serializePage(page));
        const appliesToPage = (operation: PlanOperation) => operation.pages.length === 0 || operation.pages.includes(pageNumber);
        const pageOperations = active.filter(appliesToPage);
        if (!pageOperations.length) return;

        for (const operation of pageOperations) {
          if ((operation.type === "replace_text" || operation.type === "update_client") && operation.find && operation.replace) {
            walkElements(page.elements.toArray(), ({ element }) => {
              if (element.type !== "text" || element.locked) return;
              const count = replaceText(element, operation.find!, operation.replace!);
              if (count) {
                changedElements += count;
                changedPages.add(pageNumber);
              }
            });
          }
        }

        if (operationIsActive(pageOperations, "normalize_backgrounds") && pageNumber > 1 && page.background) {
          const current = page.background.colorContainer.ref;
          if (current?.type === "solid" && current.color.toLowerCase() !== TOKENS.cream) {
            page.background.colorContainer.set({ type: "solid", color: TOKENS.cream });
            changedElements += 1;
            changedPages.add(pageNumber);
          }
        }

        if (operationIsActive(pageOperations, "normalize_footers")) {
          const targetTop = pageNumber === 1 ? 1007.57 : 1022.46;
          const targetLeft = pageNumber === 1 ? 63.55 : 56.03;
          walkElements(page.elements.toArray(), ({ element, absoluteTop, parentTop, parentLeft }) => {
            if (element.type !== "text" || element.locked || absoluteTop < 930) return;
            if (!/\bONNIVATION\b/i.test(element.text.readPlaintext())) return;
            if (Math.abs(element.left - (targetLeft - parentLeft)) > 0.5 || Math.abs(element.top - (targetTop - parentTop)) > 0.5) {
              element.left = targetLeft - parentLeft;
              element.top = targetTop - parentTop;
              changedElements += 1;
              changedPages.add(pageNumber);
            }
          });
        }

        const located: LocatedElement[] = [];
        walkElements(page.elements.toArray(), (item) => located.push(item));

        for (const operation of pageOperations.filter((item) => item.type === "replace_image")) {
          const imageRef = uploadedImages.get(operation.id);
          if (!imageRef) continue;
          const targetLeft = Number(operation.params?.targetLeft);
          const targetTop = Number(operation.params?.targetTop);
          const candidates: Array<{ located: LocatedElement; set: (ref: ImageRef) => void }> = [];
          for (const item of located) {
            if (item.element.locked) continue;
            if (item.element.type === "rect" && item.element.fill.mediaContainer.ref?.type === "image") {
              candidates.push({
                located: item,
                set: (refValue) => item.element.type === "rect" && item.element.fill.mediaContainer.set({ type: "image", imageRef: refValue, flipX: false, flipY: false }),
              });
            }
            if (item.element.type === "shape") {
              const editablePath = item.element.paths.toArray().find((path) => path.fill.isMediaEditable && path.fill.mediaContainer.ref?.type === "image");
              if (editablePath?.fill.isMediaEditable) {
                candidates.push({
                  located: item,
                  set: (refValue) => editablePath.fill.isMediaEditable && editablePath.fill.mediaContainer.set({ type: "image", imageRef: refValue, flipX: false, flipY: false }),
                });
              }
            }
          }
          const target = Number.isFinite(targetLeft) && Number.isFinite(targetTop)
            ? candidates.sort((a, b) =>
                Math.hypot(a.located.absoluteLeft - targetLeft, a.located.absoluteTop - targetTop) -
                Math.hypot(b.located.absoluteLeft - targetLeft, b.located.absoluteTop - targetTop),
              )[0]
            : candidates.length === 1
              ? candidates[0]
              : undefined;
          if (!target) {
            skipped.push(`${operation.title}: the target image box was not uniquely identified on page ${pageNumber}.`);
            continue;
          }
          target.set(imageRef);
          changedElements += 1;
          changedPages.add(pageNumber);
        }

        const routeLabels = located
          .filter(({ element, absoluteTop, absoluteLeft }) =>
            element.type === "text" && absoluteTop < 95 && absoluteLeft > 1250 && element.text.readPlaintext().trim().length < 40,
          )
          .sort((a, b) => a.absoluteLeft - b.absoluteLeft)
          .slice(-2);

        if (operationIsActive(pageOperations, "normalize_headers") && pageNumber > 1 && routeLabels.length === 2) {
          const targets = [41.97, 42.41];
          routeLabels.forEach((locatedLabel, labelIndex) => {
            if (locatedLabel.element.type !== "text" || locatedLabel.element.locked) return;
            const nextTop = targets[labelIndex] - locatedLabel.parentTop;
            if (Math.abs(locatedLabel.element.top - nextTop) > 0.5) {
              locatedLabel.element.top = nextTop;
              changedElements += 1;
              changedPages.add(pageNumber);
            }
          });
        }

        if (operationIsActive(pageOperations, "center_route_arrows") && pageNumber > 1 && routeLabels.length === 2) {
          const [origin, destination] = routeLabels;
          const candidates = page.elements.toArray().filter((element) =>
            element.type !== "text" &&
            element.top < 100 &&
            element.left > origin.absoluteLeft + origin.element.width - 18 &&
            element.left < destination.absoluteLeft + 18 &&
            element.width >= 15 &&
            element.width <= 95 &&
            element.height <= 55,
          );
          const arrow = candidates.sort((a, b) => Math.abs(a.width - 46) - Math.abs(b.width - 46))[0];
          if (arrow && arrow.type !== "unsupported" && !arrow.locked) {
            const expected = (origin.absoluteLeft + origin.element.width + destination.absoluteLeft) / 2 - arrow.width / 2;
            if (Math.abs(arrow.left - expected) > 0.5) {
              arrow.left = expected;
              changedElements += 1;
              changedPages.add(pageNumber);
            }
          }
        }
      });
    }

    if (changedElements > 0) await session.sync();
  });

  for (const operation of addPageOperations) {
    const sourcePageNumber = Number(operation.params?.sourcePage);
    const source = serializedPages.get(sourcePageNumber);
    if (!source) {
      skipped.push(`${operation.title}: choose a canonical source page before applying.`);
      continue;
    }
    const elements = source.elements.map((element) => hydrateElement(element, sdk)).filter((item): item is ElementAtPoint => Boolean(item));
    await addPage({
      title: `${operation.title} · source ${sourcePageNumber}`,
      dimensions: { width: source.width, height: source.height },
      background: source.background,
      elements,
    });
    changedElements += elements.length;
  }

  return { changedElements, changedPages: [...changedPages].sort((a, b) => a - b), skipped, failures: [], appliedOperationIds: [] };
}

function occurrences(value: string, find: string) {
  if (!find) return 0;
  let count = 0;
  let cursor = value.indexOf(find);
  while (cursor >= 0) {
    count += 1;
    cursor = value.indexOf(find, cursor + find.length);
  }
  return count;
}

async function preflightOperations(operations: PlanOperation[]) {
  const { openDesign } = await import("@canva/design");
  const counts = new Map(operations.map((operation) => [operation.id, 0]));

  await openDesign({ type: "all_pages" }, async (session) => {
    const refs = session.pageRefs.toArray();
    for (let index = 0; index < refs.length; index += 1) {
      const pageNumber = index + 1;
      const ref = refs[index];
      if (ref.type !== "absolute" || ref.locked) continue;
      const pageOperations = operations.filter((operation) => operation.pages.includes(pageNumber));
      if (!pageOperations.length) continue;
      await session.helpers.openPage(ref, async ({ page }) => {
        const located: LocatedElement[] = [];
        walkElements(page.elements.toArray(), (item) => located.push(item));
        for (const operation of pageOperations) {
          if ((operation.type === "replace_text" || operation.type === "update_client") && operation.find) {
            let count = 0;
            for (const item of located) {
              if (item.element.type === "text" && !item.element.locked) count += occurrences(item.element.text.readPlaintext(), operation.find);
            }
            counts.set(operation.id, (counts.get(operation.id) || 0) + count);
            continue;
          }
          if (["replace_image", "move_element", "resize_element", "format_text", "delete_element", "set_template_field"].includes(operation.type)) {
            const target = locateTarget(located, operation.target);
            const usable = target && !(operation.type === "resize_element" && containsUnsupported(target.element));
            counts.set(operation.id, (counts.get(operation.id) || 0) + (usable ? 1 : 0));
            continue;
          }
          if (operation.type === "insert_text" || operation.type === "insert_shape") {
            counts.set(operation.id, (counts.get(operation.id) || 0) + 1);
          }
        }
      });
    }
  });

  return operations.flatMap((operation) => {
    const expected = operation.expectedAffectedElements;
    if (!expected) return [];
    const actual = counts.get(operation.id) || 0;
    return actual < expected.min || actual > expected.max
      ? [`${operation.title}: preflight matched ${actual} element(s); expected ${expected.min}–${expected.max}. Nothing was written.`]
      : [];
  });
}

function setImageFill(element: Element, ref: ImageRef) {
  if (element.type === "rect" && element.fill.mediaContainer.ref?.type === "image") {
    element.fill.mediaContainer.set({ type: "image", imageRef: ref, flipX: false, flipY: false });
    return true;
  }
  if (element.type === "shape") {
    const path = element.paths.toArray().find((candidate) => candidate.fill.isMediaEditable && candidate.fill.mediaContainer.ref?.type === "image");
    if (path?.fill.isMediaEditable) {
      path.fill.mediaContainer.set({ type: "image", imageRef: ref, flipX: false, flipY: false });
      return true;
    }
  }
  return false;
}

function recolorShape(element: Element, color: string) {
  if (element.type === "rect") {
    element.fill.colorContainer.set({ type: "solid", color });
    return true;
  }
  if (element.type === "shape") {
    let changed = false;
    for (const path of element.paths.toArray()) {
      if (path.fill.colorContainer.ref) {
        path.fill.colorContainer.set({ type: "solid", color });
        changed = true;
      }
    }
    return changed;
  }
  return false;
}

function roundedRectPath(width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (!r) return `M 0 0 H ${width} V ${height} H 0 Z`;
  return `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

/**
 * Production apply path. Every operation is re-guarded against a fresh semantic
 * scan, preflighted without writes, then applied in a second design session.
 */
export async function applyPlanToCanva(operations: PlanOperation[]): Promise<ApplyResult> {
  const sdk = await import("@canva/design");
  const { addPage, openDesign } = sdk;
  const audit = await scanCanvaDeck();
  const guarded = operations.map((operation) => guardOperation(operation, audit));
  const active = guarded.filter((operation) => operation.enabled && operation.status === "executable" && operation.type !== "audit_deck");
  const skipped = guarded.filter((operation) => !operation.enabled || operation.status !== "executable")
    .map((operation) => `${operation.title}: ${operation.blockedReason || "not approved"}`);
  const failures = await preflightOperations(active);
  if (failures.length) {
    return { changedElements: 0, changedPages: [], skipped, failures, appliedOperationIds: [] };
  }

  const uploadedImages = new Map<string, ImageRef>();
  const imageOperations = active.filter((operation) => operation.type === "replace_image" && operation.asset);
  if (imageOperations.length) {
    const { upload } = await import("@canva/asset");
    for (const operation of imageOperations) {
      try {
        const asset = await upload({
          type: "image",
          url: operation.asset!.sourceUrl,
          thumbnailUrl: operation.asset!.sourceUrl,
          mimeType: operation.asset!.mimeType,
          name: operation.asset!.title,
          aiDisclosure: "none",
        });
        await asset.whenUploaded();
        uploadedImages.set(operation.id, asset.ref as ImageRef);
      } catch (error) {
        failures.push(`${operation.title}: Canva could not import the approved asset (${error instanceof Error ? error.message : "upload failed"}).`);
      }
    }
  }
  if (failures.length) return { changedElements: 0, changedPages: [], skipped, failures, appliedOperationIds: [] };

  const addPageOperations = active.filter((operation) => operation.type === "add_page_from_layout");
  const sourcePageNumbers = new Map<string, number>();
  for (const operation of addPageOperations) {
    const source = audit.pages.find((page) => page.contractKey === operation.sourcePageKey);
    if (source) sourcePageNumbers.set(operation.id, source.number);
  }
  const requestedSources = new Set(sourcePageNumbers.values());
  const serializedPages = new Map<number, SerializedPage>();
  const changedPages = new Set<number>();
  const operationCounts = new Map(active.map((operation) => [operation.id, 0]));
  let changedElements = 0;

  await openDesign({ type: "all_pages" }, async (session) => {
    const refs = session.pageRefs.toArray();
    for (let index = 0; index < refs.length; index += 1) {
      const pageNumber = index + 1;
      const ref = refs[index];
      if (ref.type !== "absolute" || ref.locked) continue;
      await session.helpers.openPage(ref, async ({ page, helpers }) => {
        if (requestedSources.has(pageNumber)) serializedPages.set(pageNumber, serializePage(page));
        const pageOperations = active.filter((operation) => operation.pages.includes(pageNumber));
        if (!pageOperations.length) return;
        const located: LocatedElement[] = [];
        walkElements(page.elements.toArray(), (item) => located.push(item));

        const record = (operation: PlanOperation, amount = 1) => {
          operationCounts.set(operation.id, (operationCounts.get(operation.id) || 0) + amount);
          changedElements += amount;
          changedPages.add(pageNumber);
        };

        for (const operation of pageOperations) {
          if ((operation.type === "replace_text" || operation.type === "update_client") && operation.find && operation.replace !== undefined) {
            for (const item of located) {
              if (item.element.type !== "text" || item.element.locked) continue;
              const count = replaceText(item.element, operation.find, operation.replace);
              if (count) record(operation, count);
            }
          }
        }

        if (operationIsActive(pageOperations, "normalize_backgrounds") && pageNumber > 1 && page.background) {
          const current = page.background.colorContainer.ref;
          if (current?.type === "solid" && ![TOKENS.cream, TOKENS.paper].includes(current.color.toLowerCase())) {
            page.background.colorContainer.set({ type: "solid", color: TOKENS.cream });
            const operation = pageOperations.find((item) => item.type === "normalize_backgrounds")!;
            record(operation);
          }
        }

        if (operationIsActive(pageOperations, "normalize_headers") && pageNumber > 1) {
          const operation = pageOperations.find((item) => item.type === "normalize_headers")!;
          const header = locateTarget(located, { role: "header_line" });
          if (header && !header.element.locked) {
            recolorShape(header.element, TOKENS.gold);
            applyGeometry(header, { ...operation, geometry: { top: 85, left: 71 } });
            if (await resizeElement(page, helpers, header, 1778, 2)) record(operation);
          } else {
            const state = helpers.elementStateBuilder.createShapeElement({
              top: 85, left: 71, width: 1778, height: 2,
              viewBox: { top: 0, left: 0, width: 1778, height: 2 },
              paths: [{ d: "M 0 0 H 1778 V 2 H 0 Z", fill: { colorContainer: { type: "solid", color: TOKENS.gold } } }],
            });
            page.elements.insertBefore(undefined, state);
            record(operation);
          }
          const dot = locateTarget(located, { role: "section_dot" });
          if (dot && !dot.element.locked) {
            setImageFill(dot.element, TOKENS.dotMediaRef as ImageRef);
            applyGeometry(dot, { ...operation, geometry: { top: 44.9, left: 45.434 } });
            if (await resizeElement(page, helpers, dot, 47, 45)) record(operation);
          } else {
            const state = helpers.elementStateBuilder.createRectElement({
              top: 44.9, left: 45.434, width: 47, height: 45,
              fill: { mediaContainer: { type: "image", imageRef: TOKENS.dotMediaRef as ImageRef, flipX: false, flipY: false } },
            });
            page.elements.insertBefore(undefined, state);
            record(operation);
          }
          const eyebrow = locateTarget(located, { role: "section_eyebrow" });
          if (eyebrow?.element.type === "text" && !eyebrow.element.locked) {
            applyGeometry(eyebrow, { ...operation, geometry: { top: 50.181, left: 121.229 } });
            applyTextFormatting(eyebrow.element, { fontRef: TOKENS.eyebrowFontRef, fontSize: 24, fontWeight: "bold", color: TOKENS.forest });
            record(operation);
          }
          const heading = locateTarget(located, { role: "section_heading" });
          if (heading?.element.type === "text" && !heading.element.locked) {
            applyTextFormatting(heading.element, { fontRef: TOKENS.headingFontRef, fontWeight: "normal", color: TOKENS.forest });
            record(operation);
          }
        }

        if (operationIsActive(pageOperations, "normalize_footers") && pageNumber > 1) {
          const operation = pageOperations.find((item) => item.type === "normalize_footers")!;
          const footerRail = locateTarget(located, { role: "footer_line" });
          if (footerRail && !footerRail.element.locked) {
            recolorShape(footerRail.element, TOKENS.gold);
            applyGeometry(footerRail, { ...operation, geometry: { top: 965, left: 71 } });
            if (await resizeElement(page, helpers, footerRail, 1778, 2)) record(operation);
          } else {
            const state = helpers.elementStateBuilder.createShapeElement({
              top: 965, left: 71, width: 1778, height: 2,
              viewBox: { top: 0, left: 0, width: 1778, height: 2 },
              paths: [{ d: "M 0 0 H 1778 V 2 H 0 Z", fill: { colorContainer: { type: "solid", color: TOKENS.gold } } }],
            });
            page.elements.insertBefore(undefined, state);
            record(operation);
          }
          for (const item of located) {
            if (item.element.type !== "text" || item.element.locked || item.absoluteTop < 930) continue;
            const before = item.element.text.readPlaintext();
            const after = before.replace(/\|\s*\|+/g, "|");
            if (after !== before) {
              replaceText(item.element, before, after);
              record(operation);
            }
          }
        }

        if (operationIsActive(pageOperations, "center_route_arrows") && pageNumber > 1) {
          const operation = pageOperations.find((item) => item.type === "center_route_arrows")!;
          const origin = locateTarget(located, { role: "route_origin" });
          const destination = locateTarget(located, { role: "route_destination" });
          const arrow = locateTarget(located, { role: "route_arrow" });
          if (origin && destination && arrow && arrow.element.type !== "unsupported" && !arrow.element.locked) {
            const expected = (origin.absoluteLeft + origin.element.width + destination.absoluteLeft) / 2 - arrow.element.width / 2;
            if (Math.abs(arrow.absoluteLeft - expected) > 0.5) {
              arrow.element.left = expected - arrow.parentLeft;
              record(operation);
            }
          }
        }

        for (const operation of pageOperations.filter((item) => ["move_element", "resize_element", "format_text", "replace_image", "delete_element", "set_template_field"].includes(item.type))) {
          const target = locateTarget(located, operation.target);
          if (!target || target.element.locked) continue;
          if (operation.type === "move_element" && applyGeometry(target, operation)) record(operation);
          if (operation.type === "resize_element" && operation.geometry) {
            const ratio = target.element.width / target.element.height;
            const width = operation.geometry.width ?? (operation.geometry.height !== undefined && operation.geometry.preserveAspectRatio ? operation.geometry.height * ratio : target.element.width);
            const height = operation.geometry.height ?? (operation.geometry.width !== undefined && operation.geometry.preserveAspectRatio ? operation.geometry.width / ratio : target.element.height);
            if (await resizeElement(page, helpers, target, width, height)) record(operation);
          }
          if (operation.type === "format_text" && target.element.type === "text" && applyTextFormatting(target.element, operation.formatting)) record(operation);
          if (operation.type === "replace_image") {
            const imageRef = uploadedImages.get(operation.id);
            if (imageRef && setImageFill(target.element, imageRef)) record(operation);
          }
          if (operation.type === "set_template_field" && target.element.type === "text" && operation.replace !== undefined) {
            const before = target.element.text.readPlaintext();
            target.element.text.replaceText({ index: 0, length: before.length }, operation.replace);
            record(operation);
          }
          if (operation.type === "delete_element") {
            const topLevel = page.elements.toArray().find((element) => element === target.element);
            if (topLevel) {
              page.elements.delete(topLevel);
              record(operation);
            }
          }
        }

        for (const operation of pageOperations.filter((item) => item.type === "insert_text" || item.type === "insert_shape")) {
          const spec = operation.insert!;
          if (operation.type === "insert_text") {
            const state = helpers.elementStateBuilder.createTextElement({
              top: spec.top,
              left: spec.left,
              width: spec.width,
              rotation: spec.rotation || 0,
              text: { regions: [{ text: spec.text!, formatting: operation.formatting ? { ...operation.formatting, fontRef: operation.formatting.fontRef as RichtextFormatting["fontRef"] } : undefined }] },
            });
            page.elements.insertBefore(undefined, state);
            record(operation);
          } else {
            const height = spec.height || spec.width;
            const state = helpers.elementStateBuilder.createShapeElement({
              top: spec.top,
              left: spec.left,
              width: spec.width,
              height,
              rotation: spec.rotation || 0,
              viewBox: { top: 0, left: 0, width: spec.width, height },
              paths: [{
                d: roundedRectPath(spec.width, height, spec.cornerRadius || 0),
                fill: { colorContainer: { type: "solid", color: spec.fill || TOKENS.paper } },
                stroke: spec.strokeColor ? { weight: spec.strokeWeight || 1, colorContainer: { type: "solid", color: spec.strokeColor } } : undefined,
              }],
            });
            page.elements.insertBefore(undefined, state);
            record(operation);
          }
        }
      });
    }
    if (changedElements > 0) await session.sync();
  });

  for (const operation of addPageOperations) {
    const sourcePageNumber = sourcePageNumbers.get(operation.id);
    const source = sourcePageNumber ? serializedPages.get(sourcePageNumber) : undefined;
    if (!source) {
      failures.push(`${operation.title}: the approved source layout could not be serialized.`);
      continue;
    }
    const elements = source.elements.map((element) => hydrateElement(element, sdk)).filter((item): item is ElementAtPoint => Boolean(item));
    await addPage({
      title: `${operation.title} · ${operation.sourcePageKey}`,
      dimensions: { width: source.width, height: source.height },
      background: source.background,
      elements,
    });
    operationCounts.set(operation.id, elements.length);
    changedElements += elements.length;
  }

  const appliedOperationIds = active.filter((operation) => (operationCounts.get(operation.id) || 0) > 0).map((operation) => operation.id);
  for (const operation of active) {
    const expected = operation.expectedAffectedElements;
    const actual = operationCounts.get(operation.id) || 0;
    if (expected && (actual < expected.min || actual > expected.max)) {
      failures.push(`${operation.title}: applied ${actual} element(s), outside the approved ${expected.min}–${expected.max} range.`);
    }
  }

  return {
    changedElements,
    changedPages: [...changedPages].sort((a, b) => a - b),
    skipped,
    failures,
    appliedOperationIds,
  };
}
