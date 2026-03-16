import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Row, Space, Tabs, Typography, message } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { loginSchema, parseWithSchema, registerSchema } from "../utils/validators";

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();
  const [loading, setLoading] = useState(false);

  const redirectPath = location.state?.from || "/projects";

  async function handleLogin(values) {
    try {
      setLoading(true);
      const payload = parseWithSchema(loginSchema, values);
      await login(payload);
      message.success("登录成功，欢迎使用 JDeDesign");
      navigate(redirectPath, { replace: true });
    } catch (error) {
      message.error(error.message || "登录失败，请检查输入");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(values) {
    try {
      setLoading(true);
      const parsed = parseWithSchema(registerSchema, values);
      await register({
        username: parsed.username,
        email: parsed.email,
        password: parsed.password
      });
      message.success("注册成功，已自动登录");
      navigate("/projects", { replace: true });
    } catch (error) {
      message.error(error.message || "注册失败，请检查输入");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section style={{ width: "min(980px, 100%)" }}>
        <Row gutter={[18, 18]}>
          <Col xs={24} lg={12}>
            <Card className="panel-card" style={{ height: "100%" }}>
              <Space direction="vertical" size={16}>
                <Typography.Title level={2} style={{ marginBottom: 0 }}>
                  JDeDesign 自动出图
                </Typography.Title>
                <Typography.Paragraph style={{ color: "#4b5563", marginBottom: 0 }}>
                  统一管理设计项目、图形编辑和自动导出流程。
                  所有设计版本实时入库，支持 SVG / PDF / DXF / PNG 一键导出。
                </Typography.Paragraph>
                <Typography.Text type="secondary">
                  测试账号：admin / 123456
                </Typography.Text>
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card className="panel-card">
              <Tabs
                defaultActiveKey="login"
                items={[
                  {
                    key: "login",
                    label: "登录",
                    children: (
                      <Form layout="vertical" onFinish={handleLogin}>
                        <Form.Item name="account" label="用户名或邮箱" rules={[{ required: true, message: "请输入用户名或邮箱" }]}>
                          <Input prefix={<UserOutlined />} placeholder="请输入用户名或邮箱" />
                        </Form.Item>
                        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                          <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
                        </Form.Item>
                        <Button block type="primary" htmlType="submit" loading={loading}>
                          登录系统
                        </Button>
                      </Form>
                    )
                  },
                  {
                    key: "register",
                    label: "注册",
                    children: (
                      <Form layout="vertical" onFinish={handleRegister}>
                        <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                          <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
                        </Form.Item>
                        <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }]}>
                          <Input prefix={<MailOutlined />} placeholder="请输入邮箱" />
                        </Form.Item>
                        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                          <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
                        </Form.Item>
                        <Form.Item
                          name="confirmPassword"
                          label="确认密码"
                          dependencies={["password"]}
                          rules={[
                            { required: true, message: "请再次输入密码" },
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (!value || getFieldValue("password") === value) {
                                  return Promise.resolve();
                                }
                                return Promise.reject(new Error("两次输入密码不一致"));
                              }
                            })
                          ]}
                        >
                          <Input.Password prefix={<LockOutlined />} placeholder="请再次输入密码" />
                        </Form.Item>
                        <Button block type="primary" htmlType="submit" loading={loading}>
                          注册并进入系统
                        </Button>
                      </Form>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        </Row>
      </section>
    </main>
  );
}

export default AuthPage;
