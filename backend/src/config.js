const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8217),
  jwtSecret: process.env.JWT_SECRET || "jde_design_super_secret_key",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  exportBasePath: process.env.EXPORT_BASE_PATH || "/app/generated"
};

export default config;
