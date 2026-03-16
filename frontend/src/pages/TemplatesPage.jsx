import { AppstoreAddOutlined } from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Skeleton, Space, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiApplyTemplate, apiGetTemplates } from "../api/services";

function TemplatesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState([]);

  async function fetchTemplates() {
    try {
      setLoading(true);
      const data = await apiGetTemplates();
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function handleApply(template) {
    const project = await apiApplyTemplate(template.id);
    message.success(`模板「${template.name}」已应用`);
    navigate(`/projects/${project.id}/editor`);
  }

  return (
    <section>
      <Card className="panel-card" style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginBottom: 2 }}>
          模板中心
        </Typography.Title>
        <Typography.Text type="secondary">使用模板快速创建新项目，减少重复绘制工作</Typography.Text>
      </Card>

      {loading ? (
        <Card className="panel-card">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : templates.length === 0 ? (
        <Card className="panel-card">
          <Empty description="暂无模板数据" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {templates.map((template) => (
            <Col xs={24} md={12} xl={8} key={template.id}>
              <Card className="panel-card" hoverable>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Space>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {template.name}
                    </Typography.Title>
                    <Tag color="blue">{template.category}</Tag>
                  </Space>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                    {template.description}
                  </Typography.Paragraph>
                  <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => handleApply(template)}>
                    应用模板并创建项目
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </section>
  );
}

export default TemplatesPage;
