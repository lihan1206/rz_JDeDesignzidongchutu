import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiCreateProject,
  apiDeleteProject,
  apiGetProjects,
  apiUpdateProject
} from "../api/services";
import { parseWithSchema, projectSchema } from "../utils/validators";

const projectStatusOptions = [
  { label: "草稿", value: "DRAFT" },
  { label: "已完成", value: "COMPLETED" },
  { label: "已归档", value: "ARCHIVED" }
];

const statusColorMap = {
  DRAFT: "blue",
  COMPLETED: "green",
  ARCHIVED: "default"
};

function ProjectsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  async function fetchProjects() {
    try {
      setLoading(true);
      const data = await apiGetProjects({ keyword, status });
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const columns = useMemo(
    () => [
      {
        title: "项目名称",
        dataIndex: "name",
        key: "name",
        render: (_, record) => (
          <Space direction="vertical" size={4}>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Typography.Text type="secondary">{record.description || "暂无描述"}</Typography.Text>
          </Space>
        )
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 120,
        render: (value) => (
          <Tag color={statusColorMap[value]}>
            {projectStatusOptions.find((item) => item.value === value)?.label || value}
          </Tag>
        )
      },
      {
        title: "标签",
        dataIndex: "tags",
        render: (tags) => (
          <Space wrap>
            {(tags || []).length ? (tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>) : <Typography.Text type="secondary">无</Typography.Text>}
          </Space>
        )
      },
      {
        title: "版本数",
        width: 100,
        render: (_, record) => record?._count?.versions || 0
      },
      {
        title: "更新时间",
        dataIndex: "updatedAt",
        width: 190,
        render: (value) => dayjs(value).format("YYYY-MM-DD HH:mm")
      },
      {
        title: "操作",
        key: "actions",
        width: 220,
        render: (_, record) => (
          <Space wrap>
            <Button icon={<EyeOutlined />} type="link" onClick={() => navigate(`/projects/${record.id}/editor`)}>
              进入编辑器
            </Button>
            <Button icon={<EditOutlined />} type="link" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button danger icon={<DeleteOutlined />} type="link" onClick={() => confirmDelete(record)}>
              删除
            </Button>
          </Space>
        )
      }
    ],
    [navigate]
  );

  function openCreateModal() {
    setEditingProject(null);
    form.resetFields();
    form.setFieldsValue({ status: "DRAFT", tagsInput: "" });
    setModalOpen(true);
  }

  function openEditModal(project) {
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      description: project.description,
      status: project.status,
      tagsInput: (project.tags || []).join("，")
    });
    setModalOpen(true);
  }

  function confirmDelete(project) {
    Modal.confirm({
      title: "删除项目确认",
      content: `删除后将同时移除项目的全部版本与导出记录，确认删除「${project.name}」吗？`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        await apiDeleteProject(project.id);
        message.success("项目已删除");
        await fetchProjects();
      }
    });
  }

  async function handleSubmit() {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      const tags = String(values.tagsInput || "")
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = parseWithSchema(projectSchema, {
        name: values.name,
        description: values.description || "",
        tags
      });

      if (editingProject) {
        await apiUpdateProject(editingProject.id, {
          ...payload,
          status: values.status
        });
        message.success("项目更新成功");
      } else {
        await apiCreateProject({
          ...payload,
          status: values.status
        });
        message.success("项目创建成功");
      }

      setModalOpen(false);
      await fetchProjects();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      message.error(error.message || "提交失败，请稍后重试");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <section>
      <Card className="panel-card" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} lg={10}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              设计项目管理
            </Typography.Title>
            <Typography.Text type="secondary">支持搜索、筛选、编辑、版本追踪与删除确认</Typography.Text>
          </Col>
          <Col xs={24} lg={14}>
            <Row gutter={[10, 10]} justify="end">
              <Col xs={24} md={10}>
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="输入项目名称或描述"
                  prefix={<SearchOutlined />}
                  allowClear
                />
              </Col>
              <Col xs={24} md={7}>
                <Select
                  style={{ width: "100%" }}
                  placeholder="状态筛选"
                  allowClear
                  value={status || undefined}
                  options={projectStatusOptions}
                  onChange={(value) => setStatus(value || "")}
                />
              </Col>
              <Col xs={24} md={7}>
                <Space>
                  <Button onClick={fetchProjects}>查询</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    新建项目
                  </Button>
                </Space>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card className="panel-card">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table rowKey="id" columns={columns} dataSource={projects} pagination={{ pageSize: 8 }} scroll={{ x: 1100 }} />
        )}
      </Card>

      <Modal
        title={editingProject ? "编辑项目" : "新建项目"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText={editingProject ? "保存修改" : "创建项目"}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" initialValues={{ status: "DRAFT", tagsInput: "" }}>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }]}>
            <Input placeholder="请输入项目名称" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={4} placeholder="请输入项目描述" maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="status" label="项目状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={projectStatusOptions} />
          </Form.Item>
          <Form.Item name="tagsInput" label="标签（用中文逗号分隔）">
            <Input placeholder="例如：建筑，立面图，初稿" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

export default ProjectsPage;
