const RETURN_URL_KEY = "prescription-link:return-url";

export function captureReturnUrlOnEntry() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (sessionStorage.getItem(RETURN_URL_KEY)) {
    return;
  }

  const referrer = document.referrer.trim();

  if (!referrer) {
    return;
  }

  try {
    const referrerUrl = new URL(referrer);

    if (referrerUrl.href !== window.location.href) {
      sessionStorage.setItem(RETURN_URL_KEY, referrerUrl.href);
    }
  } catch {
    sessionStorage.setItem(RETURN_URL_KEY, referrer);
  }
}

export function clearReturnUrl() {
  sessionStorage.removeItem(RETURN_URL_KEY);
}

export function smartGoBack() {
  const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);

  if (returnUrl) {
    clearReturnUrl();
    window.location.assign(returnUrl);
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign("/");
}
