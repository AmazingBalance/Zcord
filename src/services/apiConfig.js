export const getApiBaseUrl = () => {
  const base = process.env.NEXT_PUBLIC_API_URL;
  return base ? base.replace(/\/$/, "") : "";
};

export const apiUrl = (path = "") => {
  const base = getApiBaseUrl();
  if (!path) return base;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
};

export const getWsBaseUrl = () => {
  const base = getApiBaseUrl();
  if (base) return base.replace(/^http/, "ws");
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/^http/, "ws");
  }
  return "";
};

export const wsUrl = (path = "/ws") => {
  const base = getWsBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
};

export const assetUrl = (src) => {
  if (!src || src.trim() === "") return null;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;

  const base = getApiBaseUrl() || (typeof window !== "undefined" ? window.location.origin : "");
  const normalizedBase = base.replace(/\/$/, "");
  if (!normalizedBase) return src;

  if (src.startsWith("uploads/")) return `${normalizedBase}/${src}`;
  if (src.startsWith("/")) return `${normalizedBase}${src}`;
  return `${normalizedBase}/uploads/${src}`;
};

