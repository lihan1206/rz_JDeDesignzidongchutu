import type {
  DesignData,
  Layer,
  DesignElement,
  ElementType,
  CanvasConfig
} from "../types";

const GRID_SIZE = 10;
const SNAP_TOLERANCE = 8;

export const defaultLayers: Layer[] = [
  { id: "layer-main", name: "主图层", visible: true, locked: false, order: 1 },
  { id: "layer-note", name: "标注层", visible: true, locked: false, order: 2 }
];

export const defaultDesignData: DesignData = {
  canvas: {
    width: 1200,
    height: 780,
    background: "#f6f9ff"
  },
  layers: defaultLayers,
  elements: []
};

export function normalizeDesignData(raw: unknown): DesignData {
  if (!raw || typeof raw !== "object") {
    return defaultDesignData;
  }

  const data = raw as Record<string, unknown>;
  const rawLayers = data.layers as unknown[] | undefined;
  const normalizedLayers: Layer[] =
    Array.isArray(rawLayers) && rawLayers.length
      ? rawLayers.map((layer, index) => {
          const l = layer as Record<string, unknown>;
          return {
            id: String(l.id || `layer-${index + 1}`),
            name: String(l.name || `图层 ${index + 1}`),
            visible: l.visible !== false,
            locked: Boolean(l.locked),
            order: Number.isFinite(Number(l.order)) ? Number(l.order) : index + 1
          };
        })
      : defaultLayers;

  const defaultLayerId = normalizedLayers[0].id;
  const rawCanvas = data.canvas as Record<string, unknown> | undefined;
  const rawElements = data.elements as unknown[] | undefined;

  return {
    canvas: {
      width: Number(rawCanvas?.width) || 1200,
      height: Number(rawCanvas?.height) || 780,
      background: String(rawCanvas?.background || "#f6f9ff")
    },
    layers: normalizedLayers,
    elements: Array.isArray(rawElements)
      ? rawElements.map((element) => {
          const e = element as Record<string, unknown>;
          return {
            ...e,
            layerId: String(e.layerId || defaultLayerId)
          } as DesignElement;
        })
      : []
  };
}

export function createElement<T extends ElementType>(
  type: T,
  layerId: string
): DesignElement {
  const baseId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;

  if (type === "rect") {
    return {
      id: baseId,
      type: "rect",
      layerId,
      name: "矩形",
      x: 120,
      y: 100,
      width: 240,
      height: 140,
      fill: "#e6f4ff",
      stroke: "#1677ff",
      strokeWidth: 2,
      rotation: 0
    } as DesignElement;
  }

  if (type === "circle") {
    return {
      id: baseId,
      type: "circle",
      layerId,
      name: "圆形",
      x: 520,
      y: 240,
      radius: 70,
      fill: "#fff1f0",
      stroke: "#ff4d4f",
      strokeWidth: 2
    } as DesignElement;
  }

  if (type === "line") {
    return {
      id: baseId,
      type: "line",
      layerId,
      name: "线段",
      x1: 180,
      y1: 480,
      x2: 740,
      y2: 520,
      stroke: "#1f1f1f",
      strokeWidth: 3
    } as DesignElement;
  }

  if (type === "dimension") {
    return {
      id: baseId,
      type: "dimension",
      layerId,
      name: "尺寸标注",
      x1: 200,
      y1: 640,
      x2: 560,
      y2: 640,
      text: "360 mm",
      stroke: "#fa8c16",
      strokeWidth: 1,
      fontSize: 16
    } as DesignElement;
  }

  return {
    id: baseId,
    type: "text",
    layerId,
    name: "文本",
    x: 180,
    y: 60,
    text: "请输入标注文本",
    fontSize: 28,
    fill: "#111827"
  } as DesignElement;
}

