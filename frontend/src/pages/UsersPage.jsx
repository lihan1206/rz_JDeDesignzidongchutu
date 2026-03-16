import { LockOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGetUsers, apiUpdatePassword } from "../api/services";
import { useAuth } from "../contexts/AuthContext";

function UsersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      message.warning("只有管理员可以访问用户管理页面");
      navigate("/projects", { replace: true });
      return;
    }

    fetchUsers();
  }, [user?.role]);

  async function fetchUsers() {
    try {
      setLoading(true);
      const data = await apiGetUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword() {
    try {
      const values = await form.validateFields();
      setSavingPassword(true);
      await apiUpdatePassword(values);
      message.success("密码修改成功");
      setPasswordModalOpen(false);
      form.resetFields();
    } finally {
      setSavingPassword(false);
    }
  }

  if (user?.role !== "ADMIN") {
    return null;
  }

  const columns = [
    {
      title: "用户名",
      dataIndex: "username"
    },
    {
      title: "邮箱",
      dataIndex: "email"
    },
    {
      title: "角色",
      dataIndex: "role",
      render: (value) => (
        <Tag color={value === "ADMIN" ? "gold" : value === "DESIGNER" ? "blue" : "default"}>
          {value === "ADMIN" ? "管理员" : value === "DESIGNER" ? "设计师" : "普通用户"}
        </Tag>
      )
    },
    {
      title: "项目数",
      render: (_, record) => record?._count?.projects || 0
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      render: (value) => dayjs(value).format("YYYY-MM-DD HH:mm")
    }
  ];

  return (
    <section>
      <Card className="panel-card" style={{ marginBottom: 16 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space direction="vertical" size={0}>
            <Typography.Title level={4} style={{ marginBottom: 0 }}>
              用户管理
            </Typography.Title>
            <Typography.Text type="secondary">管理员可查看系统全部用户及账号角色信息</Typography.Text>
          </Space>
          <Button icon={<LockOutlined />} onClick={() => setPasswordModalOpen(true)}>
            修改我的密码
          </Button>
        </Space>
      </Card>

      <Card className="panel-card">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : users.length ? (
          <Table rowKey="id" dataSource={users} columns={columns} pagination={{ pageSize: 8 }} />
        ) : (
          <Empty description="暂无用户数据" />
        )}
      </Card>

      <Modal
        title="修改密码"
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onOk={handleUpdatePassword}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={savingPassword}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: "请输入原密码" }]}>
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: "请输入新密码" }, { min: 6, message: "新密码至少 6 位" }]}>
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

export default UsersPage;
