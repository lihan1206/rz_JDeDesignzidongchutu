import {
  AppstoreOutlined,
  FileImageOutlined,
  LogoutOutlined,
  ProjectOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { Avatar, Button, Layout, Menu, Space, Typography } from "antd";
import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { UserRole } from "../types";

const { Header, Content, Sider, Footer } = Layout;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = useMemo(() => {
    const items = [
      {
        key: "/projects",
        label: "设计项目",
        icon: <ProjectOutlined />
      },
      {
        key: "/templates",
        label: "模板中心",
        icon: <AppstoreOutlined />
      }
    ];

    if (user?.role === "ADMIN") {
      items.push({
        key: "/users",
        label: "用户管理",
        icon: <TeamOutlined />
      });
    }

    return items;
  }, [user?.role]);

  const roleLabelMap: Record<UserRole, string> = {
    ADMIN: "管理员",
    DESIGNER: "设计师",
    USER: "普通用户"
  };

  const selectedKey = useMemo(() => {
    const matched = menuItems.find((item) =>
      location.pathname.startsWith(item.key)
    );
    return matched ? matched.key : "/projects";
  }, [location.pathname, menuItems]);

  return (
    <Layout className="page-shell">
      <Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(36, 91, 219, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Space size={12}>
          <FileImageOutlined style={{ fontSize: 24, color: "#245bdb" }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            JDeDesign 自动出图系统
          </Typography.Title>
        </Space>
        <Space size={16}>
          <Avatar style={{ backgroundColor: "#245bdb" }}>
            {(user?.username || "U").slice(0, 1).toUpperCase()}
          </Avatar>
          <Typography.Text>
            {user?.username}（{roleLabelMap[user?.role] || "普通用户"}）
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout}>
            退出登录
          </Button>
        </Space>
      </Header>

      <Layout hasSider>
        <Sider
          width={220}
          breakpoint="lg"
          collapsedWidth="0"
          style={{
            background: "transparent",
            borderRight: "1px solid rgba(36,91,219,0.08)"
          }}
        >
          <Menu
            style={{
              margin: 16,
              borderRadius: 14,
              border: "1px solid rgba(36,91,219,0.08)",
              background: "rgba(255,255,255,0.7)"
            }}
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>

        <Content style={{ padding: "18px 20px 8px" }}>
          <main>
            <Outlet />
          </main>
        </Content>
      </Layout>

      <Footer
        style={{
          textAlign: "center",
          background: "transparent",
          color: "#4b5563"
        }}
      >
        JDeDesign 自动出图系统 · 全流程真实数据驱动
      </Footer>
    </Layout>
  );
}

export default AppLayout;
