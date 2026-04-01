import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { Button, Card, Result, Typography } from "antd";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
    console.error("组件错误捕获:", error, errorInfo);
  }

  handleReload(): void {
    window.location.href = "/";
  }

  handleGoBack(): void {
    window.history.back();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <Card style={{ maxWidth: 600, width: "100%" }}>
            <Result
              status="error"
              title="页面发生错误"
              subTitle="抱歉，当前页面遇到了一些问题，请尝试刷新或返回上一页"
              extra={[
                <Button key="reload" type="primary" onClick={this.handleReload}>
                  刷新页面
                </Button>,
                <Button key="back" onClick={this.handleGoBack}>
                  返回上一页
                </Button>
              ]}
            />
            {this.state.error && (
              <Typography.Paragraph
                style={{ marginTop: 20, textAlign: "left" }}
              >
                <Typography.Text strong>错误详情：</Typography.Text>
                <Typography.Paragraph
                  copyable
                  style={{
                    background: "#f5f5f5",
                    padding: 12,
                    borderRadius: 4,
                    marginTop: 8,
                    fontFamily: "monospace"
                  }}
                >
                  {this.state.error.toString()}
                </Typography.Paragraph>
              </Typography.Paragraph>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