export function computeDimensionText(element: DesignElement): string {
  if (element.type === "dimension" && element.text?.trim()) {
    return element.text;
  }

  if (element.type === "dimension" || element.type === "line") {
    const x1 = Number((element as { x1?: number }).x1 || 0);
    const y1 = Number((element as { y1?: number }).y1 || 0);
    const x2 = Number((element as { x2?: number }).x2 || 0);
    const y2 = Number((element as { y2?: number }).y2 || 0);
    const distance = Math.hypot(x2 - x1, y2 - y1);
    return `${distance.toFixed(0)} mm`;
  }

  return "";
}

function getSnapPointsFromElement(element: DesignElement): {
  xs: number[];
  ys: number[];
} {
  if (element.type === "rect") {
    const e = element as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    return {
      xs: [e.x, e.x + e.width / 2, e.x + e.width],
      ys: [e.y, e.y + e.height / 2, e.y + e.height]
    };
  }

  if (element.type === "circle") {
    const e = element as { x: number; y: number; radius: number };
    return {
      xs: [e.x - e.radius, e.x, e.x + e.radius],
      ys: [e.y - e.radius, e.y, e.y + e.radius]
    };
  }

  if (element.type === "text") {
    const e = element as { x: number; y: number };
    return {
      xs: [e.x],
      ys: [e.y]
    };
  }

  if (element.type === "line" || element.type === "dimension") {
    const e = element as {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
    return {
      xs: [e.x1, (e.x1 + e.x2) / 2, e.x2],
      ys: [e.y1, (e.y1 + e.y2) / 2, e.y2]
    };
  }

  return { xs: [], ys: [] };
}

function nearestValue(target: number, values: number[]): {
  nearest: number | null;
  delta: number;
} {
  let nearest: number | null = null;
  let delta = Number.POSITIVE_INFINITY;

  for (const value of values) {
    const currentDelta = Math.abs(value - target);
    if (currentDelta < delta) {
      delta = currentDelta;
      nearest = value;
    }
  }

  return { nearest, delta };
}

function snapAxis(value: number, candidates: number[]): number {
  const snappedToGrid = Math.round(value / GRID_SIZE) * GRID_SIZE;
  const gridDelta = Math.abs(snappedToGrid - value);

  const { nearest, delta } = nearestValue(value, candidates);

  if (nearest !== null && delta <= SNAP_TOLERANCE && delta <= gridDelta + 1) {
    return nearest;
  }

  if (gridDelta <= SNAP_TOLERANCE) {
    return snappedToGrid;
  }

  return value;
}

export function applySnapping(
  dragElement: DesignElement,
  nextPos: { x: number; y: number },
  designData: DesignData
): { x: number; y: number } {
  const allVisible = getRenderableElements(designData);
  const others = allVisible.filter((item) => item.id !== dragElement.id);

  const candidateXs: number[] = [];
  const candidateYs: number[] = [];

  for (const element of others) {
    const points = getSnapPointsFromElement(element);
    candidateXs.push(...points.xs);
    candidateYs.push(...points.ys);
  }

  if (dragElement.type === "rect" || dragElement.type === "text" || dragElement.type === "circle") {
    return {
      x: snapAxis(nextPos.x, candidateXs),
      y: snapAxis(nextPos.y, candidateYs)
    };
  }

  return nextPos;
}

export function getRenderableElements(designData: DesignData): DesignElement[] {
  const layers = Array.isArray(designData.layers) ? designData.layers : [];
  const layerMap = new Map<string, Layer>(layers.map((layer) => [layer.id, layer]));

  const elements = Array.isArray(designData.elements) ? designData.elements : [];

  return [...elements]
    .filter((element) => {
      const layer = layerMap.get(element.layerId);
      if (!layer) {
        return true;
      }
      return layer.visible !== false;
    })
    .sort((a, b) => {
      const la = layerMap.get(a.layerId)?.order ?? 0;
      const lb = layerMap.get(b.layerId)?.order ?? 0;
      return la - lb;
    });
}

export function isLayerLocked(designData: DesignData, layerId: string): boolean {
  const layer = (designData.layers || []).find((item) => item.id === layerId);
  return Boolean(layer?.locked);
}
