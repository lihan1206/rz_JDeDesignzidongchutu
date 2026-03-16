import axios from "axios";
import { message } from "antd";

const http = axios.create({
  baseURL: "/api",
  timeout: 15000
});

http.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("jde_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const messageText = error?.response?.data?.message || "网络请求失败，请稍后重试";
    message.error(messageText);
    return Promise.reject(error);
  }
);

export default http;
