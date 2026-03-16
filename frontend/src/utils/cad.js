const GRID_SIZE = 10;
const SNAP_TOLERANCE = 8;

export const defaultLayers = [
  { id: "layer-main", name: "主图层", visible: true, locked: false, order: 1 },
  { id: "layer-note", name: "标注层", visible: true, locked: false, order: 2 }
];

export const defaultDesignData = {
  canvas: {
    width: 1200,
    height: 780,
    background: "#f6f9ff"
  },
  layers: defaultLayers,
  elements: []
};

export function normalizeDesignData(raw) {
  if (!raw || typeof raw !== "object") {
    return defaultDesignData;
  }

  const normalizedLayers = Array.isArray(raw.layers) && raw.layers.length
    ? raw.layers.map((layer, index) => ({
        id: layer.id || `layer-${index + 1}`,
        name: layer.name || `图层 ${index + 1}`,
        visible: layer.visible !== false,
        locked: Boolean(layer.locked),
        order: Number.isFinite(Number(layer.order)) ? Number(layer.order) : index + 1
      }))
    : defaultLayers;

  const defaultLayerId = normalizedLayers[0].id;

  return {
    canvas: {
      width: Number(raw?.canvas?.width) || 1200,
      height: Number(raw?.canvas?.height) || 780,
      background: raw?.canvas?.background || "#f6f9ff"
    },
    layers: normalizedLayers,
    elements: Array.isArray(raw?.elements)
      ? raw.elements.map((element) => ({
          ...element,
          layerId: element.layerId || defaultLayerId
        }))
      : []
  };
}

export function createElement(type, layerId) {
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
    };
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
    };
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
    };
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
    };
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
  };
}

export function computeDimensionText(element) {
  if (element?.text && String(element.text).trim()) {
    return String(element.text);
  }

  const x1 = Number(element?.x1 || 0);
  const y1 = Number(element?.y1 || 0);
  const x2 = Number(element?.x2 || 0);
  const y2 = Number(element?.y2 || 0);
  const distance = Math.hypot(x2 - x1, y2 - y1);
  return `${distance.toFixed(0)} mm`;
}

function getSnapPointsFromElement(element) {
  if (element.type === "rect") {
    const x = Number(element.x || 0);
    const y = Number(element.y || 0);
    const w = Number(element.width || 0);
    const h = Number(element.height || 0);
    return {
      xs: [x, x + w / 2, x + w],
      ys: [y, y + h / 2, y + h]
    };
  }

  if (element.type === "circle") {
    const x = Number(element.x || 0);
    const y = Number(element.y || 0);
    const r = Number(element.radius || 0);
    return {
      xs: [x - r, x, x + r],
      ys: [y - r, y, y + r]
    };
  }

  if (element.type === "text") {
    return {
      xs: [Number(element.x || 0)],
      ys: [Number(element.y || 0)]
    };
  }

  if (element.type === "line" || element.type === "dimension") {
    const x1 = Number(element.x1 || 0);
    const y1 = Number(element.y1 || 0);
    const x2 = Number(element.x2 || 0);
    const y2 = Number(element.y2 || 0);
    return {
      xs: [x1, (x1 + x2) / 2, x2],
      ys: [y1, (y1 + y2) / 2, y2]
    };
  }

  return { xs: [], ys: [] };
}

function nearestValue(target, values) {
  let nearest = null;
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

function snapAxis(value, candidates) {
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

export function applySnapping(dragElement, nextPos, designData) {
  const allVisible = getRenderableElements(designData);
  const others = allVisible.filter((item) => item.id !== dragElement.id);

  const candidateXs = [];
  const candidateYs = [];

  for (const element of others) {
    const points = getSnapPointsFromElement(element);
    candidateXs.push(...points.xs);
    candidateYs.push(...points.ys);
  }

  if (dragElement.type === "rect" || dragElement.type === "text") {
    return {
      x: snapAxis(nextPos.x, candidateXs),
      y: snapAxis(nextPos.y, candidateYs)
    };
  }

  if (dragElement.type === "circle") {
    return {
      x: snapAxis(nextPos.x, candidateXs),
      y: snapAxis(nextPos.y, candidateYs)
    };
  }

  return nextPos;
}

export function getRenderableElements(designData) {
  const layers = Array.isArray(designData.layers) ? designData.layers : [];
  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));

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

export function isLayerLocked(designData, layerId) {
  const layer = (designData.layers || []).find((item) => item.id === layerId);
  return Boolean(layer?.locked);
}
