import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import {
  directCreateEntry,
  directDeleteEntry,
  directGoogleAuth,
  directLoadDashboard,
  directUpdateEntry,
  directUpdatePreferences,
  directUpdateProfile,
  uploadProfileImage,
} from "./supabaseApi";
import "react-calendar/dist/Calendar.css";

const Calendar = lazy(() => import("react-calendar"));
const TrendChart = lazy(() => import("./components/TrendChart"));

const normalizeApiUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  return /\/api$/i.test(value) ? value : `${value}/api`;
};

const configuredApiUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
const isLocalFrontend =
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

const API_URL = configuredApiUrl || (isLocalFrontend ? "http://localhost:5000/api" : "");
const AUTH_TOKEN_STORAGE_KEY = "ojtAuthToken";
const AUTH_USER_STORAGE_KEY = "ojtAuthUser";
const LAST_AUTH_USER_ID_STORAGE_KEY = "ojtLastAuthUserId";
const OAUTH_PROVIDER_STORAGE_KEY = "ojtOAuthProvider";
const OAUTH_PROVIDER_GOOGLE = "google";
const OAUTH_PROVIDER_EMAIL = "email";
const configuredOAuthRedirectUrl = String(import.meta.env.VITE_OAUTH_REDIRECT_URL || "")
  .trim()
  .replace(/\/+$/, "");
const BACKEND_WARMUP_TIMEOUT_MS = 6000;
const BACKEND_AUTH_TIMEOUT_MS = 10000;
const BACKEND_DATA_TIMEOUT_MS = 8000;
const LOADING_FAILSAFE_MS = 18000;
const BACKEND_READY_RETRY_DELAY_MS = 1200;
const BACKEND_READY_MAX_CHECKS = 4;
const OAUTH_INIT_TIMEOUT_MS = 12000;
const DIRECT_AUTH_TIMEOUT_MS = 15000;
const DIRECT_DATA_TIMEOUT_MS = 15000;
const EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 60;
const DEFAULT_REQUIRED_OJT_HOURS = 600;
const DEFAULT_THEME_MODE = "light";
const HALFDAY_BREAK_MINUTES = 30;
const HALFDAY_MAX_SHIFT_HOURS = 5;
const GITHUB_REPO_URL = "https://github.com/KewnsR/OJT-Tracker-System";
const DEFAULT_DIRECT_SUPABASE_MODE =
  isSupabaseConfigured &&
  import.meta.env.VITE_USE_SUPABASE_DIRECT !== "false";

const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromDateString = (dateStr) => {
  const [year, month, day] = (dateStr || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const isValidDateValue = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const getDateKeysInRange = (fromStr, toStr) => {
  const from = fromDateString(fromStr);
  const to = fromDateString(toStr);

  if (!isValidDateValue(from) || !isValidDateValue(to)) return [];

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const keys = [];

  while (cursor <= end && keys.length <= 731) {
    keys.push(toLocalDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

const getStartOfWeek = (date) => {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
};

const getDayOfWeek = (date) => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
};

const errorToText = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof value.error === "string") return value.error;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return "Unexpected error";
    }
  }
  return String(value);
};

const isNetworkLikeError = (value) => {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("network error") ||
    text.includes("timeout") ||
    text.includes("failed to fetch") ||
    text.includes("network-request-failed")
  );
};

const isStaleSupabaseSessionError = (value) => {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("sub claim") ||
    text.includes("jwt does not exist") ||
    text.includes("invalid jwt") ||
    text.includes("session not found")
  );
};

const getGoogleAuthErrorText = (authError) => {
  if (!authError) return "";
  const responseData = authError?.response?.data;
  return (
    errorToText(responseData?.error) ||
    errorToText(responseData) ||
    errorToText(authError?.message) ||
    errorToText(authError?.code) ||
    ""
  );
};

const isRedirectConfigError = (value) => {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("redirect") &&
    (text.includes("not allowed") || text.includes("invalid") || text.includes("mismatch"))
  );
};

const hasPlaceholderApiUrl = /your-backend|example\.com|<backend-url>/i.test(
  API_URL
);
const hasMissingHostedApiUrl = !configuredApiUrl && !isLocalFrontend && !DEFAULT_DIRECT_SUPABASE_MODE;
const hasHostedLocalApiUrl =
  !isLocalFrontend &&
  !DEFAULT_DIRECT_SUPABASE_MODE &&
  /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configuredApiUrl);

const safeParseJson = (value, fallback) => {
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toValidRequiredOjtHours = (value, fallback = DEFAULT_REQUIRED_OJT_HOURS) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const hasGoalBeenConfigured = ({ serverRequiredHours, entryCount = 0 }) => {
  const normalizedServerRequiredHours = toValidRequiredOjtHours(serverRequiredHours, Number.NaN);
  const hasCustomServerGoal =
    Number.isFinite(normalizedServerRequiredHours) &&
    normalizedServerRequiredHours !== DEFAULT_REQUIRED_OJT_HOURS;
  const hasRecordedEntries = Number(entryCount) > 0;

  return hasCustomServerGoal || hasRecordedEntries;
};

const getCurrentOrigin = () =>
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "your deployed domain";

const getOAuthProviderLabel = (provider = OAUTH_PROVIDER_GOOGLE) => {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === OAUTH_PROVIDER_EMAIL) {
    return "Email code";
  }
  return "Google";
};

const normalizeOAuthProvider = (provider = OAUTH_PROVIDER_GOOGLE) => {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === OAUTH_PROVIDER_EMAIL || normalized === "otp") {
    return OAUTH_PROVIDER_EMAIL;
  }
  return OAUTH_PROVIDER_GOOGLE;
};

const isValidEmail = (value) => /.+@.+\..+/.test(String(value || "").trim());

const withTimeout = async (promise, ms, timeoutMessage) => {
  let timerId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, ms);
    });

    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
};

const hasOAuthCallbackParams = () => {
  if (typeof window === "undefined") return false;

  const searchParams = new URLSearchParams(window.location.search || "");
  const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));

  return (
    searchParams.has("code") ||
    searchParams.has("error") ||
    searchParams.has("error_description") ||
    hashParams.has("access_token") ||
    hashParams.has("refresh_token") ||
    hashParams.has("error") ||
    hashParams.has("error_description")
  );
};

const clearOAuthParamsFromUrl = () => {
  if (typeof window === "undefined") return;

  try {
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, "", cleanUrl);
  } catch {
    // ignore URL cleanup failures
  }
};

const getProviderFromSession = (session) => {
  const primaryProvider = session?.user?.app_metadata?.provider;
  if (primaryProvider) {
    return normalizeOAuthProvider(primaryProvider);
  }

  const firstIdentityProvider = session?.user?.identities?.[0]?.provider;
  if (firstIdentityProvider) {
    return normalizeOAuthProvider(firstIdentityProvider);
  }

  return "";
};

const getPendingOAuthProvider = () => {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY) || "";
  if (!stored) return "";
  return normalizeOAuthProvider(stored);
};

const setPendingOAuthProvider = (provider) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, normalizeOAuthProvider(provider));
};

const clearPendingOAuthProvider = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OAUTH_PROVIDER_STORAGE_KEY);
};

