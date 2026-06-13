export class AppApiError extends Error {
  constructor(code, error, status = 400) {
    super(error);
    this.name = "AppApiError";
    this.code = code;
    this.status = status;
  }
}

export function appSuccess(data = {}) {
  return { status: 200, payload: { ok: true, data } };
}

export function appFailure(error) {
  if (error instanceof AppApiError) {
    return {
      status: error.status,
      payload: {
        ok: false,
        code: error.code,
        error: error.message
      }
    };
  }
  return {
    status: 500,
    payload: {
      ok: false,
      code: "APP_API_ERROR",
      error: "服务暂时不可用，请稍后再试。"
    }
  };
}

export function requireValue(value, code, message, status = 400) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new AppApiError(code, message, status);
  }
  return value;
}
