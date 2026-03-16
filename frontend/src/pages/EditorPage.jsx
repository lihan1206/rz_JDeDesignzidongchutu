import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HistoryOutlined,
  LockOutlined,
  PlusCircleOutlined,
  SaveOutlined,
  TeamOutlined,
  UnlockOutlined
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { io } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import {
  apiExportProject,
  apiGetExportRecords,
  apiGetProject,
  apiGetVersions,
  apiRestoreVersion,
  apiSaveVersion,
  buildDownloadUrl
} from "../api/services";
import {
  applySnapping,
  computeDimensionText,
  createElement,
  defaultDesignData,
  getRenderableElements,
  isLayerLocked,
  normalizeDesignData
} from "../utils/cad";

function EditorPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const id = Number(projectId);

  const socketRef = useRef(null);
  const syncTimerRef = useRef(null);
  const suppressSyncRef = useRef(false);

  const [project, setProject] = useState(null);
  const [designData, setDesignData] = useState(defaultDesignData);
  const [selectedId, setSelectedId] = useState(null);
  const [activeLayerId, setActiveLayerId] = useState(defaultDesignData.layers[0].id);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState([]);
  const [exportRecords, setExportRecords] = useState([]);
  const [exportingFormat, setExportingFormat] = useState("");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [collaborators, setCollaborators] = useState([]);
  const [syncStatus, setSyncStatus] = useState("未连接");

  const selectedElement = useMemo(
    () => designData.elements.find((item) => item.id === selectedId) || null,
    [designData.elements, selectedId]
  );

  const selectedLayerLocked = useMemo(
    () => (selectedElement ? isLayerLocked(designData, selectedElement.layerId) : false),
    [designData, selectedElement]
  );

  const renderableElements = useMemo(() => getRenderableElements(designData), [designData]);

  async function fetchAll() {
    if (Number.isNaN(id)) {
      message.error("项目 ID 无效");
      navigate("/projects", { replace: true });
      return;
    }

    try {
      setLoading(true);
      const [projectData, versionData, exportsData] = await Promise.all([
        apiGetProject(id),
        apiGetVersions(id),
        apiGetExportRecords(id)
      ]);
      setProject(projectData);
      setVersions(versionData);
      setExportRecords(exportsData);

      const raw = projectData?.realtime?.data || versionData?.[0]?.data;
      const normalized = normalizeDesignData(raw);

      setDesignData(normalized);
      setActiveLayerId(normalized.layers[0]?.id || "layer-main");
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, [id]);

  function queueSocketSync(nextDesignData) {
    if (!socketRef.current?.connected || suppressSyncRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      socketRef.current.emit("project:sync", {
        projectId: id,
        designData: nextDesignData
      });
    }, 180);
  }

  function updateDesign(updater, options = { broadcast: true }) {
    setDesignData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (options.broadcast) {
        queueSocketSync(next);
      }
      return next;
    });
  }

  function applyRemoteDesign(rawData) {
    suppressSyncRef.current = true;
    const normalized = normalizeDesignData(rawData);
    setDesignData(normalized);
    setActiveLayerId((prev) => prev || normalized.layers[0]?.id || "layer-main");
    setTimeout(() => {
      suppressSyncRef.current = false;
    }, 0);
  }

  useEffect(() => {
    if (Number.isNaN(id)) {
      return;
    }

    const token = window.localStorage.getItem("jde_token");
    if (!token) {
      return;
    }

    const socket = io("/", {
      auth: { token },
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSyncStatus("已连接");
      socket.emit("project:join", { projectId: id }, (ack) => {
        if (!ack?.success) {
          message.error(ack?.message || "加入协作房间失败");
        }
      });
    });

    socket.on("disconnect", () => {
      setSyncStatus("连接断开");
      setCollaborators([]);
    });

    socket.on("project:init", (payload) => {
      if (payload?.designData) {
        applyRemoteDesign(payload.designData);
      }
      setCollaborators(payload?.collaborators || []);
    });

    socket.on("project:sync", (payload) => {
      if (payload?.projectId !== id) {
        return;
      }

      if (payload?.designData) {
        applyRemoteDesign(payload.designData);
      }

      if (payload?.editor?.username) {
        message.info(`协作更新：${payload.editor.username} 已同步最新修改`);
      }
    });

    socket.on("project:collaborators", (payload) => {
      if (payload?.projectId !== id) {
        return;
      }
      setCollaborators(payload?.collaborators || []);
    });

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
      setSyncStatus("未连接");
    };
  }, [id]);

  function ensureElementEditable(element) {
    if (!element) {
      return false;
    }

    if (isLayerLocked(designData, element.layerId)) {
      message.warning("当前图形所在图层已锁定，无法编辑");
      return false;
    }

    return true;
  }

  function updateElement(elementId, updater) {
    const target = designData.elements.find((item) => item.id === elementId);
    if (!ensureElementEditable(target)) {
      return;
    }

    updateDesign((prev) => ({
      ...prev,
      elements: prev.elements.map((element) => {
        if (element.id !== elementId) {
          return element;
        }
        return typeof updater === "function" ? updater(element) : { ...element, ...updater };
      })
    }));
  }

  function addElement(type) {
    const layer = designData.layers.find((item) => item.id === activeLayerId) || designData.layers[0];
    if (!layer) {
      message.error("请先创建图层");
      return;
    }

    if (layer.locked) {
      message.warning("当前图层已锁定，请先解锁后再新增图形");
      return;
    }

    const element = createElement(type, layer.id);
    updateDesign((prev) => ({
      ...prev,
      elements: [...prev.elements, element]
    }));
    setSelectedId(element.id);

    const labelMap = {
      rect: "矩形",
      circle: "圆形",
      line: "线段",
      text: "文本",
      dimension: "尺寸标注"
    };
    message.success(`已新增${labelMap[type] || "图形"}`);
  }

  function addLayer() {
    const layerId = `layer-${Date.now()}`;
    const nextOrder = (designData.layers || []).reduce((max, layer) => Math.max(max, layer.order || 0), 0) + 1;

    updateDesign((prev) => ({
      ...prev,
      layers: [
        ...prev.layers,
        {
          id: layerId,
          name: `图层 ${prev.layers.length + 1}`,
          visible: true,
          locked: false,
          order: nextOrder
        }
      ]
    }));

    setActiveLayerId(layerId);
    message.success("新图层已创建");
  }

  function toggleLayerVisibility(layerId) {
    updateDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              visible: !layer.visible
            }
          : layer
      )
    }));
  }

  function toggleLayerLock(layerId) {
    updateDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              locked: !layer.locked
            }
          : layer
      )
    }));
  }

  function updateLayerName(layerId, name) {
    updateDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              name: name || layer.name
            }
          : layer
      )
    }));
  }

  function confirmDeleteElement(element) {
    if (!ensureElementEditable(element)) {
      return;
    }

    Modal.confirm({
      title: "删除图形确认",
      content: `确认删除图形「${element.name || element.type}」吗？`,
      okText: "确认删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        updateDesign((prev) => ({
          ...prev,
          elements: prev.elements.filter((item) => item.id !== element.id)
        }));
        if (selectedId === element.id) {
          setSelectedId(null);
        }
        message.success("图形已删除");
      }
    });
  }

  async function handleSaveVersion() {
    try {
      setSaving(true);
      await apiSaveVersion(id, { data: designData });
      message.success("版本保存成功");
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(version) {
    await apiRestoreVersion(id, version.id);
    message.success(`已恢复到 V${version.version}，并生成新版本`);
    await fetchAll();
  }

  async function handleExport(format) {
    try {
      setExportingFormat(format);
      const record = await apiExportProject(id, format);
      message.success(`${format} 导出成功`);
      setExportRecords((prev) => [record, ...prev]);
    } finally {
      setExportingFormat("");
    }
  }

  function renderPropertyFields() {
    if (!selectedElement) {
      return <Typography.Text type="secondary">请先在画布中选择一个图形。</Typography.Text>;
    }

    const disabled = selectedLayerLocked;

    return (
      <Form layout="vertical" size="small">
        <Form.Item label="所属图层">
          <Select
            value={selectedElement.layerId}
            disabled={disabled}
            options={designData.layers.map((layer) => ({ label: layer.name, value: layer.id }))}
            onChange={(value) => updateElement(selectedElement.id, { layerId: value })}
          />
        </Form.Item>
        <Form.Item label="显示名称">
          <Input
            disabled={disabled}
            value={selectedElement.name || ""}
            onChange={(e) => updateElement(selectedElement.id, { name: e.target.value })}
          />
        </Form.Item>

        {selectedElement.type === "rect" && (
          <>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="X">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.x} onChange={(value) => updateElement(selectedElement.id, { x: value ?? 0 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Y">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.y} onChange={(value) => updateElement(selectedElement.id, { y: value ?? 0 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="宽度">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} min={1} value={selectedElement.width} onChange={(value) => updateElement(selectedElement.id, { width: value ?? 1 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="高度">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} min={1} value={selectedElement.height} onChange={(value) => updateElement(selectedElement.id, { height: value ?? 1 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="填充色">
                  <Input disabled={disabled} value={selectedElement.fill} onChange={(e) => updateElement(selectedElement.id, { fill: e.target.value })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="描边色">
                  <Input disabled={disabled} value={selectedElement.stroke} onChange={(e) => updateElement(selectedElement.id, { stroke: e.target.value })} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {selectedElement.type === "circle" && (
          <>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="中心 X">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.x} onChange={(value) => updateElement(selectedElement.id, { x: value ?? 0 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="中心 Y">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.y} onChange={(value) => updateElement(selectedElement.id, { y: value ?? 0 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="半径">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} min={1} value={selectedElement.radius} onChange={(value) => updateElement(selectedElement.id, { radius: value ?? 1 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="线宽">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} min={1} value={selectedElement.strokeWidth || 2} onChange={(value) => updateElement(selectedElement.id, { strokeWidth: value ?? 1 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="填充色">
                  <Input disabled={disabled} value={selectedElement.fill} onChange={(e) => updateElement(selectedElement.id, { fill: e.target.value })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="描边色">
                  <Input disabled={disabled} value={selectedElement.stroke} onChange={(e) => updateElement(selectedElement.id, { stroke: e.target.value })} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {(selectedElement.type === "line" || selectedElement.type === "dimension") && (
          <>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="起点 X">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.x1} onChange={(value) => updateElement(selectedElement.id, { x1: value ?? 0 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="起点 Y">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.y1} onChange={(value) => updateElement(selectedElement.id, { y1: value ?? 0 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="终点 X">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.x2} onChange={(value) => updateElement(selectedElement.id, { x2: value ?? 0 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="终点 Y">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.y2} onChange={(value) => updateElement(selectedElement.id, { y2: value ?? 0 })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="线条颜色">
                  <Input disabled={disabled} value={selectedElement.stroke} onChange={(e) => updateElement(selectedElement.id, { stroke: e.target.value })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="线宽">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} min={1} value={selectedElement.strokeWidth || 1} onChange={(value) => updateElement(selectedElement.id, { strokeWidth: value ?? 1 })} />
                </Form.Item>
              </Col>
            </Row>
            {selectedElement.type === "dimension" && (
              <Form.Item label="标注文本（留空自动计算）">
                <Input disabled={disabled} value={selectedElement.text || ""} onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })} />
              </Form.Item>
            )}
          </>
        )}

        {selectedElement.type === "text" && (
          <>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item label="X">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.x} onChange={(value) => updateElement(selectedElement.id, { x: value ?? 0 })} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Y">
                  <InputNumber disabled={disabled} style={{ width: "100%" }} value={selectedElement.y} onChange={(value) => updateElement(selectedElement.id, { y: value ?? 0 })} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="文本内容">
              <Input.TextArea disabled={disabled} rows={3} value={selectedElement.text} onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })} />
            </Form.Item>
          </>
        )}

        <Button disabled={disabled} danger icon={<DeleteOutlined />} onClick={() => confirmDeleteElement(selectedElement)}>
          删除当前图形
        </Button>
      </Form>
    );
  }

  function renderGridLines() {
    const lines = [];

    for (let x = 0; x <= designData.canvas.width; x += 50) {
      lines.push(
        <Line key={`grid-x-${x}`} points={[x, 0, x, designData.canvas.height]} stroke="#f0f3f9" strokeWidth={1} />
      );
    }

    for (let y = 0; y <= designData.canvas.height; y += 50) {
      lines.push(
        <Line key={`grid-y-${y}`} points={[0, y, designData.canvas.width, y]} stroke="#f0f3f9" strokeWidth={1} />
      );
    }

    return lines;
  }

  function renderCanvasElements() {
    return renderableElements.map((element) => {
      const isSelected = selectedId === element.id;
      const locked = isLayerLocked(designData, element.layerId);

      if (element.type === "rect") {
        return (
          <Rect
            key={element.id}
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            fill={element.fill}
            stroke={isSelected ? "#fa8c16" : element.stroke}
            strokeWidth={isSelected ? (element.strokeWidth || 2) + 1 : element.strokeWidth || 2}
            rotation={element.rotation || 0}
            draggable={!locked}
            onClick={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onTap={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onDragEnd={(evt) => {
              const nextPos = {
                x: Math.round(evt.target.x()),
                y: Math.round(evt.target.y())
              };
              const snapped = snapEnabled ? applySnapping(element, nextPos, designData) : nextPos;
              updateElement(element.id, {
                x: snapped.x,
                y: snapped.y
              });
            }}
          />
        );
      }

      if (element.type === "circle") {
        return (
          <Circle
            key={element.id}
            x={element.x}
            y={element.y}
            radius={element.radius}
            fill={element.fill}
            stroke={isSelected ? "#fa8c16" : element.stroke}
            strokeWidth={isSelected ? (element.strokeWidth || 2) + 1 : element.strokeWidth || 2}
            draggable={!locked}
            onClick={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onTap={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onDragEnd={(evt) => {
              const nextPos = {
                x: Math.round(evt.target.x()),
                y: Math.round(evt.target.y())
              };
              const snapped = snapEnabled ? applySnapping(element, nextPos, designData) : nextPos;
              updateElement(element.id, {
                x: snapped.x,
                y: snapped.y
              });
            }}
          />
        );
      }

      if (element.type === "line") {
        return (
          <Line
            key={element.id}
            points={[element.x1, element.y1, element.x2, element.y2]}
            stroke={isSelected ? "#fa8c16" : element.stroke}
            strokeWidth={isSelected ? (element.strokeWidth || 2) + 1 : element.strokeWidth || 2}
            onClick={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onTap={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
          />
        );
      }

      if (element.type === "dimension") {
        return (
          <Group
            key={element.id}
            draggable={!locked}
            onClick={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onTap={() => {
              setSelectedId(element.id);
              setActiveLayerId(element.layerId);
            }}
            onDragEnd={(evt) => {
              const dx = Math.round(evt.target.x());
              const dy = Math.round(evt.target.y());
              evt.target.position({ x: 0, y: 0 });
              updateElement(element.id, {
                x1: (element.x1 || 0) + dx,
                y1: (element.y1 || 0) + dy,
                x2: (element.x2 || 0) + dx,
                y2: (element.y2 || 0) + dy
              });
            }}
          >
            <Line
              points={[element.x1, element.y1, element.x2, element.y2]}
              stroke={isSelected ? "#fa8c16" : element.stroke || "#fa8c16"}
              strokeWidth={isSelected ? (element.strokeWidth || 1) + 1 : element.strokeWidth || 1}
            />
            <Text
              x={(element.x1 + element.x2) / 2 - 30}
              y={(element.y1 + element.y2) / 2 - 20}
              text={computeDimensionText(element)}
              fill={element.stroke || "#fa8c16"}
              fontSize={element.fontSize || 16}
            />
          </Group>
        );
      }

      return (
        <Text
          key={element.id}
          x={element.x}
          y={element.y}
          text={element.text}
          fontSize={element.fontSize}
          fill={isSelected ? "#fa8c16" : element.fill}
          draggable={!locked}
          onClick={() => {
            setSelectedId(element.id);
            setActiveLayerId(element.layerId);
          }}
          onTap={() => {
            setSelectedId(element.id);
            setActiveLayerId(element.layerId);
          }}
          onDragEnd={(evt) => {
            const nextPos = {
              x: Math.round(evt.target.x()),
              y: Math.round(evt.target.y())
            };
            const snapped = snapEnabled ? applySnapping(element, nextPos, designData) : nextPos;
            updateElement(element.id, {
              x: snapped.x,
              y: snapped.y
            });
          }}
        />
      );
    });
  }

  if (loading) {
    return (
      <Card className="panel-card">
        <Skeleton active paragraph={{ rows: 10 }} />
      </Card>
    );
  }

  if (!project) {
    return (
      <Card className="panel-card">
        <Empty description="项目不存在或已被删除" />
      </Card>
    );
  }

  return (
    <section>
      <Card className="panel-card" style={{ marginBottom: 16 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space direction="vertical" size={0}>
            <Typography.Title level={4} style={{ marginBottom: 0 }}>
              {project.name}
            </Typography.Title>
            <Typography.Text type="secondary">{project.description || "暂无描述"}</Typography.Text>
          </Space>
          <Space wrap>
            <Tag color={syncStatus === "已连接" ? "green" : "orange"}>协作状态：{syncStatus}</Tag>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/projects")}>返回项目列表</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveVersion}>
              保存新版本
            </Button>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card
            className="panel-card"
            title="设计画布"
            extra={<Tag color="blue">画布尺寸：{designData.canvas.width} x {designData.canvas.height}</Tag>}
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Button icon={<PlusCircleOutlined />} onClick={() => addElement("rect")}>新增矩形</Button>
              <Button icon={<PlusCircleOutlined />} onClick={() => addElement("circle")}>新增圆形</Button>
              <Button icon={<PlusCircleOutlined />} onClick={() => addElement("line")}>新增线段</Button>
              <Button icon={<PlusCircleOutlined />} onClick={() => addElement("dimension")}>新增尺寸标注</Button>
              <Button icon={<PlusCircleOutlined />} onClick={() => addElement("text")}>新增文本</Button>
              <Space>
                <Typography.Text>吸附</Typography.Text>
                <Switch checked={snapEnabled} onChange={setSnapEnabled} checkedChildren="开" unCheckedChildren="关" />
              </Space>
            </Space>

            <div className="konva-container">
              <Stage
                width={designData.canvas.width}
                height={designData.canvas.height}
                onMouseDown={(evt) => {
                  if (evt.target === evt.target.getStage()) {
                    setSelectedId(null);
                  }
                }}
              >
                <Layer>
                  <Rect x={0} y={0} width={designData.canvas.width} height={designData.canvas.height} fill={designData.canvas.background || "#fff"} />
                  {renderGridLines()}
                  {renderCanvasElements()}
                </Layer>
              </Stage>
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={8} className="editor-right-panel">
          <Card className="panel-card" title="图层管理" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Button onClick={addLayer}>新增图层</Button>
              <List
                size="small"
                dataSource={[...designData.layers].sort((a, b) => a.order - b.order)}
                renderItem={(layer) => (
                  <List.Item
                    style={{
                      borderRadius: 10,
                      border: layer.id === activeLayerId ? "1px solid #91caff" : "1px solid #f0f0f0",
                      paddingInline: 10
                    }}
                    actions={[
                      <Tooltip key="visible" title={layer.visible ? "隐藏图层" : "显示图层"}>
                        <Button type="text" icon={layer.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => toggleLayerVisibility(layer.id)} />
                      </Tooltip>,
                      <Tooltip key="lock" title={layer.locked ? "解锁图层" : "锁定图层"}>
                        <Button type="text" icon={layer.locked ? <LockOutlined /> : <UnlockOutlined />} onClick={() => toggleLayerLock(layer.id)} />
                      </Tooltip>
                    ]}
                    onClick={() => setActiveLayerId(layer.id)}
                  >
                    <Input
                      size="small"
                      value={layer.name}
                      onChange={(e) => updateLayerName(layer.id, e.target.value)}
                    />
                  </List.Item>
                )}
              />
            </Space>
          </Card>

          <Card className="panel-card" title="图形属性" style={{ marginBottom: 16 }}>
            {renderPropertyFields()}
          </Card>

          <Card className="panel-card" title="协作与导出">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Typography.Text strong>
                <TeamOutlined /> 在线协作成员（{collaborators.length}）
              </Typography.Text>
              <Space wrap>
                {collaborators.length ? collaborators.map((item) => <Tag key={`${item.userId}-${item.username}`}>{item.username}</Tag>) : <Typography.Text type="secondary">暂无其他协作者</Typography.Text>}
              </Space>

              <Divider style={{ margin: "4px 0" }} />

              <Space wrap>
                {[
                  { label: "导出 PDF", value: "PDF" },
                  { label: "导出 SVG", value: "SVG" },
                  { label: "导出 DXF", value: "DXF" },
                  { label: "导出 PNG", value: "PNG" }
                ].map((item) => (
                  <Button
                    key={item.value}
                    icon={<DownloadOutlined />}
                    loading={exportingFormat === item.value}
                    onClick={() => handleExport(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </Space>

              <Divider style={{ margin: "4px 0" }} />

              <Typography.Text strong>
                <HistoryOutlined /> 版本历史（最近 10 条）
              </Typography.Text>
              {versions.length === 0 ? (
                <Empty description="暂无版本记录" />
              ) : (
                <List
                  size="small"
                  dataSource={versions.slice(0, 10)}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          key="restore"
                          type="link"
                          onClick={() => {
                            Modal.confirm({
                              title: "恢复版本确认",
                              content: `确认将当前设计恢复到 V${item.version} 吗？系统会创建一个新版本保留恢复结果。`,
                              okText: "确认恢复",
                              cancelText: "取消",
                              onOk: () => handleRestore(item)
                            });
                          }}
                        >
                          恢复
                        </Button>
                      ]}
                    >
                      <Space direction="vertical" size={0}>
                        <Typography.Text>V{item.version}</Typography.Text>
                        <Typography.Text type="secondary">{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              )}

              <Divider style={{ margin: "4px 0" }} />

              <Typography.Text strong>导出记录（最近 8 条）</Typography.Text>
              {exportRecords.length === 0 ? (
                <Empty description="暂无导出记录" />
              ) : (
                <List
                  size="small"
                  dataSource={exportRecords.slice(0, 8)}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button key="download" type="link" href={buildDownloadUrl(item.id)} target="_blank" rel="noreferrer">
                          下载
                        </Button>
                      ]}
                    >
                      <Space direction="vertical" size={0}>
                        <Typography.Text>{item.format}</Typography.Text>
                        <Typography.Text type="secondary">{dayjs(item.exportedAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {saving && (
        <Spin
          spinning
          fullscreen
          tip="正在保存版本..."
          style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(1px)" }}
        />
      )}
    </section>
  );
}

export default EditorPage;
