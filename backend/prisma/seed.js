import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const defaultLayers = [
  { id: "layer-main", name: "主图层", visible: true, locked: false, order: 1 },
  { id: "layer-note", name: "标注层", visible: true, locked: false, order: 2 }
];

const defaultDesign = {
  canvas: {
    width: 1200,
    height: 780,
    background: "#f6f9ff"
  },
  layers: defaultLayers,
  elements: [
    {
      id: "seed-rect-1",
      type: "rect",
      layerId: "layer-main",
      x: 120,
      y: 90,
      width: 360,
      height: 220,
      fill: "#e9f2ff",
      stroke: "#245bdb",
      strokeWidth: 2,
      rotation: 0,
      name: "主结构框"
    },
    {
      id: "seed-circle-1",
      type: "circle",
      layerId: "layer-main",
      x: 760,
      y: 200,
      radius: 90,
      fill: "#fff1f0",
      stroke: "#cf1322",
      strokeWidth: 2,
      name: "核心圆"
    },
    {
      id: "seed-line-1",
      type: "line",
      layerId: "layer-main",
      x1: 210,
      y1: 400,
      x2: 880,
      y2: 540,
      stroke: "#1f1f1f",
      strokeWidth: 3,
      name: "连接线"
    },
    {
      id: "seed-dim-1",
      type: "dimension",
      layerId: "layer-note",
      x1: 120,
      y1: 330,
      x2: 480,
      y2: 330,
      text: "360 mm",
      stroke: "#fa8c16",
      strokeWidth: 1,
      fontSize: 16,
      name: "宽度标注"
    },
    {
      id: "seed-text-1",
      type: "text",
      layerId: "layer-note",
      x: 130,
      y: 40,
      text: "JDeDesign 自动出图示例",
      fontSize: 32,
      fill: "#111827",
      name: "标题"
    }
  ]
};

const templateData = [
  {
    name: "建筑立面基础模板",
    description: "适合快速搭建建筑立面图的标准结构",
    category: "建筑",
    baseData: {
      canvas: { width: 1200, height: 780, background: "#f7fbff" },
      layers: defaultLayers,
      elements: [
        {
          id: "tpl-building-rect-1",
          type: "rect",
          layerId: "layer-main",
          x: 150,
          y: 120,
          width: 800,
          height: 480,
          fill: "#f0f5ff",
          stroke: "#1d39c4",
          strokeWidth: 2,
          rotation: 0,
          name: "主体结构"
        },
        {
          id: "tpl-building-line-1",
          type: "line",
          layerId: "layer-main",
          x1: 150,
          y1: 300,
          x2: 950,
          y2: 300,
          stroke: "#1d39c4",
          strokeWidth: 2,
          name: "层间线"
        },
        {
          id: "tpl-building-dim-1",
          type: "dimension",
          layerId: "layer-note",
          x1: 150,
          y1: 620,
          x2: 950,
          y2: 620,
          text: "800 mm",
          stroke: "#fa8c16",
          strokeWidth: 1,
          fontSize: 16,
          name: "宽度标注"
        },
        {
          id: "tpl-building-text-1",
          type: "text",
          layerId: "layer-note",
          x: 170,
          y: 80,
          text: "建筑立面模板",
          fontSize: 28,
          fill: "#1f2937",
          name: "标题"
        }
      ]
    }
  },
  {
    name: "机械零件草图模板",
    description: "用于机械零件结构草图与孔位标注",
    category: "工业",
    baseData: {
      canvas: { width: 1200, height: 780, background: "#fcfcfd" },
      layers: defaultLayers,
      elements: [
        {
          id: "tpl-mech-rect-1",
          type: "rect",
          layerId: "layer-main",
          x: 220,
          y: 220,
          width: 620,
          height: 280,
          fill: "#f5f5f5",
          stroke: "#262626",
          strokeWidth: 2,
          rotation: 0,
          name: "零件轮廓"
        },
        {
          id: "tpl-mech-circle-1",
          type: "circle",
          layerId: "layer-main",
          x: 380,
          y: 360,
          radius: 46,
          fill: "#ffffff",
          stroke: "#262626",
          strokeWidth: 2,
          name: "孔位 A"
        },
        {
          id: "tpl-mech-circle-2",
          type: "circle",
          layerId: "layer-main",
          x: 680,
          y: 360,
          radius: 46,
          fill: "#ffffff",
          stroke: "#262626",
          strokeWidth: 2,
          name: "孔位 B"
        },
        {
          id: "tpl-mech-dim-1",
          type: "dimension",
          layerId: "layer-note",
          x1: 380,
          y1: 500,
          x2: 680,
          y2: 500,
          text: "中心距 300 mm",
          stroke: "#fa8c16",
          strokeWidth: 1,
          fontSize: 16,
          name: "孔距标注"
        }
      ]
    }
  }
];

async function runSeed() {
  const adminPassword = await bcrypt.hash("123456", 10);
  const designerPassword = await bcrypt.hash("123456", 10);

  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      email: "admin@jdedesign.local",
      passwordHash: adminPassword,
      role: UserRole.ADMIN
    },
    create: {
      username: "admin",
      email: "admin@jdedesign.local",
      passwordHash: adminPassword,
      role: UserRole.ADMIN
    }
  });

  await prisma.user.upsert({
    where: { username: "designer" },
    update: {
      email: "designer@jdedesign.local",
      passwordHash: designerPassword,
      role: UserRole.DESIGNER
    },
    create: {
      username: "designer",
      email: "designer@jdedesign.local",
      passwordHash: designerPassword,
      role: UserRole.DESIGNER
    }
  });

  for (const item of templateData) {
    await prisma.template.upsert({
      where: { name: item.name },
      update: {
        description: item.description,
        category: item.category,
        baseData: item.baseData
      },
      create: item
    });
  }

  const exists = await prisma.project.findFirst({
    where: { userId: adminUser.id }
  });

  if (!exists) {
    const project = await prisma.project.create({
      data: {
        userId: adminUser.id,
        name: "示例项目：总平面布置图",
        description: "系统初始化示例，可直接进入编辑器体验",
        status: "DRAFT",
        tags: ["示例", "建筑"]
      }
    });

    await prisma.designVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        data: defaultDesign
      }
    });

    await prisma.realtimeState.upsert({
      where: { projectId: project.id },
      update: { data: defaultDesign },
      create: { projectId: project.id, data: defaultDesign }
    });
  }
}

runSeed()
  .catch(async (error) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
