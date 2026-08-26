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
  ImageNodeSnapshot,
  DeckPageSnapshot,
  PlanOperation,
  TextNodeSnapshot,
} from "./deck-types";

type Element = DesignEditing.AbsoluteElement | DesignEditing.GroupContentElement;

type LocatedElement = {
  element: Element;
  absoluteTop: number;
  absoluteLeft: number;
  parentTop: number;
  parentLeft: number;
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
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function walkElements(
  elements: readonly Element[],
  visit: (located: LocatedElement) => void,
  parentTop = 0,
  parentLeft = 0,
) {
  for (const element of elements) {
    const absoluteTop = parentTop + element.top;
    const absoluteLeft = parentLeft + element.left;
    visit({ element, absoluteTop, absoluteLeft, parentTop, parentLeft });
    if (element.type === "group") {
      walkElements(element.contents.toArray(), visit, absoluteTop, absoluteLeft);
    }
  }
}

function readBackground(page: DesignEditing.AbsolutePage) {
  const color = page.background?.colorContainer.ref;
  return color?.type === "solid" ? color.color.toLowerCase() : undefined;
}

function pageSnapshot(page: DesignEditing.AbsolutePage, number: number): DeckPageSnapshot {
  const texts: TextNodeSnapshot[] = [];
  const images: ImageNodeSnapshot[] = [];
  const nonTexts: LocatedElement[] = [];
  const issues: DeckIssue[] = [];

  walkElements(page.elements.toArray(), (located) => {
    const { element, absoluteTop, absoluteLeft } = located;
    if (element.type === "text") {
      const text = element.text.readPlaintext().trim();
      if (text) {
        texts.push({
          text,
          top: round(absoluteTop),
          left: round(absoluteLeft),
          width: round(element.width),
          height: round(element.height),
          locked: element.locked,
        });
      }
    } else {
      nonTexts.push(located);
      const hasImage = element.type === "rect"
        ? element.fill.mediaContainer.ref?.type === "image"
        : element.type === "shape"
          ? element.paths.toArray().some((path) => path.fill.mediaContainer.ref?.type === "image")
          : false;
      if (hasImage) {
        images.push({
          top: round(absoluteTop),
          left: round(absoluteLeft),
          width: round(element.width),
          height: round(element.height),
          locked: element.locked,
        });
      }
    }
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
  } else {
    const expectedTop = number === 1 ? 1007.57 : 1022.46;
    const expectedLeft = number === 1 ? 63.55 : 56.03;
    if (Math.abs(footer.top - expectedTop) > 1 || Math.abs(footer.left - expectedLeft) > 1) {
      issues.push({
        code: "footer-rail",
        page: number,
        severity: "warning",
        message: "Footer brand is off the canonical rail.",
        expected: `${expectedLeft}, ${expectedTop}`,
        actual: `${footer.left}, ${footer.top}`,
      });
    }
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
  const issues = pages.flatMap((page) => page.issues);
  return {
    connected: true,
    title: metadata.title || "Untitled Canva deck",
    pageCount: pages.length,
    width: pages[0]?.width || metadata.defaultPageDimensions?.width || 0,
    height: pages[0]?.height || metadata.defaultPageDimensions?.height || 0,
    inferredClient: inferClient(pages),
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

export async function applyPlanToCanva(operations: PlanOperation[]): Promise<ApplyResult> {
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

  return { changedElements, changedPages: [...changedPages].sort((a, b) => a - b), skipped };
}