export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "");
  const [authUser, setAuthUser] = useState(() => {
    const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY) || "";
    return safeParseJson(stored, null);
  });
  const [useDirectSupabase, setUseDirectSupabase] = useState(DEFAULT_DIRECT_SUPABASE_MODE);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [emailAuthForm, setEmailAuthForm] = useState({ email: "" });
  const [emailOtpCooldownUntil, setEmailOtpCooldownUntil] = useState(0);
  const [emailOtpTick, setEmailOtpTick] = useState(0);
  const [authNotice, setAuthNotice] = useState("");
  const [showLoginSplash, setShowLoginSplash] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    date: toLocalDateString(new Date()),
    timeIn: "08:00",
    timeOut: "18:00",
    notes: "",
    day: "",
  });
  const persistEntriesLocally = (nextEntries) => {
    localStorage.setItem("ojtData", JSON.stringify(nextEntries));
  };
  const [timeIn12, setTimeIn12] = useState({ hour: "08", minute: "00", period: "AM" });
  const [timeOut12, setTimeOut12] = useState({ hour: "06", minute: "00", period: "PM" });
  const [profile, setProfile] = useState({
    name: "OJT Trainee",
    position: "",
    company: "",
    email: "",
    department: "",
    supervisor: "",
  });
  const [profileForm, setProfileForm] = useState({
    name: "OJT Trainee",
    position: "",
    company: "",
    email: "",
    department: "",
    supervisor: "",
  });

  const [lunchStart, setLunchStart] = useState(11);
  const [lunchEnd, setLunchEnd] = useState(12);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [requiredOjtHours, setRequiredOjtHours] = useState(DEFAULT_REQUIRED_OJT_HOURS);
  const [goalInput, setGoalInput] = useState(String(DEFAULT_REQUIRED_OJT_HOURS));
  const [showGoalProgress, setShowGoalProgress] = useState(true);
  const [weeklyJournalNotes, setWeeklyJournalNotes] = useState({});
  const [themeMode, setThemeMode] = useState(DEFAULT_THEME_MODE);
  const [journalFromDate, setJournalFromDate] = useState(() =>
    toLocalDateString(getStartOfWeek(new Date()))
  );
  const [journalToDate, setJournalToDate] = useState(() =>
    toLocalDateString(getEndOfWeek(new Date()))
  );
  const [journalInput, setJournalInput] = useState("");
  const [editingJournalKey, setEditingJournalKey] = useState(null);
  const [journalEditForm, setJournalEditForm] = useState({ from: "", to: "", note: "" });
  const [journalDeleteTarget, setJournalDeleteTarget] = useState(null);
  const [entryDeleteTarget, setEntryDeleteTarget] = useState(null);

  const emailOtpCooldownSecondsLeft = Math.max(
    0,
    Math.ceil((emailOtpCooldownUntil - (emailOtpTick || Date.now())) / 1000)
  );

  useEffect(() => {
    if (emailOtpCooldownSecondsLeft <= 0) return undefined;

    const intervalId = setInterval(() => {
      setEmailOtpTick(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [emailOtpCooldownSecondsLeft]);

  const applyAuthHeader = (token) => {
    if (useDirectSupabase) {
      delete axios.defaults.headers.common.Authorization;
      return;
    }

    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  };

  const shouldForceDirectSupabase =
    !isLocalFrontend &&
    isSupabaseConfigured &&
    !useDirectSupabase &&
    (hasMissingHostedApiUrl || hasPlaceholderApiUrl || hasHostedLocalApiUrl);

  useEffect(() => {
    if (shouldForceDirectSupabase) {
      setUseDirectSupabase(true);
    }
  }, [shouldForceDirectSupabase]);

  useEffect(() => {
    applyAuthHeader(authToken);
    if (authToken) {
      loadData(authToken);
    } else {
      setLoading(false);
    }
  }, [authToken, useDirectSupabase]);

  useEffect(() => {
    if (!loading || !authToken) return undefined;

    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError((prev) => {
        if (prev) return prev;
        return "Loading is taking longer than expected. Please refresh or try again in a few seconds.";
      });
    }, LOADING_FAILSAFE_MS);

    return () => clearTimeout(timeoutId);
  }, [loading, authToken]);

  useEffect(() => {
    if (useDirectSupabase) {
      return;
    }

    if (!API_URL || hasPlaceholderApiUrl || hasMissingHostedApiUrl || hasHostedLocalApiUrl) {
      return;
    }

    axios.get(`${API_URL}/health`, { timeout: BACKEND_WARMUP_TIMEOUT_MS }).catch(() => {});
  }, [useDirectSupabase]);

  useEffect(() => {
    if (!authUser) return;
    setProfile((prev) => ({
      ...prev,
      name: authUser.name || prev.name,
      email: authUser.email || prev.email,
    }));
    setProfileForm((prev) => ({
      ...prev,
      name: authUser.name || prev.name,
      email: authUser.email || prev.email,
    }));
  }, [authUser]);

  const handleOAuthAuthError = async (authError, oauthProvider = OAUTH_PROVIDER_GOOGLE) => {
    const providerLabel = getOAuthProviderLabel(oauthProvider);
    const backendMessage = getGoogleAuthErrorText(authError);
    setAuthNotice("");

    if (isStaleSupabaseSessionError(backendMessage) || isStaleSupabaseSessionError(authError?.message)) {
      try {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch {
        // Continue with local auth reset even if signOut call fails.
      }

      persistAuth("", null);
      setError(
        `${providerLabel} session expired or mismatched. Please click Continue with ${providerLabel} again to start a fresh sign in.`
      );
      return;
    }

    if (backendMessage) {
      if (isRedirectConfigError(backendMessage)) {
        setError(
          `${providerLabel} sign in redirect is not allowed. In Supabase Auth URL Configuration, add ${getCurrentOrigin()} to Redirect URLs, then retry login.`
        );
      } else if (String(backendMessage).toLowerCase().includes("oauth")) {
        setError(`${providerLabel} sign in failed: ${backendMessage}`);
      } else if (String(backendMessage).toLowerCase().includes("site can't be reached")) {
        setError(
          `${providerLabel} sign in redirect failed to open. Ensure Supabase redirect URLs include your Vercel URL (not localhost).`
        );
      } else
      if (String(backendMessage).toLowerCase().includes("the page could not be found")) {
        setError(
          `${providerLabel} sign in failed: API route not found. If you are not using direct mode, set VITE_API_URL to your backend base URL and verify /api/health works.`
        );
      } else if (isNetworkLikeError(backendMessage)) {
        setError(
          `${providerLabel} sign in failed: backend is temporarily unreachable (often a cold start). Wait a few seconds and try again.`
        );
      } else {
        setError(`${providerLabel} sign in failed: ${backendMessage}`);
      }
    } else if (!authError?.response) {
      if (useDirectSupabase) {
        if (String(authError?.message || "").toLowerCase().includes("timed out")) {
          setError(
            `${providerLabel} sign in timed out while waiting for Supabase. Please retry, then check internet stability.`
          );
          return;
        }

        setError(
          `${providerLabel} sign in failed due to network issues. Please check your internet and try again.`
        );
        return;
      }

      try {
        await axios.get(`${API_URL}/health`, {
          timeout: 3500,
          validateStatus: () => true,
        });
        const fallbackText =
          getGoogleAuthErrorText(authError) || "Network or popup error during OAuth authentication.";
        if (isNetworkLikeError(fallbackText)) {
          setError(
            `${providerLabel} sign in failed: backend is waking up (cold start). Please try again in 10-30 seconds.`
          );
        } else {
          setError(`${providerLabel} sign in failed: ${fallbackText}`);
        }
      } catch {
        setError(
          `${providerLabel} sign in failed: API is unreachable. Enable direct mode with VITE_USE_SUPABASE_DIRECT=true or set a reachable VITE_API_URL.`
        );
      }
    } else {
      setError(
        `${providerLabel} sign in failed: ${
          getGoogleAuthErrorText(authError) || "Unknown error"
        }`
      );
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForBackendReady = async () => {
    if (useDirectSupabase) {
      return true;
    }

    for (let attempt = 0; attempt < BACKEND_READY_MAX_CHECKS; attempt += 1) {
      try {
        const response = await axios.get(`${API_URL}/health`, {
          timeout: BACKEND_WARMUP_TIMEOUT_MS,
          validateStatus: () => true,
        });

        if (response.status >= 200 && response.status < 500) {
          return true;
        }
      } catch {
        // retry until attempts are exhausted
      }

      if (attempt < BACKEND_READY_MAX_CHECKS - 1) {
        await sleep(BACKEND_READY_RETRY_DELAY_MS);
      }
    }

    return false;
  };

  const completeOAuthBackendAuth = async (
    supabaseAccessToken,
    oauthProvider = OAUTH_PROVIDER_GOOGLE
  ) => {
    if (!supabaseAccessToken) {
      throw new Error("Missing Supabase access token");
    }

    const isGoogleProvider = oauthProvider === OAUTH_PROVIDER_GOOGLE;

    if (useDirectSupabase || !isGoogleProvider) {
      const directAuth = await withTimeout(
        directGoogleAuth(supabaseAccessToken, oauthProvider),
        DIRECT_AUTH_TIMEOUT_MS,
        `${getOAuthProviderLabel(oauthProvider)} sign in timed out while contacting Supabase. Please try again.`
      );

      if (!useDirectSupabase) {
        setUseDirectSupabase(true);
      }

      persistAuth(directAuth.token, directAuth.user);
      return;
    }

    const submitGoogleToken = () =>
      axios.post(
        `${API_URL}/auth/google`,
        {
          supabaseAccessToken,
        },
        {
          timeout: BACKEND_AUTH_TIMEOUT_MS,
        }
      );

    let res;

    try {
      res = await submitGoogleToken();
    } catch (firstError) {
      if (!isNetworkLikeError(firstError?.message)) {
        throw firstError;
      }

      // When backend is unreachable on mobile, switch to direct Supabase mode.
      try {
        const directAuth = await directGoogleAuth(supabaseAccessToken);
        setUseDirectSupabase(true);
        persistAuth(directAuth.token, directAuth.user);
        return;
      } catch {
        // Continue backend wake-up flow if direct mode is not possible.
      }

      const backendReady = await waitForBackendReady();
      if (!backendReady) {
        throw new Error("Backend is still waking up. Please try Google sign in again in a few seconds.");
      }

      res = await submitGoogleToken();
    }

    persistAuth(res.data?.token, res.data?.user);
  };

  useEffect(() => {
    let cancelled = false;

    const handleRedirectSignIn = async () => {
      if (!useDirectSupabase && (hasMissingHostedApiUrl || hasPlaceholderApiUrl || hasHostedLocalApiUrl)) {
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        let sessionData = null;
        let sessionError = null;
        const shouldRetrySession = hasOAuthCallbackParams();

        for (let attempt = 0; attempt < (shouldRetrySession ? 10 : 1); attempt += 1) {
          const result = await supabase.auth.getSession();
          sessionData = result.data;
          sessionError = result.error;

          if (sessionError) {
            throw sessionError;
          }

          if (sessionData?.session?.access_token) {
            break;
          }

          if (attempt < 9 && shouldRetrySession) {
            await sleep(500);
          }
        }

        const accessToken = sessionData?.session?.access_token;
        if (!accessToken || cancelled) return;

        const oauthProvider =
          getPendingOAuthProvider() ||
          getProviderFromSession(sessionData?.session) ||
          OAUTH_PROVIDER_GOOGLE;

        setGoogleLoading(true);
        await completeOAuthBackendAuth(accessToken, oauthProvider);
        if (!cancelled) {
          setError("");
          clearPendingOAuthProvider();
          clearOAuthParamsFromUrl();
        }
      } catch (authError) {
        if (!cancelled) {
          await handleOAuthAuthError(authError, getPendingOAuthProvider());
        }
      } finally {
        if (!cancelled) {
          setGoogleLoading(false);
        }
      }
    };

    handleRedirectSignIn();

    const supabase = getSupabaseClient();
    const authSubscription = supabase?.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED") return;

      const accessToken = session?.access_token;
      if (!accessToken || authToken) return;

      const oauthProvider =
        getPendingOAuthProvider() || getProviderFromSession(session) || OAUTH_PROVIDER_GOOGLE;

      setGoogleLoading(true);
      try {
        await completeOAuthBackendAuth(accessToken, oauthProvider);
        if (!cancelled) setError("");
        clearPendingOAuthProvider();
      } catch (authError) {
        if (!cancelled) {
          await handleOAuthAuthError(authError, oauthProvider);
        }
      } finally {
        if (!cancelled) {
          setGoogleLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      authSubscription?.data?.subscription?.unsubscribe();
    };
  }, [authToken, useDirectSupabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = new URLSearchParams(window.location.search || "");
    const oauthError = query.get("error") || "";
    const oauthDescription = query.get("error_description") || "";

    if (!oauthError && !oauthDescription) return;

    const raw = decodeURIComponent(oauthDescription || oauthError).replace(/\+/g, " ");
    if (isRedirectConfigError(raw)) {
      setError(
        `OAuth sign in redirect is not allowed. Add ${getCurrentOrigin()} to Supabase Redirect URLs and try again.`
      );
    } else {
      setError(`OAuth sign in failed: ${raw}`);
    }

    clearOAuthParamsFromUrl();
  }, []);

  const loadData = async (token = authToken) => {
    try {
      setLoading(true);

      if (useDirectSupabase) {
        const directTokenUid =
          typeof token === "string" && token.startsWith("supabase:")
            ? token.slice("supabase:".length)
            : "";
        const uid = authUser?.id || directTokenUid;
        if (!uid) {
          throw new Error("Missing authenticated user context.");
        }

        const dashboard = await withTimeout(
          directLoadDashboard(uid, authUser),
          DIRECT_DATA_TIMEOUT_MS,
          "Loading dashboard from Supabase timed out. Please refresh and try again."
        );
        const prefs = dashboard.preferences || {};

        setEntries(dashboard.entries || []);
        setLunchStart(prefs.lunchStartHour ?? prefs.lunchStart ?? 11);
        setLunchEnd(prefs.lunchEndHour ?? prefs.lunchEnd ?? 12);
        const hasConfiguredGoal = hasGoalBeenConfigured({
          serverRequiredHours: prefs.requiredOjtHours,
          entryCount: Array.isArray(dashboard.entries) ? dashboard.entries.length : 0,
        });
        const savedRequiredHours = toValidRequiredOjtHours(prefs.requiredOjtHours);
        setRequiredOjtHours(savedRequiredHours);
        setGoalInput(String(savedRequiredHours));
        setShowLoginSplash(!hasConfiguredGoal);
        setWeeklyJournalNotes(prefs.weeklyJournalNotes || {});
        const savedThemeMode = prefs.themeMode || DEFAULT_THEME_MODE;
        setThemeMode(savedThemeMode === "dark" ? "dark" : "light");

        if (dashboard.profile) {
          setProfile(dashboard.profile);
          setProfileForm(dashboard.profile);
        }

        return;
      }

      const requestConfig = {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: BACKEND_DATA_TIMEOUT_MS,
      };

      const [entriesResult, prefsResult, profileResult] = await Promise.allSettled([
        axios.get(`${API_URL}/entries`, requestConfig),
        axios.get(`${API_URL}/preferences`, requestConfig),
        axios.get(`${API_URL}/profile`, requestConfig),
      ]);

      const getResultData = (result) =>
        result?.status === "fulfilled" && result?.value?.data ? result.value.data : null;

      const getResultStatus = (result) =>
        result?.status === "rejected" ? result?.reason?.response?.status : undefined;

      if (
        getResultStatus(entriesResult) === 401 ||
        getResultStatus(prefsResult) === 401 ||
        getResultStatus(profileResult) === 401
      ) {
        persistAuth("", null);
        setLoading(false);
        return;
      }

      const entriesData = getResultData(entriesResult);
      if (Array.isArray(entriesData)) {
        setEntries(entriesData);
      }

      const prefs = getResultData(prefsResult);
      if (prefs) {
        setLunchStart(prefs.lunchStartHour ?? prefs.lunchStart ?? 11);
        setLunchEnd(prefs.lunchEndHour ?? prefs.lunchEnd ?? 12);
        const hasConfiguredGoal = hasGoalBeenConfigured({
          serverRequiredHours: prefs.requiredOjtHours,
          entryCount: Array.isArray(entriesData) ? entriesData.length : 0,
        });
        const savedRequiredHours = toValidRequiredOjtHours(prefs.requiredOjtHours);
        setRequiredOjtHours(savedRequiredHours);
        setGoalInput(String(savedRequiredHours));
        setShowLoginSplash(!hasConfiguredGoal);
        const savedWeeklyJournal = prefs.weeklyJournalNotes || {};
        setWeeklyJournalNotes(savedWeeklyJournal);
        const savedThemeMode = prefs.themeMode || DEFAULT_THEME_MODE;
        setThemeMode(savedThemeMode === "dark" ? "dark" : "light");
      }

      const profileData = getResultData(profileResult);
      if (profileData) {
        setProfile(profileData);
        setProfileForm(profileData);
      }

      if (!entriesData && !prefs && !profileData) {
        throw new Error("Unable to load dashboard data from server.");
      }
    } catch (loadError) {
      if (loadError?.response?.status === 401) {
        persistAuth("", null);
        setLoading(false);
        return;
      }

      const stored = localStorage.getItem("ojtData");
      const prefs = localStorage.getItem("lunchBreak");
      const goalPrefs = localStorage.getItem("ojtGoal");
      const localWeeklyJournal = localStorage.getItem("weeklyJournalNotes");
      const savedProfile = localStorage.getItem("userProfile");
      const savedThemeMode = localStorage.getItem("themeMode");

      if (stored) setEntries(safeParseJson(stored, []));
      if (prefs) {
        const p = safeParseJson(prefs, {});
        setLunchStart(p.start ?? 11);
        setLunchEnd(p.end ?? 12);
      }
      if (goalPrefs) {
        const g = safeParseJson(goalPrefs, {});
        const savedRequiredHours = toValidRequiredOjtHours(g.requiredHours);
        setRequiredOjtHours(savedRequiredHours);
        setGoalInput(String(savedRequiredHours));
        setShowGoalProgress(Boolean(g.showGoalProgress ?? true));
      }
      if (localWeeklyJournal) {
        setWeeklyJournalNotes(safeParseJson(localWeeklyJournal, {}));
      }
      setThemeMode(savedThemeMode === "dark" ? "dark" : DEFAULT_THEME_MODE);
      if (!goalPrefs) {
        setShowLoginSplash(true);
      }
      if (savedProfile) {
        const p = safeParseJson(savedProfile, null);
        if (p) {
          setProfile(p);
          setProfileForm(p);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const persistAuth = (token, user) => {
    const nextUserId = user?.id ? String(user.id) : "";
    const previousUserId = localStorage.getItem(LAST_AUTH_USER_ID_STORAGE_KEY) || "";

    if (nextUserId) {
      if (previousUserId && previousUserId !== nextUserId) {
        // Reset shared local cache when switching accounts to avoid stale settings.
        localStorage.removeItem("ojtGoal");
        localStorage.removeItem("themeMode");
        localStorage.removeItem("lunchBreak");
        localStorage.removeItem("weeklyJournalNotes");
        localStorage.removeItem("userProfile");
        localStorage.removeItem("ojtData");
      }
      localStorage.setItem(LAST_AUTH_USER_ID_STORAGE_KEY, nextUserId);
    }

    applyAuthHeader(token || "");
    setAuthToken(token || "");
    setAuthUser(user || null);
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    if (user) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    // Traditional auth removed - OAuth sign-in is used
  };

  const handleOAuthSignIn = async (oauthProvider = OAUTH_PROVIDER_GOOGLE) => {
    const normalizedProvider = normalizeOAuthProvider(oauthProvider);
    const providerLabel = getOAuthProviderLabel(normalizedProvider);
    setError("");
    setAuthNotice("");
    setGoogleLoading(true);

    try {
      const shouldUseDirectNow =
        useDirectSupabase ||
        (isSupabaseConfigured &&
          (hasMissingHostedApiUrl || hasHostedLocalApiUrl || hasPlaceholderApiUrl));

      if (shouldUseDirectNow && !useDirectSupabase) {
        setUseDirectSupabase(true);
      }

      if (!shouldUseDirectNow) {
        if (hasMissingHostedApiUrl) {
          setError(
            `${providerLabel} sign in API URL is missing. Set VITE_API_URL or enable VITE_USE_SUPABASE_DIRECT=true.`
          );
          return;
        }

        if (hasHostedLocalApiUrl) {
          setError(
            `${providerLabel} sign in API URL is localhost (${configuredApiUrl}). Use a public API URL or enable VITE_USE_SUPABASE_DIRECT=true.`
          );
          return;
        }

        if (hasPlaceholderApiUrl) {
          setError(
            `${providerLabel} sign in API URL is still placeholder. Current VITE_API_URL: ${configuredApiUrl || "(empty)"}. Set a real API URL or enable VITE_USE_SUPABASE_DIRECT=true.`
          );
          return;
        }
      }

      if (!isSupabaseConfigured) {
        setError(
          `${providerLabel} sign in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend environment and redeploy.`
        );
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        setError(
          `${providerLabel} sign in is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend environment and redeploy.`
        );
        return;
      }

      const runtimeOrigin =
        typeof window !== "undefined"
          ? window.location.origin
          : "";
      const redirectTo = configuredOAuthRedirectUrl || runtimeOrigin;

      if (!redirectTo) {
        throw new Error(`Unable to determine redirect URL for ${providerLabel} sign in.`);
      }

      setPendingOAuthProvider(normalizedProvider);

      const signInPromise = supabase.auth.signInWithOAuth({
        provider: normalizedProvider,
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${providerLabel} sign in is taking too long to start. If this is mobile, check Supabase redirect URLs for your Vercel domain.`));
        }, OAUTH_INIT_TIMEOUT_MS);
      });

      const { error: oauthError } = await Promise.race([signInPromise, timeoutPromise]);

      if (oauthError) {
        throw oauthError;
      }
    } catch (authError) {
      await handleOAuthAuthError(authError, oauthProvider);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await handleOAuthSignIn(OAUTH_PROVIDER_GOOGLE);
  };

  const handleSendEmailCode = async () => {
    const email = String(emailAuthForm.email || "").trim().toLowerCase();

    if (emailOtpCooldownSecondsLeft > 0) {
      setError(
        `Please wait ${emailOtpCooldownSecondsLeft}s before requesting another sign-in link.`
      );
      setAuthNotice("");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Enter a valid email address to receive your sign-in code.");
      setAuthNotice("");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Email sign-in link is not configured. Add Supabase frontend env vars first.");
      setAuthNotice("");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Email sign-in link is unavailable because Supabase client is not configured.");
      setAuthNotice("");
      return;
    }

    const runtimeOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : "";
    const emailRedirectTo = configuredOAuthRedirectUrl || runtimeOrigin || undefined;

    setEmailAuthLoading(true);
    setError("");
    setAuthNotice("");
    setPendingOAuthProvider(OAUTH_PROVIDER_EMAIL);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });

      if (otpError) {
        throw otpError;
      }

      setEmailAuthForm((prev) => ({ ...prev, email }));
      setEmailOtpCooldownUntil(Date.now() + EMAIL_OTP_RESEND_COOLDOWN_SECONDS * 1000);
      setAuthNotice(
        `Sign-in link sent to your email. Please check your inbox or spam folder.`
      );
    } catch (authError) {
      const authMessage = getGoogleAuthErrorText(authError) || "Unknown error";
      if (String(authMessage).toLowerCase().includes("rate limit")) {
        setEmailOtpCooldownUntil(Date.now() + EMAIL_OTP_RESEND_COOLDOWN_SECONDS * 1000);
        setError(
          `Email sign in failed: email rate limit exceeded. Please wait ${EMAIL_OTP_RESEND_COOLDOWN_SECONDS}s and try again.`
        );
      } else {
        setError(`Email sign in failed: ${authMessage}`);
      }
      clearPendingOAuthProvider();
      setAuthNotice("");
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const requestLogout = () => {
    setShowProfileDropdown(false);
    setShowLogoutConfirm(true);
  };

  const handleLogout = async () => {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch {
      // Continue clearing local auth state even if remote signout fails.
    }

    persistAuth("", null);
    setEntries([]);
    setShowProfileDropdown(false);
    setShowLogoutConfirm(false);
    setShowLoginSplash(false);
    setError("");
  };

  const calculateHours = (timeIn, timeOut, lunchStartHour, lunchEndHour) => {
    const [inHour, inMin] = timeIn.split(":").map(Number);
    const [outHour, outMin] = timeOut.split(":").map(Number);

    const start = inHour * 60 + inMin;
    const end = outHour * 60 + outMin;
    if (end <= start) return 0;

    const totalMinutes = end - start;
    let minutes = totalMinutes;

    // Half-day entries get a fixed 30-minute break instead of lunch-window overlap deduction.
    if (totalMinutes <= HALFDAY_MAX_SHIFT_HOURS * 60) {
      minutes -= Math.min(HALFDAY_BREAK_MINUTES, minutes);
      return Number((minutes / 60).toFixed(2));
    }

    const lunchStartMin = lunchStartHour * 60;
    const lunchEndMin = lunchEndHour * 60;

    const overlapStart = Math.max(start, lunchStartMin);
    const overlapEnd = Math.min(end, lunchEndMin);

    if (overlapEnd > overlapStart) {
      minutes -= overlapEnd - overlapStart;
    }

    return Number((minutes / 60).toFixed(2));
  };

  const toTwelveHour = (time24) => {
    const [hRaw = "0", mRaw = "0"] = (time24 || "00:00").split(":");
    const h = Number(hRaw);
    const minute = String(Number(mRaw)).padStart(2, "0");
    const period = h >= 12 ? "PM" : "AM";
    const twelveHour = h % 12 === 0 ? 12 : h % 12;
    return {
      hour: String(twelveHour).padStart(2, "0"),
      minute,
      period,
    };
  };

  const toTwentyFourHour = ({ hour, minute, period }) => {
    let h = Number(hour);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
  };

  const formatTimeDisplay = (time24) => {
    const { hour, minute, period } = toTwelveHour(time24);
    return `${hour}:${minute} ${period}`;
  };

  const getEntryId = (entry) => entry?._id || entry?.id || entry?.date;

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setForm((prev) => ({
      ...prev,
      date: toLocalDateString(date),
      day: getDayOfWeek(date),
    }));
  };

  const openAddModal = () => {
    const today = new Date();
    setEditingId(null);
    setSelectedDate(today);
    setForm({
      date: toLocalDateString(today),
      timeIn: "08:00",
      timeOut: "18:00",
      notes: "",
      day: getDayOfWeek(today),
    });
    setTimeIn12({ hour: "08", minute: "00", period: "AM" });
    setTimeOut12({ hour: "06", minute: "00", period: "PM" });
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingId(null);
  };

  const handleEdit = (entry) => {
    const entryId = getEntryId(entry);
    const entryDate = fromDateString(entry.date);
    setEditingId(entryId);
    setForm({
      date: entry.date,
      timeIn: entry.timeIn,
      timeOut: entry.timeOut,
      notes: entry.notes || "",
      day: getDayOfWeek(entryDate),
    });
    setTimeIn12(toTwelveHour(entry.timeIn));
    setTimeOut12(toTwelveHour(entry.timeOut));
    setSelectedDate(entryDate);
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const timeIn24 = toTwentyFourHour(timeIn12);
    const timeOut24 = toTwentyFourHour(timeOut12);

    if (!timeIn24 || !timeOut24) {
      setError("Please enter both Time In and Time Out.");
      return;
    }

    const hours = calculateHours(timeIn24, timeOut24, lunchStart, lunchEnd);
    if (hours <= 0) {
      setError("Time Out must be later than Time In.");
      return;
    }

    const payload = { ...form, timeIn: timeIn24, timeOut: timeOut24, hours };

    try {
      if (useDirectSupabase) {
        const uid = authUser?.id;
        if (!uid) {
          throw new Error("Missing authenticated user context.");
        }

        if (editingId) {
          const originalEntry = entries.find((it) => getEntryId(it) === editingId);
          const entryId = originalEntry?._id || originalEntry?.id;

          if (entryId && !String(entryId).startsWith("local-")) {
            const updatedEntry = await directUpdateEntry(uid, entryId, payload);
            setEntries((prev) => {
              const nextEntries = prev.map((it) =>
                getEntryId(it) === editingId ? { ...it, ...updatedEntry } : it
              );
              persistEntriesLocally(nextEntries);
              return nextEntries;
            });
          }
        } else {
          const createdEntry = await directCreateEntry(uid, payload);
          setEntries((prev) => {
            const nextEntries = [createdEntry, ...prev];
            persistEntriesLocally(nextEntries);
            return nextEntries;
          });
        }

        setError("");
        handleCloseModal();
        return;
      }

      if (editingId) {
        const originalEntry = entries.find((it) => getEntryId(it) === editingId);
        const serverId = originalEntry?._id || originalEntry?.id;

        if (serverId && !String(serverId).startsWith("local-")) {
          const res = await axios.put(
            `${API_URL}/entries/${encodeURIComponent(serverId)}`,
            payload
          );
          setEntries((prev) => {
            const nextEntries = prev.map((it) =>
              getEntryId(it) === editingId ? { ...it, ...res.data } : it
            );
            persistEntriesLocally(nextEntries);
            return nextEntries;
          });
        } else {
          setEntries((prev) => {
            const nextEntries = prev.map((it) =>
              getEntryId(it) === editingId ? { ...it, ...payload } : it
            );
            persistEntriesLocally(nextEntries);
            return nextEntries;
          });
        }
      } else {
        const res = await axios.post(`${API_URL}/entries`, payload);
        setEntries((prev) => {
          const nextEntries = [res.data, ...prev];
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      }

      setError("");
      handleCloseModal();
    } catch {
      const offlineEntry = {
        ...payload,
        _id: editingId || `local-${Date.now().toString()}`,
      };
      if (editingId) {
        setEntries((prev) => {
          const nextEntries = prev.map((it) =>
            getEntryId(it) === editingId ? { ...it, ...offlineEntry } : it
          );
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      } else {
        setEntries((prev) => {
          const nextEntries = [offlineEntry, ...prev];
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      }
      setError("");
      handleCloseModal();
    }
  };

  const handleDelete = async (id) => {
    const entry = typeof id === "object" ? id : entries.find((it) => getEntryId(it) === id);
    const targetId = entry ? getEntryId(entry) : id;
    if (!targetId) return;

    const updated = entries.filter((e) => getEntryId(e) !== targetId);
    setEntries(updated);
    persistEntriesLocally(updated);

    try {
      const serverId = entry?._id || entry?.id;
      if (serverId && !String(serverId).startsWith("local-")) {
        if (useDirectSupabase) {
          const uid = authUser?.id;
          if (uid) {
            await directDeleteEntry(uid, serverId);
          }
        } else {
          await axios.delete(`${API_URL}/entries/${encodeURIComponent(serverId)}`);
        }
      }
    } catch {
      setError("");
    }
  };

  const requestDeleteEntry = (entry) => {
    setEntryDeleteTarget(entry);
  };

  const confirmDeleteEntry = async () => {
    if (!entryDeleteTarget) return;
    await handleDelete(entryDeleteTarget);
    setEntryDeleteTarget(null);
  };

  const saveLunchSettings = async () => {
    try {
      if (useDirectSupabase) {
        const uid = authUser?.id;
        if (uid) {
          await directUpdatePreferences(uid, {
            lunchStartHour: lunchStart,
            lunchEndHour: lunchEnd,
            themeMode,
          });
        }
      } else {
        await axios.put(`${API_URL}/preferences`, {
          lunchStartHour: lunchStart,
          lunchEndHour: lunchEnd,
          themeMode,
        });
      }
      localStorage.setItem("lunchBreak", JSON.stringify({ start: lunchStart, end: lunchEnd }));
      localStorage.setItem("themeMode", themeMode);
      setShowSettings(false);
    } catch {
      localStorage.setItem("lunchBreak", JSON.stringify({ start: lunchStart, end: lunchEnd }));
      localStorage.setItem("themeMode", themeMode);
      setShowSettings(false);
    }
  };

  const handleProfileImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // Upload the file
      if (useDirectSupabase) {
        const imageUrl = await uploadProfileImage(authUser?.id, file);
        setProfileForm((prev) => ({ ...prev, image_url: imageUrl }));
      } else {
        const imageUrl = await uploadProfileImage(authUser?.id, file);
        setProfileForm((prev) => ({ ...prev, image_url: imageUrl }));
      }
    } catch (err) {
      setError(err.message || "Failed to upload image");
      setImagePreview(null);
    }
  };

  const saveProfile = async () => {
    try {
      const nextProfile = useDirectSupabase
        ? await directUpdateProfile(authUser?.id, authUser, profileForm)
        : (await axios.put(`${API_URL}/profile`, profileForm)).data;

      setProfile(nextProfile);
      setProfileForm(nextProfile);
      setImagePreview(null);
      localStorage.setItem("userProfile", JSON.stringify(nextProfile));
      setShowProfileModal(false);
    } catch {
      setProfile(profileForm);
      localStorage.setItem("userProfile", JSON.stringify(profileForm));
      setShowProfileModal(false);
    }
  };

  const saveGoalSettings = async () => {
    const parsedRequiredHours = Number(goalInput);

    if (!Number.isFinite(parsedRequiredHours) || parsedRequiredHours <= 0) {
      setError("Required OJT hours must be a valid number greater than 0.");
      return;
    }

    try {
      if (useDirectSupabase) {
        const uid = authUser?.id;
        if (uid) {
          await directUpdatePreferences(uid, {
            lunchStartHour: lunchStart,
            lunchEndHour: lunchEnd,
            requiredOjtHours: parsedRequiredHours,
          });
        }
      } else {
        await axios.put(`${API_URL}/preferences`, {
          lunchStartHour: lunchStart,
          lunchEndHour: lunchEnd,
          requiredOjtHours: parsedRequiredHours,
        });
      }
    } catch {
      // Fallback to local persistence only.
    }

    setRequiredOjtHours(parsedRequiredHours);
    localStorage.setItem(
      "ojtGoal",
      JSON.stringify({ requiredHours: parsedRequiredHours, showGoalProgress })
    );
    setError("");
    setShowGoalModal(false);
  };

  const saveInitialGoalSetup = async () => {
    const parsedRequiredHours = Number(goalInput);

    if (!Number.isFinite(parsedRequiredHours) || parsedRequiredHours <= 0) {
      setError("Required OJT hours must be a valid number greater than 0.");
      return;
    }

    try {
      if (useDirectSupabase) {
        const uid = authUser?.id;
        if (uid) {
          await directUpdatePreferences(uid, {
            lunchStartHour: lunchStart,
            lunchEndHour: lunchEnd,
            requiredOjtHours: parsedRequiredHours,
          });
        }
      } else {
        await axios.put(`${API_URL}/preferences`, {
          lunchStartHour: lunchStart,
          lunchEndHour: lunchEnd,
          requiredOjtHours: parsedRequiredHours,
        });
      }
    } catch {
      // local fallback only
    }

    setRequiredOjtHours(parsedRequiredHours);
    setShowGoalProgress(true);
    localStorage.setItem(
      "ojtGoal",
      JSON.stringify({ requiredHours: parsedRequiredHours, showGoalProgress: true })
    );
    setShowLoginSplash(false);
    setError("");
  };

  const initials = useMemo(() => {
    const parts = (profile.name || "OJT Trainee").trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile.name]);

  const normalizedEntries = useMemo(() => {
    return entries.map((entry) => {
      const hasTimeRange = typeof entry?.timeIn === "string" && typeof entry?.timeOut === "string";
      const computedHours = hasTimeRange
        ? calculateHours(entry.timeIn, entry.timeOut, lunchStart, lunchEnd)
        : Number(entry?.hours) || 0;

      return {
        ...entry,
        hours: Number.isFinite(computedHours) ? Number(computedHours.toFixed(2)) : 0,
      };
    });
  }, [entries, lunchStart, lunchEnd]);

  const hoursByDate = useMemo(() => {
    return normalizedEntries.reduce((acc, entry) => {
      if (!entry?.date) return acc;
      acc[entry.date] = Number(((acc[entry.date] || 0) + (Number(entry.hours) || 0)).toFixed(2));
      return acc;
    }, {});
  }, [normalizedEntries]);

  const loggedDaysCount = useMemo(() => Object.keys(hoursByDate).length, [hoursByDate]);

  const totalHours = useMemo(
    () => normalizedEntries.reduce((sum, item) => sum + (Number(item.hours) || 0), 0),
    [normalizedEntries]
  );

  const remainingHours = Math.max(0, requiredOjtHours - totalHours);
  const progressPercent =
    requiredOjtHours > 0
      ? Math.min(100, (totalHours / requiredOjtHours) * 100)
      : 0;

  const overallTrendData = useMemo(() => {
    return Object.keys(hoursByDate)
      .sort((a, b) => a.localeCompare(b))
      .map((dateStr) => ({
        date: dateStr,
        name: fromDateString(dateStr).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        hours: Number((hoursByDate[dateStr] || 0).toFixed(2)),
      }));
  }, [hoursByDate]);

  const averageDailyHours = useMemo(() => {
    if (!loggedDaysCount) return 0;
    return totalHours / loggedDaysCount;
  }, [totalHours, loggedDaysCount]);

  const sortedEntries = useMemo(() => {
    return [...normalizedEntries].sort((a, b) => {
      const byDate = (b?.date || "").localeCompare(a?.date || "");
      if (byDate !== 0) return byDate;
      return (b?.timeIn || "").localeCompare(a?.timeIn || "");
    });
  }, [normalizedEntries]);

  const selectedDateStr = useMemo(() => toLocalDateString(selectedDate), [selectedDate]);

  const selectedDateEntries = useMemo(() => {
    return sortedEntries.filter((entry) => entry.date === selectedDateStr);
  }, [sortedEntries, selectedDateStr]);

  const currentWeekKey = useMemo(
    () => `${journalFromDate}__${journalToDate}`,
    [journalFromDate, journalToDate]
  );
  const currentWeekLabel = useMemo(() => {
    const fromLabel = fromDateString(journalFromDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const toLabel = fromDateString(journalToDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${fromLabel} - ${toLabel}`;
  }, [journalFromDate, journalToDate]);

  const weeklyJournalHistory = useMemo(() => {
    return Object.entries(weeklyJournalNotes)
      .map(([key, note]) => {
        const [from = "", to = ""] = key.split("__");
        return {
          key,
          from,
          to,
          note: (note || "").trim(),
        };
      })
      .filter((item) => item.note.length > 0)
      .sort((a, b) => b.from.localeCompare(a.from));
  }, [weeklyJournalNotes]);

  const reportsByDate = useMemo(() => {
    return weeklyJournalHistory.reduce((acc, report) => {
      const dateKeys = getDateKeysInRange(report.from, report.to);
      dateKeys.forEach((dateKey) => {
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(report);
      });
      return acc;
    }, {});
  }, [weeklyJournalHistory]);

  const selectedDateReports = useMemo(
    () => reportsByDate[selectedDateStr] || [],
    [reportsByDate, selectedDateStr]
  );

  const calendarTileIndicators = useMemo(() => {
    const indicatorMap = {};

    normalizedEntries.forEach((entry) => {
      if (!entry?.date) return;
      if (!indicatorMap[entry.date]) {
        indicatorMap[entry.date] = { hasEntries: false, hasReports: false };
      }
      indicatorMap[entry.date].hasEntries = true;
    });

    Object.keys(reportsByDate).forEach((dateKey) => {
      if (!indicatorMap[dateKey]) {
        indicatorMap[dateKey] = { hasEntries: false, hasReports: false };
      }
      indicatorMap[dateKey].hasReports = true;
    });

    return indicatorMap;
  }, [normalizedEntries, reportsByDate]);

  const exportAllReportsToExcel = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const today = toLocalDateString(new Date());

      const formatExcelTime = (time24) => {
        const [hRaw = "0", mRaw = "0"] = (time24 || "00:00").split(":");
        const hour = Number(hRaw);
        const minute = String(Number(mRaw)).padStart(2, "0");
        if (!Number.isFinite(hour)) return "";
        const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
        return `${twelveHour}:${minute}`;
      };

      const formatHourForDtr = (hours) => {
        const value = Number(hours);
        if (!Number.isFinite(value) || value === 0) return "";
        return String(Number(value.toFixed(2)));
      };

      const getHourPart = (time24) => {
        const [hRaw = "0"] = (time24 || "00:00").split(":");
        const hour = Number(hRaw);
        return Number.isFinite(hour) ? hour : 0;
      };

      const monthlyData = normalizedEntries.reduce((acc, entry) => {
        if (!entry?.date) return acc;
        const monthKey = String(entry.date).slice(0, 7);
        const dayNumber = Number(String(entry.date).slice(8, 10));
        if (!monthKey || !dayNumber) return acc;

        if (!acc[monthKey]) {
          acc[monthKey] = {};
        }

        const existing = acc[monthKey][dayNumber] || {
          timeIn: "",
          timeOut: "",
          hours: 0,
        };

        const nextTimeIn = !existing.timeIn || (entry.timeIn || "") < existing.timeIn
          ? (entry.timeIn || existing.timeIn)
          : existing.timeIn;
        const nextTimeOut = !existing.timeOut || (entry.timeOut || "") > existing.timeOut
          ? (entry.timeOut || existing.timeOut)
          : existing.timeOut;

        acc[monthKey][dayNumber] = {
          timeIn: nextTimeIn,
          timeOut: nextTimeOut,
          hours: Number((Number(existing.hours || 0) + Number(entry.hours || 0)).toFixed(2)),
        };

        return acc;
      }, {});

      const monthKeys = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));
      if (monthKeys.length === 0) {
        monthKeys.push(toLocalDateString(new Date()).slice(0, 7));
      }

      monthKeys.forEach((monthKey) => {
        const monthDate = fromDateString(`${monthKey}-01`);
        const monthLabel = monthDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });
        const perDay = monthlyData[monthKey] || {};

        const worksheet = workbook.addWorksheet(`DTR ${monthKey}`.slice(0, 31), {
          views: [{ showGridLines: true }],
        });

        worksheet.columns = [
          { width: 7 },
          { width: 12 },
          { width: 12 },
          { width: 12 },
          { width: 12 },
          { width: 10 },
          { width: 18 },
        ];

        worksheet.mergeCells("A1:G1");
        worksheet.getCell("A1").value = "DAILY TIME RECORD FOR STUDENT INTERNSHIP";
        worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
        worksheet.getCell("A1").font = { bold: true, size: 12 };

        worksheet.getCell("A2").value = "Student Name:";
        worksheet.mergeCells("B2:G2");
        worksheet.getCell("B2").value = profile.name || authUser?.name || "";

        worksheet.getCell("A3").value = "For the month of";
        worksheet.mergeCells("B3:G3");
        worksheet.getCell("B3").value = monthLabel;

        worksheet.mergeCells("A4:G4");
        worksheet.getCell("A4").value = "Official hours for time in and time out";

        worksheet.mergeCells("A5:G5");
        worksheet.getCell("A5").value = "Regular days";

        worksheet.mergeCells("A6:A7");
        worksheet.getCell("A6").value = "Day";

        worksheet.mergeCells("B6:C6");
        worksheet.getCell("B6").value = "A.M.";
        worksheet.mergeCells("D6:E6");
        worksheet.getCell("D6").value = "P.M.";

        worksheet.mergeCells("F6:F7");
        worksheet.getCell("F6").value = "Hours";
        worksheet.mergeCells("G6:G7");
        worksheet.getCell("G6").value = "Signature";

        worksheet.getCell("B7").value = "Time In";
        worksheet.getCell("C7").value = "Time Out";
        worksheet.getCell("D7").value = "Time In";
        worksheet.getCell("E7").value = "Time Out";

        let monthTotalHours = 0;

        for (let day = 1; day <= 31; day += 1) {
          const record = perDay[day];
          const inHour = record?.timeIn ? getHourPart(record.timeIn) : null;
          const outHour = record?.timeOut ? getHourPart(record.timeOut) : null;

          const amIn = record?.timeIn && inHour < 12 ? formatExcelTime(record.timeIn) : "";
          const amOut = record?.timeOut && outHour < 12 ? formatExcelTime(record.timeOut) : "";
          const pmIn = record?.timeIn && inHour >= 12 ? formatExcelTime(record.timeIn) : "";
          const pmOut = record?.timeOut && outHour >= 12 ? formatExcelTime(record.timeOut) : "";
          const dayHours = Number(record?.hours || 0);

          monthTotalHours += dayHours;

          const rowIndex = 7 + day;
          worksheet.getCell(`A${rowIndex}`).value = day;
          worksheet.getCell(`B${rowIndex}`).value = amIn;
          worksheet.getCell(`C${rowIndex}`).value = amOut;
          worksheet.getCell(`D${rowIndex}`).value = pmIn;
          worksheet.getCell(`E${rowIndex}`).value = pmOut;
          worksheet.getCell(`F${rowIndex}`).value = formatHourForDtr(dayHours);
          worksheet.getCell(`G${rowIndex}`).value = "";
        }

        worksheet.mergeCells("D39:E39");
        worksheet.getCell("D39").value = "Total";
        worksheet.getCell("F39").value = formatHourForDtr(monthTotalHours) || "0";

        worksheet.mergeCells("A41:G41");
        worksheet.getCell("A41").value =
          "I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.";
        worksheet.getCell("A41").alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: true,
        };
        worksheet.getRow(41).height = 34;

        worksheet.mergeCells("A43:G43");
        worksheet.getCell("A43").value = "VERIFIED as to the prescribed office hours:";

        worksheet.mergeCells("A45:G45");
        worksheet.getCell("A45").value = "TRAINING OFFICER / IMMEDIATE SUPERVISOR";

        const thinBorder = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        for (let row = 6; row <= 39; row += 1) {
          for (let col = 1; col <= 7; col += 1) {
            const cell = worksheet.getCell(row, col);
            cell.border = thinBorder;
            cell.alignment = {
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
          }
        }

        ["A2", "B2", "A3", "B3", "A4", "A5", "A43"].forEach((address) => {
          worksheet.getCell(address).alignment = { horizontal: "left", vertical: "middle" };
        });

        worksheet.getCell("A45").alignment = { horizontal: "center", vertical: "middle" };
        worksheet.getCell("D39").font = { bold: true };
        worksheet.getCell("F39").font = { bold: true };

        worksheet.pageSetup = {
          orientation: "portrait",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: {
            left: 0.3,
            right: 0.3,
            top: 0.35,
            bottom: 0.35,
            header: 0.2,
            footer: 0.2,
          },
        };
      });

      const weeklyReportRows = weeklyJournalHistory.map((item) => ({
        "Date From": item.from,
        "Date To": item.to,
        "Weekly Report": item.note,
      }));

      const weeklySheet = workbook.addWorksheet("Weekly Reports");
      weeklySheet.columns = [
        { header: "Date From", key: "from", width: 14 },
        { header: "Date To", key: "to", width: 14 },
        { header: "Weekly Report", key: "note", width: 80 },
      ];
      if (weeklyReportRows.length) {
        weeklyReportRows.forEach((item) => {
          weeklySheet.addRow({
            from: item["Date From"],
            to: item["Date To"],
            note: item["Weekly Report"],
          });
        });
      } else {
        weeklySheet.addRow({ from: "", to: "", note: "" });
      }
      weeklySheet.getRow(1).font = { bold: true };
      weeklySheet.getColumn(3).alignment = { wrapText: true, vertical: "top" };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ojt-reports-${today}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setError("");
    } catch {
      setError("Unable to export reports to Excel right now. Please try again.");
    }
  };

  const openWeeklyReportFromCalendar = (item) => {
    setJournalFromDate(item.from);
    setJournalToDate(item.to);
    setJournalInput(item.note || "");
    setEditingJournalKey(null);
    setJournalEditForm({ from: "", to: "", note: "" });
    setActiveTab("journal");
  };

  useEffect(() => {
    setJournalInput(weeklyJournalNotes[currentWeekKey] || "");
  }, [currentWeekKey, weeklyJournalNotes]);

  const persistWeeklyJournalNotes = async (nextJournalNotes) => {
    try {
      if (useDirectSupabase) {
        const uid = authUser?.id;
        if (uid) {
          await directUpdatePreferences(uid, {
            weeklyJournalNotes: nextJournalNotes,
          });
        }
      } else {
        await axios.put(`${API_URL}/preferences`, {
          weeklyJournalNotes: nextJournalNotes,
        });
      }
    } catch {
      // local fallback only
    }

    setWeeklyJournalNotes(nextJournalNotes);
    localStorage.setItem("weeklyJournalNotes", JSON.stringify(nextJournalNotes));
  };

  const saveWeeklyJournal = async () => {
    const nextJournalNotes = {
      ...weeklyJournalNotes,
      [currentWeekKey]: journalInput.trim(),
    };

    await persistWeeklyJournalNotes(nextJournalNotes);
    setError("");
  };

  const startEditWeeklyJournalFromHistory = (item) => {
    setEditingJournalKey(item.key);
    setJournalEditForm({ from: item.from, to: item.to, note: item.note });
  };

  const cancelEditWeeklyJournalFromHistory = () => {
    setEditingJournalKey(null);
    setJournalEditForm({ from: "", to: "", note: "" });
  };

  const saveEditedWeeklyJournalFromHistory = async () => {
    const nextFrom = journalEditForm.from;
    const nextTo = journalEditForm.to;
    const trimmedNote = journalEditForm.note.trim();

    if (!nextFrom || !nextTo) {
      setError("Please set both Date From and Date To for weekly journal.");
      return;
    }

    const normalizedFrom = nextFrom <= nextTo ? nextFrom : nextTo;
    const normalizedTo = nextFrom <= nextTo ? nextTo : nextFrom;
    const nextKey = `${normalizedFrom}__${normalizedTo}`;

    const nextJournalNotes = { ...weeklyJournalNotes };
    if (editingJournalKey) {
      delete nextJournalNotes[editingJournalKey];
    }
    if (trimmedNote) {
      nextJournalNotes[nextKey] = trimmedNote;
    }

    await persistWeeklyJournalNotes(nextJournalNotes);
    setEditingJournalKey(null);
    setJournalEditForm({ from: "", to: "", note: "" });
    setError("");
  };

  const requestDeleteWeeklyJournalFromHistory = (item) => {
    setJournalDeleteTarget(item);
  };

  const confirmDeleteWeeklyJournalFromHistory = async () => {
    if (!journalDeleteTarget?.key) return;

    const nextJournalNotes = { ...weeklyJournalNotes };
    delete nextJournalNotes[journalDeleteTarget.key];
    await persistWeeklyJournalNotes(nextJournalNotes);
    setJournalDeleteTarget(null);
    setError("");
  };

  const shiftJournalRangeByDays = (days) => {
    const from = fromDateString(journalFromDate);
    const to = fromDateString(journalToDate);
    from.setDate(from.getDate() + days);
    to.setDate(to.getDate() + days);
    setJournalFromDate(toLocalDateString(from));
    setJournalToDate(toLocalDateString(to));
  };

  const setJournalToCurrentWeek = () => {
    const today = new Date();
    setJournalFromDate(toLocalDateString(getStartOfWeek(today)));
    setJournalToDate(toLocalDateString(getEndOfWeek(today)));
  };

  if (!authToken) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-sky-100 via-cyan-50 to-emerald-100">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/45 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-20 h-80 w-80 rounded-full bg-emerald-300/35 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-96 -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl" />

        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md rounded-3xl border border-white/50 bg-white/85 p-7 shadow-2xl backdrop-blur-md sm:p-9"
          >
            <div className="mb-7 text-center">
              <p className="text-sm font-semibold tracking-[0.22em] text-cyan-700">OJT TRACKER</p>
              <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">Sign In</h1>
              <p className="mt-2 text-sm text-slate-600">Use Google or an email sign-in link.</p>
            </div>

            {error ? (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {authNotice ? (
              <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                {authNotice}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-linear-to-r from-blue-50 to-blue-100 border-2 border-blue-200 hover:border-blue-400 hover:from-blue-100 hover:to-blue-150 rounded-xl px-4 py-3 font-semibold text-slate-800 transition-all disabled:opacity-60"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.06-1.36-.19-1.96H12.24v4.2h6.49c-.13 1.04-.83 2.61-2.39 3.66l-.02.14 3.42 2.65.24.02c2.2-2.03 3.51-5.01 3.51-8.71z"
                />
                <path
                  fill="#34A853"
                  d="M12.24 23.75c3.18 0 5.84-1.05 7.79-2.86l-3.71-2.87c-.99.69-2.32 1.17-4.08 1.17-3.12 0-5.77-2.03-6.7-4.85l-.13.01-3.56 2.75-.04.12c1.95 3.88 5.97 6.53 10.43 6.53z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.54 14.34a7.14 7.14 0 01-.39-2.34c0-.81.14-1.59.37-2.34l-.01-.16-3.61-2.79-.12.06A11.49 11.49 0 00.5 12c0 1.85.45 3.6 1.28 5.23z"
                />
                <path
                  fill="#EA4335"
                  d="M12.24 4.81c2.22 0 3.71.96 4.56 1.76l3.33-3.25C18.07 1.4 15.42.25 12.24.25 7.78.25 3.76 2.9 1.81 6.78l3.74 2.9c.95-2.82 3.6-4.87 6.69-4.87z"
                />
              </svg>
              {googleLoading ? "Signing in..." : "Continue with Google"}
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-300" />
              <span>OR</span>
              <div className="h-px flex-1 bg-slate-300" />
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email (Outlook supported)
              </label>
              <input
                type="email"
                value={emailAuthForm.email}
                onChange={(e) =>
                  setEmailAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="you@outlook.com"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
                autoComplete="email"
                disabled={emailAuthLoading || googleLoading}
              />
              <button
                type="button"
                onClick={handleSendEmailCode}
                disabled={emailAuthLoading || googleLoading || emailOtpCooldownSecondsLeft > 0}
                className="w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {emailAuthLoading
                  ? "Sending sign-in link..."
                  : emailOtpCooldownSecondsLeft > 0
                    ? `Resend in ${emailOtpCooldownSecondsLeft}s`
                    : "Send sign-in link"}
              </button>
              <p className="text-xs text-slate-500">
                After clicking the email link, you will be redirected back and signed in automatically.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        themeMode === "light"
          ? "bg-linear-to-br from-slate-100 via-white to-slate-100"
          : "bg-linear-to-br from-slate-950 via-slate-900 to-slate-950"
      }`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-300/20 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
          <p className={themeMode === "light" ? "text-slate-700" : "text-slate-300"}>
            Loading your OJT dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme={themeMode}
      className={`min-h-screen flex flex-col p-4 md:p-8 ${
        themeMode === "light"
          ? "bg-linear-to-br from-slate-100 via-white to-slate-100"
          : "bg-linear-to-br from-slate-950 via-slate-900 to-slate-950"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-7xl flex-1"
      >
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-blue-600">
              OJT Dashboard
            </h1>
            <p className={themeMode === "light" ? "mt-2 text-slate-600" : "mt-2 text-slate-300"}>
              Clean tracking for your daily training hours.
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileDropdown((s) => !s)}
              className={`flex items-center gap-3 rounded-full px-2 py-2 text-left shadow ${
                themeMode === "light"
                  ? "border border-slate-300 bg-white hover:border-blue-400"
                  : "border border-slate-700 bg-slate-800 hover:border-cyan-400/50"
              }`}
            >
              {profile.image_url ? (
                <img
                  src={profile.image_url}
                  alt={profile.name}
                  className="h-11 w-11 rounded-full object-cover border-2 border-blue-600"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : null}
              <div className="hidden sm:block pr-3">
                <div className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  {profile.name}
                </div>
                <div className={`text-xs ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                  {profile.position || "OJT Trainee"}
                </div>
              </div>
            </button>

            {showProfileDropdown && (
              <div
                className={`absolute right-0 mt-2 w-96 overflow-hidden rounded-2xl shadow-2xl ${
                  themeMode === "light"
                    ? "border border-slate-200 bg-white"
                    : "border border-slate-700 bg-slate-900"
                }`}
              >
                {/* Header with background */}
                <div className="relative bg-linear-to-r from-cyan-500 to-blue-600 p-6 text-white">
                  {/* Decorative dots */}
                  <div className="absolute bottom-0 right-0 opacity-10">
                    <div className="flex gap-2">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-3 w-3 rounded-full bg-white"></div>
                      ))}
                    </div>
                  </div>

                  {/* Profile Image and Info */}
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="relative h-20 w-20 shrink-0">
                      {profileForm.image_url ? (
                        <img
                          src={profileForm.image_url}
                          alt={profileForm.name}
                          className="h-full w-full rounded-full border-3 border-white object-cover shadow-lg"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center rounded-full border-3 border-white bg-white/20 shadow-lg">
                          <span className="text-2xl font-bold text-white">{initials}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold leading-tight">{profileForm.name || profile.name}</h3>
                      <p className="text-sm text-white/90">{profileForm.position || profile.position || "OJT Trainee"}</p>
                      {profileForm.company && (
                        <p className="mt-1 text-xs text-white/80">{profileForm.company}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Section */}
                <div className={`grid grid-cols-2 gap-4 p-4 ${themeMode === "light" ? "border-b border-slate-200 bg-slate-50" : "border-b border-slate-800 bg-slate-800/50"}`}>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${themeMode === "light" ? "text-cyan-600" : "text-cyan-400"}`}>
                      {loggedDaysCount}
                    </div>
                    <div className={`text-xs font-medium ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                      Logged Days
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${themeMode === "light" ? "text-cyan-600" : "text-cyan-400"}`}>
                      {totalHours.toFixed(1)}h
                    </div>
                    <div className={`text-xs font-medium ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                      Total Hours
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className={`space-y-2 p-4 text-sm ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                  {profileForm.department && (
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>Department:</span>
                      <span>{profileForm.department}</span>
                    </div>
                  )}
                  {profileForm.supervisor && (
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>Supervisor:</span>
                      <span>{profileForm.supervisor}</span>
                    </div>
                  )}
                  {profileForm.email && (
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>Email:</span>
                      <span className="truncate">{profileForm.email}</span>
                    </div>
                  )}
                </div>

                {/* Buttons Section */}
                <div className={`flex gap-2 p-4 ${themeMode === "light" ? "border-t border-slate-200" : "border-t border-slate-800"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      setShowProfileModal(true);
                    }}
                    className="flex-1 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition"
                  >
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      setShowSettings(true);
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Settings
                  </button>
                </div>

                {/* Logout Button */}
                <div className={`px-4 pb-4 ${themeMode === "light" ? "border-t border-slate-200" : "border-t border-slate-800"}`}>
                  <button
                    type="button"
                    onClick={requestLogout}
                    className={`mt-2 w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      themeMode === "light"
                        ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                        : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                    }`}
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="pb-6">

        {error ? (
          <div className="mb-6 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200">
            {error}
          </div>
        ) : null}

        <div
          className={`mb-6 inline-flex rounded-lg p-1 ${
            themeMode === "light" ? "border border-slate-300 bg-white" : "border border-slate-700 bg-slate-900"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "dashboard"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "calendar"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("journal")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "journal"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Weekly Report
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGoalModal(true)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              themeMode === "light"
                ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            Set Required OJT Hours
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !showGoalProgress;
              setShowGoalProgress(next);
              localStorage.setItem(
                "ojtGoal",
                JSON.stringify({ requiredHours: requiredOjtHours, showGoalProgress: next })
              );
            }}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              themeMode === "light"
                ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            {showGoalProgress ? "Hide OJT Goal" : "Show OJT Goal"}
          </button>
        </div>

        {showGoalProgress && (
          <div
            className={`mb-6 rounded-xl p-4 shadow ${
              themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Required OJT Hours</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-slate-900" : "text-2xl font-bold text-slate-100"}>{requiredOjtHours.toFixed(2)}h</p>
              </div>
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Completed</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-sky-600" : "text-2xl font-bold text-cyan-300"}>{totalHours.toFixed(2)}h</p>
              </div>
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Remaining</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-amber-600" : "text-2xl font-bold text-amber-300"}>{remainingHours.toFixed(2)}h</p>
              </div>
            </div>
            <div className="mt-4">
              <div className={`mb-1 flex items-center justify-between text-xs ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>
                <span>Progress</span>
                <span>{progressPercent.toFixed(1)}%</span>
              </div>
              <div className={`h-2 w-full rounded-full ${themeMode === "light" ? "bg-slate-200" : "bg-slate-800"}`}>
                <div
                  className="h-2 rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Hours", value: `${totalHours.toFixed(2)}h` },
            { label: "Entries", value: `${normalizedEntries.length}` },
            {
              label: "Avg Daily",
              value: `${averageDailyHours.toFixed(2)}h`,
            },
            {
              label: "Logged Days",
              value: `${loggedDaysCount}`,
            },
          ].map((item) => (
            <motion.div
              key={item.label}
              whileHover={{ y: -3 }}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow transition-shadow hover:shadow-lg"
            >
              <div className="text-sm text-slate-400">{item.label}</div>
              <div className="text-3xl font-bold text-slate-100">{item.value}</div>
            </motion.div>
          ))}
            </div>

            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow transition-shadow hover:shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-100">Overall Hours Trend</h3>
          <Suspense
            fallback={
              <div className="grid h-65 place-items-center text-sm text-slate-400">
                Loading chart...
              </div>
            }
          >
            <TrendChart data={overallTrendData} />
          </Suspense>
            </div>

            <button
          type="button"
          onClick={openAddModal}
          className="mb-8 w-full rounded-xl bg-cyan-500 px-4 py-3 text-lg font-bold text-slate-950 shadow hover:bg-cyan-400"
        >
          + Add New Entry
            </button>

            <div
              className={`overflow-hidden rounded-2xl shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-800 bg-slate-900"
              } transition-shadow hover:shadow-lg`}
            >
          <div className={`px-6 py-4 ${themeMode === "light" ? "border-b border-slate-200" : "border-b border-slate-800"}`}>
            <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
              OJT Entries
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={themeMode === "light" ? "bg-slate-100 text-slate-700" : "bg-slate-800/70 text-slate-200"}>
                <tr>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">Day</th>
                  <th className="p-4 text-left">In</th>
                  <th className="p-4 text-left">Out</th>
                  <th className="p-4 text-left">Hours</th>
                  <th className="p-4 text-left">Notes</th>
                  <th className="p-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td className="p-8 text-center text-slate-400" colSpan="7">
                      No entries yet. Add your first one.
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry) => (
                    <tr
                      key={getEntryId(entry)}
                      className={
                        themeMode === "light"
                          ? "border-t border-slate-200 hover:bg-slate-50"
                          : "border-t border-slate-800 hover:bg-slate-800/40"
                      }
                    >
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-200"}`}>{entry.date}</td>
                      <td className={`p-4 font-medium ${themeMode === "light" ? "text-slate-600" : "text-slate-300"}`}>{entry.day || "-"}</td>
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{formatTimeDisplay(entry.timeIn)}</td>
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{formatTimeDisplay(entry.timeOut)}</td>
                      <td className={`p-4 font-semibold ${themeMode === "light" ? "text-blue-600" : "text-cyan-300"}`}>
                        {Number(entry.hours || 0).toFixed(2)}h
                      </td>
                      <td className={`max-w-xs truncate p-4 ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                        {entry.notes || "-"}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className={
                              themeMode === "light"
                                ? "rounded-md bg-blue-100 px-2 py-1 text-blue-700 hover:bg-blue-200"
                                : "rounded-md bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteEntry(entry)}
                            className={
                              themeMode === "light"
                                ? "rounded-md bg-rose-100 px-2 py-1 text-rose-700 hover:bg-rose-200"
                                : "rounded-md bg-rose-500/20 px-2 py-1 text-rose-300 hover:bg-rose-500/30"
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
            </div>
          </>
        )}

        {activeTab === "calendar" && (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div className={`rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"}`}>
              <h3 className={`mb-4 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Training Calendar</h3>
              <div className={`calendar-wrapper calendar-wrapper--large rounded-xl p-3 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800"}`}>
                <Suspense
                  fallback={
                    <div className="grid h-90 place-items-center text-sm text-slate-500">
                      Loading calendar...
                    </div>
                  }
                >
                  <Calendar
                    value={selectedDate}
                    onChange={handleDateSelect}
                    onClickDay={handleDateSelect}
                    maxDate={new Date()}
                    tileClassName={({ date, view }) => {
                      if (view !== "month") return "";
                      const dateKey = toLocalDateString(date);
                      const status = calendarTileIndicators[dateKey];
                      if (!status) return "";
                      if (status.hasEntries && status.hasReports) return "calendar-day-has-both";
                      if (status.hasEntries) return "calendar-day-has-entries";
                      if (status.hasReports) return "calendar-day-has-reports";
                      return "";
                    }}
                    tileContent={({ date, view }) => {
                      if (view !== "month") return null;
                      const dateKey = toLocalDateString(date);
                      const status = calendarTileIndicators[dateKey];
                      if (!status?.hasEntries && !status?.hasReports) return null;

                      return (
                        <div className="calendar-day-indicators" aria-hidden="true">
                          {status.hasEntries ? <span className="calendar-day-indicator calendar-day-indicator--entry" /> : null}
                          {status.hasReports ? <span className="calendar-day-indicator calendar-day-indicator--report" /> : null}
                        </div>
                      );
                    }}
                  />
                </Suspense>
              </div>
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 w-full rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Add Entry for Selected Date
              </button>
            </div>

            <div className={`rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"}`}>
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Entries on {toLocalDateString(selectedDate)}</h3>
              <div className="mt-4 space-y-3">
                {selectedDateEntries.length === 0 ? (
                  <p className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>No entries for this date.</p>
                ) : (
                  selectedDateEntries.map((entry) => (
                    <div
                      key={getEntryId(entry)}
                      className={`rounded-lg p-4 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                          {formatTimeDisplay(entry.timeIn)} - {formatTimeDisplay(entry.timeOut)}
                        </p>
                        <p className={`font-semibold ${themeMode === "light" ? "text-sky-600" : "text-cyan-300"}`}>{Number(entry.hours || 0).toFixed(2)}h</p>
                      </div>
                      <p className={`mt-1 text-sm ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>{entry.notes || "No notes"}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(entry)}
                          className="rounded-md bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteEntry(entry)}
                          className="rounded-md bg-rose-500/20 px-2 py-1 text-rose-300 hover:bg-rose-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className={`mt-6 border-t pt-4 ${themeMode === "light" ? "border-slate-200" : "border-slate-700"}`}>
                <h4 className={`text-lg font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  Weekly Reports Covering {selectedDateStr}
                </h4>
                <div className="mt-3 space-y-3">
                  {selectedDateReports.length === 0 ? (
                    <p className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>
                      No weekly reports include this date.
                    </p>
                  ) : (
                    selectedDateReports.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => openWeeklyReportFromCalendar(item)}
                        className={`w-full rounded-lg p-3 text-left transition ${themeMode === "light" ? "border border-slate-200 bg-slate-50 hover:bg-slate-100" : "border border-slate-700 bg-slate-800 hover:bg-slate-700"}`}
                      >
                        <p className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-100"}`}>
                          {item.from} to {item.to}
                        </p>
                        <p className={`mt-1 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-300"}`}>
                          {item.note}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "journal" && (
          <div
            className={`rounded-2xl p-6 shadow ${
              themeMode === "light"
                ? "border border-slate-200 bg-white"
                : "border border-slate-800 bg-slate-900"
            }`}
          >
            <div
              className={`mb-8 rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-slate-50"
                  : "border border-slate-700 bg-slate-800/40"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  Weekly Report
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftJournalRangeByDays(-7)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={setJournalToCurrentWeek}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    This Week
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftJournalRangeByDays(7)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>

              <p className={`mb-3 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Week: {currentWeekLabel}
              </p>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Date From
                  </label>
                  <input
                    type="date"
                    value={journalFromDate}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setJournalFromDate(nextFrom);
                      if (nextFrom > journalToDate) {
                        setJournalToDate(nextFrom);
                      }
                    }}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Date To
                  </label>
                  <input
                    type="date"
                    value={journalToDate}
                    onChange={(e) => {
                      const nextTo = e.target.value;
                      setJournalToDate(nextTo);
                      if (nextTo < journalFromDate) {
                        setJournalFromDate(nextTo);
                      }
                    }}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  />
                </div>
              </div>
              <textarea
                value={journalInput}
                onChange={(e) => setJournalInput(e.target.value)}
                placeholder="Write your weekly accomplishments, blockers, and plans..."
                rows={6}
                className={`w-full rounded-lg px-3 py-2 placeholder-slate-500 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveWeeklyJournal}
                  className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Weekly Report
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Saved Weekly Reports
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                  {weeklyJournalHistory.length} saved
                </span>
                <button
                  type="button"
                  onClick={exportAllReportsToExcel}
                  className="rounded-md bg-cyan-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Download Excel
                </button>
              </div>
            </div>

            {weeklyJournalHistory.length === 0 ? (
              <p className={themeMode === "light" ? "text-slate-600" : "text-slate-400"}>
                No weekly reports saved yet. Use Save Weekly Journal above.
              </p>
            ) : (
              <div className="space-y-3">
                {weeklyJournalHistory.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-xl p-4 ${
                      themeMode === "light"
                        ? "border border-slate-200 bg-slate-50"
                        : "border border-slate-700 bg-slate-800"
                    }`}
                  >
                    {editingJournalKey === item.key ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className={`mb-1 block text-xs font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                              Date From
                            </label>
                            <input
                              type="date"
                              value={journalEditForm.from}
                              onChange={(e) => setJournalEditForm((prev) => ({ ...prev, from: e.target.value }))}
                              className={`w-full rounded-lg px-2 py-2 text-sm ${
                                themeMode === "light"
                                  ? "border border-slate-300 bg-white text-slate-900"
                                  : "border border-slate-700 bg-slate-800 text-slate-100"
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`mb-1 block text-xs font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                              Date To
                            </label>
                            <input
                              type="date"
                              value={journalEditForm.to}
                              onChange={(e) => setJournalEditForm((prev) => ({ ...prev, to: e.target.value }))}
                              className={`w-full rounded-lg px-2 py-2 text-sm ${
                                themeMode === "light"
                                  ? "border border-slate-300 bg-white text-slate-900"
                                  : "border border-slate-700 bg-slate-800 text-slate-100"
                              }`}
                            />
                          </div>
                        </div>
                        <textarea
                          value={journalEditForm.note}
                          onChange={(e) => setJournalEditForm((prev) => ({ ...prev, note: e.target.value }))}
                          rows={4}
                          className={`w-full rounded-lg px-3 py-2 text-sm ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditWeeklyJournalFromHistory}
                            className={
                              themeMode === "light"
                                ? "rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                : "rounded-md bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                            }
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEditedWeeklyJournalFromHistory}
                            className="rounded-md bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                            {item.from} to {item.to}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditWeeklyJournalFromHistory(item)}
                              className={
                                themeMode === "light"
                                  ? "rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                                  : "rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30"
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteWeeklyJournalFromHistory(item)}
                              className={
                                themeMode === "light"
                                  ? "rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                  : "rounded-md bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/30"
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className={`whitespace-pre-wrap text-sm ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                          {item.note}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {journalDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setJournalDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`mb-2 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Delete Weekly Journal
              </h3>
              <p className={`mb-4 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to delete this journal entry for
                <span className={`ml-1 font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                  {journalDeleteTarget.from} to {journalDeleteTarget.to}
                </span>
                ?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setJournalDeleteTarget(null)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteWeeklyJournalFromHistory}
                  className="flex-1 rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>

          </div>
        )}

        {entryDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setEntryDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`mb-2 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Delete OJT Entry
              </h3>
              <p className={`mb-2 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to delete this entry?
              </p>
              <p className={`mb-4 text-sm font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                {entryDeleteTarget.date} • {formatTimeDisplay(entryDeleteTarget.timeIn)} - {formatTimeDisplay(entryDeleteTarget.timeOut)}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEntryDeleteTarget(null)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteEntry}
                  className="flex-1 rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={handleCloseModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-2xl rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h2 className={`mb-4 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                {editingId ? "Edit Entry" : "Add Entry"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Date</label>
                    <div className={`calendar-wrapper rounded-xl p-3 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800/60"}`}>
                      <Suspense
                        fallback={
                          <div className="grid h-70 place-items-center text-sm text-slate-500">
                            Loading calendar...
                          </div>
                        }
                      >
                        <Calendar
                          value={selectedDate}
                          onChange={handleDateSelect}
                          maxDate={new Date()}
                        />
                      </Suspense>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Time In</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={timeIn12.hour}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, hour: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const hourValue = String(i + 1).padStart(2, "0");
                            return (
                              <option key={hourValue} value={hourValue}>
                                {hourValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeIn12.minute}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, minute: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 60 }, (_, i) => {
                            const minuteValue = String(i).padStart(2, "0");
                            return (
                              <option key={minuteValue} value={minuteValue}>
                                {minuteValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeIn12.period}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, period: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Time Out</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={timeOut12.hour}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, hour: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const hourValue = String(i + 1).padStart(2, "0");
                            return (
                              <option key={hourValue} value={hourValue}>
                                {hourValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeOut12.minute}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, minute: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 60 }, (_, i) => {
                            const minuteValue = String(i).padStart(2, "0");
                            return (
                              <option key={minuteValue} value={minuteValue}>
                                {minuteValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeOut12.period}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, period: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Day of Week</label>
                      <input
                        type="text"
                        value={form.day}
                        readOnly
                        className={`w-full rounded-lg px-3 py-2 ${
                          themeMode === "light"
                            ? "border border-slate-300 bg-slate-100 text-slate-900"
                            : "border border-slate-700 bg-slate-800 text-slate-100"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Notes</label>
                      <input
                        type="text"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Optional notes"
                        className={`w-full rounded-lg px-3 py-2 placeholder-slate-500 ${
                          themeMode === "light"
                            ? "border border-slate-300 bg-white text-slate-900"
                            : "border border-slate-700 bg-slate-800 text-slate-100"
                        }`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className={`flex-1 rounded-lg py-2 font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    {editingId ? "Update Entry" : "Add Entry"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`settings-modal w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-300 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h2 className={`mb-5 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Settings
              </h2>
              <div className="space-y-4">
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-700"
                      : "border border-slate-700 bg-slate-800 text-slate-200"
                  }`}
                >
                  Half-day break: {HALFDAY_BREAK_MINUTES} minutes (auto-applies to shifts up to {HALFDAY_MAX_SHIFT_HOURS} hours)
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Start Hour
                  </label>
                  <select
                    value={lunchStart}
                    onChange={(e) => setLunchStart(Number(e.target.value))}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    End Hour
                  </label>
                  <select
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(Number(e.target.value))}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Theme
                  </label>
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100"
                      : "border border-slate-700 bg-slate-800"
                  }`}>
                    <span className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-200"}`}>
                      {themeMode === "dark" ? "Dark Mode" : "Light Mode"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={themeMode === "dark"}
                      aria-label="Toggle theme mode"
                      onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                      className={`theme-switch ${themeMode === "dark" ? "theme-switch--dark" : "theme-switch--light"}`}
                    >
                      <span className="theme-switch__icon theme-switch__icon--sun">☀</span>
                      <span className="theme-switch__icon theme-switch__icon--moon">☾</span>
                      <span className="theme-switch__thumb" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveLunchSettings}
                  className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => {
              setShowProfileModal(false);
              setImagePreview(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-700 bg-slate-900"}`}
            >
              <h2 className={`mb-5 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Edit Profile</h2>
              
              {/* Profile Image Upload Section */}
              <div className="mb-6 space-y-3">
                <label className={`block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Profile Picture</label>
                <div className="flex items-center gap-4">
                  <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 ${
                    imagePreview || profileForm.image_url
                      ? "border-cyan-500"
                      : themeMode === "light"
                      ? "border-slate-300"
                      : "border-slate-700"
                  }`}>
                    {imagePreview || profileForm.image_url ? (
                      <img
                        src={imagePreview || profileForm.image_url}
                        alt="Profile preview"
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className={`text-2xl font-bold ${themeMode === "light" ? "text-slate-400" : "text-slate-500"}`}>
                        {profile.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfileImageChange}
                      className="hidden"
                    />
                    <div className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition cursor-pointer">
                      Choose Image
                    </div>
                  </label>
                </div>
                <p className={`text-xs ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>
                  Max 5MB. Supported: JPG, PNG, GIF, WebP
                </p>
              </div>
              
              <div className="space-y-3">
                {[
                  ["name", "Full Name"],
                  ["position", "Position"],
                  ["company", "Company"],
                  ["department", "Department"],
                  ["email", "Email"],
                  ["supervisor", "Supervisor"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{label}</label>
                    <input
                      type={key === "email" ? "email" : "text"}
                      value={profileForm[key] || ""}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`w-full rounded-lg px-3 py-2 ${
                        themeMode === "light"
                          ? "border border-slate-300 bg-white text-slate-900"
                          : "border border-slate-700 bg-slate-800 text-slate-100"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setImagePreview(null);
                  }}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfile}
                  className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showGoalModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowGoalModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-700 bg-slate-900"}`}
            >
              <h2 className={`mb-2 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>OJT Required Hours</h2>
              <p className={`mb-4 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Set how many total hours you need to complete your OJT.
              </p>
              <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Required Hours</label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveGoalSettings}
                  className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Goal
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showLoginSplash && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`text-2xl font-black ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Setup Your OJT Goal
              </h3>
              <p className={`mt-3 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-300"}`}>
                Hi {profile.name || authUser?.name || "Trainee"}, set how many total OJT hours you need (example: 500 or 600).
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[500, 600, 700].map((hoursPreset) => (
                  <button
                    key={hoursPreset}
                    type="button"
                    onClick={() => setGoalInput(String(hoursPreset))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      Number(goalInput) === hoursPreset
                        ? "bg-cyan-500 text-slate-950"
                        : themeMode === "light"
                          ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {hoursPreset}h
                  </button>
                ))}
              </div>

              <label className={`mt-4 mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                Required OJT Hours
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />
              <p className={`mt-2 text-xs ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>
                Current required hours: {toValidRequiredOjtHours(goalInput).toFixed(2)}h
              </p>

              <button
                type="button"
                onClick={saveInitialGoalSetup}
                className="mt-5 w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Save and Continue
              </button>
            </motion.div>
          </div>
        )}

        {showLogoutConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Logout Confirmation
              </h3>
              <p className={`mt-2 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to logout?
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className={`rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Yes
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </main>
      </motion.div>

      <footer
        className={`mx-auto mt-4 w-full max-w-7xl rounded-xl px-4 py-3 ${
          themeMode === "light"
            ? "border border-slate-200 bg-white/90 text-slate-600"
            : "border border-slate-800 bg-slate-900/80 text-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>Personal OJT Tracker</p>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/KewnsR/PersonalOJTTracker"
              target="_blank"
              rel="noreferrer"
              className={`text-xs font-semibold underline-offset-2 transition hover:underline ${
                themeMode === "light"
                  ? "text-slate-700 hover:text-blue-600"
                  : "text-slate-200 hover:text-cyan-300"
              }`}
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
