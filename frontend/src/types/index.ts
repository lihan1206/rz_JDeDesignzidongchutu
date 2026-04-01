export type UserRole = "USER" | "DESIGNER" | "ADMIN";

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  description: string;
  tags: string[];
  status: "DRAFT" | "COMPLETED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  user?: User;
  versions?: DesignVersion[];
  realtime?: RealtimeState;
  _count?: {
    versions: number;
    exports: number;
  };
}

export interface DesignVersion {
  id: number;
  projectId: number;
  version: number;
  data: DesignData;
  createdAt: string;
}

export interface ExportRecord {
  id: number;
  projectId: number;
  format: "PDF" | "SVG" | "DXF" | "PNG";
  filePath: string;
  exportedAt: string;
  downloadUrl?: string;
}

export interface Template {
  id: number;
  name: string;
  description: string;
  category: string;
  baseData: DesignData;
  createdAt: string;
}

export interface RealtimeState {
  id: number;
  projectId: number;
  data: DesignData;
  updatedAt: string;
}

export interface DesignData {
  canvas: CanvasConfig;
  layers: Layer[];
  elements: DesignElement[];
}

export interface CanvasConfig {
  width: number;
  height: number;
  background: string;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

export interface BaseElement {
  id: string;
  type: string;
  layerId: string;
  name?: string;
}

export interface RectElement extends BaseElement {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  rotation: number;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  x: number;
  y: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineElement extends BaseElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface DimensionElement extends BaseElement {
  type: "dimension";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
}

export type DesignElement =
  | RectElement
  | CircleElement
  | LineElement
  | DimensionElement
  | TextElement;

export type ElementType = "rect" | "circle" | "line" | "dimension" | "text";

export interface Collaborator {
  userId: number;
  username: string;
}
