# JDeDesign 自动出图交互界面系统

## 🛠 技术栈
- Frontend: React 18 + Vite + Ant Design + Konva
- Backend: Node.js + Express + Prisma + Zod + JWT
- Database: MySQL 8.0

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop 已启动。
2. 在根目录执行：`docker compose up --build`
3. 首次启动会自动完成数据库建表和种子数据初始化，等待容器健康后访问前端。

## 🔗 服务地址 (Services)
- Frontend: http://localhost:3217
- Backend Health: http://localhost:8217/api/health
- Database: localhost:3317 (user: root / pass: root)

## 🧪 测试账号
- Admin: admin / 123456
- Designer: designer / 123456

## 核心能力
- 用户管理：注册、登录、JWT 鉴权、管理员用户列表、修改密码
- 项目管理：新建、编辑、搜索、筛选、删除（UI 确认弹窗）
- 设计编辑器：矩形/圆形/线段/文本拖拽编辑、属性面板实时修改
- 协作编辑：WebSocket 实时同步设计状态、在线协作者显示
- CAD 约束能力：尺寸标注、图层锁定/显隐、网格与对象吸附
- 版本管理：设计保存为新版本、历史版本恢复并生成新版本
- 模板中心：模板列表、模板一键创建项目
- 自动出图：支持 PDF / SVG / DXF / PNG 导出，导出记录入库并可下载

## 容器说明
- `db`: MySQL 数据库，挂载 `db_data` 持久化
- `backend`: Express API 服务，容器内执行 Prisma `db push` 与 `seed`
- `frontend`: Nginx 托管前端静态资源，并代理 `/api` 到后端服务

## 目录结构
```text
.
├── backend
│   ├── prisma
│   └── src
├── frontend
│   └── src
├── docker-compose.yml
└── README.md
```
