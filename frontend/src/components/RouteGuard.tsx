import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "../contexts/AuthContext";

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireRoles?: string[];
}

function RouteGuard({ children, requireAuth = true, requireRoles = [] }: RouteGuardProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requireRoles.length > 0 && user && !requireRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default RouteGuard;
