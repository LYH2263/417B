import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AdminContext = createContext(null);

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? "http://localhost:8417/api"
  : "/api";
const STORAGE_KEY = "paperwise_admin_token";

export function AdminProvider({ children }) {
  const [adminToken, setAdminToken] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const verify = async () => {
      if (!adminToken) {
        setIsVerified(false);
        setVerifying(false);
        return;
      }
      try {
        setVerifying(true);
        const res = await axios.post(`${API_BASE}/admin/verify`, { admin_token: adminToken });
        setIsVerified(res.data.valid === true);
      } catch (err) {
        setIsVerified(false);
      } finally {
        setVerifying(false);
      }
    };
    verify();
  }, [adminToken]);

  const login = useCallback(async (token) => {
    try {
      const res = await axios.post(`${API_BASE}/admin/verify`, { admin_token: token });
      if (res.data.valid === true) {
        setAdminToken(token);
        localStorage.setItem(STORAGE_KEY, token);
        setIsVerified(true);
        return { success: true };
      }
      return { success: false, error: "Invalid admin token" };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || err.message };
    }
  }, []);

  const logout = useCallback(() => {
    setAdminToken("");
    setIsVerified(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const adminAxios = axios.create({
    baseURL: API_BASE,
    headers: {
      "X-Admin-Token": adminToken
    }
  });

  adminAxios.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        setIsVerified(false);
      }
      return Promise.reject(err);
    }
  );

  return (
    <AdminContext.Provider value={{
      adminToken,
      isVerified,
      verifying,
      login,
      logout,
      adminAxios,
      API_BASE
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
