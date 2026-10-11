import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState } from "react";
import {
  createBrowserTab,
  embedUrl,
  GOOGLE_HOME,
  isGooglePage,
  labelForUrl,
  MAX_BROWSER_TABS,
  omniboxText,
  pageKey,
  resolveBrowserInput,
} from "../browser.js";

const LIMIT_NOTICE = "Close a tab before opening another. Open tabs stay running.";

const INITIAL = { visible: false, tabs: [], activeId: null, notice: "" };

function browserReducer(state, action) {
  switch (action.type) {
    case "show": {
      if (state.tabs.length) {
        return { ...state, visible: true, notice: "" };
      }
      if (!action.tab) {
        return state;
      }
      return { visible: true, notice: "", tabs: [action.tab], activeId: action.tab.id };
    }
    case "open": {
      const key = pageKey(action.url);
      const google = key === pageKey(GOOGLE_HOME);
      const existing = state.tabs.find((tab) =>
        google ? isGooglePage(tab.entryUrl) : pageKey(tab.entryUrl) === key,
      );
      if (existing) {
        return { ...state, visible: true, notice: "", activeId: existing.id };
      }
      if (state.tabs.length >= MAX_BROWSER_TABS || !action.tab) {
        return { ...state, visible: true, notice: LIMIT_NOTICE };
      }
      return {
        visible: true,
        notice: "",
        activeId: action.tab.id,
        tabs: [...state.tabs, action.tab],
      };
    }
    case "new": {
      if (state.tabs.length >= MAX_BROWSER_TABS || !action.tab) {
        return { ...state, notice: LIMIT_NOTICE };
      }
      return {
        ...state,
        visible: true,
        notice: "",
        activeId: action.tab.id,
        tabs: [...state.tabs, action.tab],
      };
    }
    case "select":
      return { ...state, activeId: action.id };
    case "hide":
      return { ...state, visible: false };
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      if (index < 0) {
        return state;
      }
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      let activeId = state.activeId;
      if (activeId === action.id) {
        activeId = (tabs[index] || tabs[index - 1] || null)?.id ?? null;
      }
      return { ...state, tabs, activeId, visible: tabs.length > 0 && state.visible };
    }
    case "visit":
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.id) {
            return tab;
          }
          const history = tab.history.slice(0, tab.index + 1);
          if (history[history.length - 1] !== action.url) {
            history.push(action.url);
          }
          return {
            ...tab,
            entryUrl: action.url,
            history,
            index: history.length - 1,
            title: labelForUrl(action.url),
            loading: true,
            reloadKey: action.reload ? (tab.reloadKey || 0) + 1 : tab.reloadKey || 0,
          };
        }),
      };
    case "travel":
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.id) {
            return tab;
          }
          const index = tab.index + action.delta;
          if (index < 0 || index >= tab.history.length) {
            return tab;
          }
          const entryUrl = tab.history[index];
          return { ...tab, index, entryUrl, title: labelForUrl(entryUrl), loading: true };
        }),
      };
    case "reload":
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id ? { ...tab, loading: true, reloadKey: (tab.reloadKey || 0) + 1 } : tab,
        ),
      };
    case "loaded":
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, loading: false } : tab)),
      };
    default:
      return state;
  }
}

const InAppBrowser = forwardRef(function InAppBrowser(_props, ref) {
  const [state, dispatch] = useReducer(browserReducer, INITIAL);
  const [draft, setDraft] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const inputRef = useRef(null);
  const stateRef = useRef(state);
  const active = state.tabs.find((tab) => tab.id === state.activeId) ?? null;
  const activeId = active?.id ?? "";
  const activeUrl = active?.entryUrl ?? "";
  const tabKey = `${activeId}:${activeUrl}`;
  const fieldValue = draftKey === tabKey ? draft : omniboxText(activeUrl);

  useImperativeHandle(
    ref,
    () => ({
      show() {
        const tab = stateRef.current.tabs.length ? null : createBrowserTab(GOOGLE_HOME, "Google");
        dispatch({ type: "show", tab });
      },
      openUrl(raw, title) {
        const url = resolveBrowserInput(raw);
        if (!url) {
          return;
        }
        const key = pageKey(url);
        const google = key === pageKey(GOOGLE_HOME);
        const exists = stateRef.current.tabs.some((tab) =>
          google ? isGooglePage(tab.entryUrl) : pageKey(tab.entryUrl) === key,
        );
        const tab = exists ? null : createBrowserTab(url, title || labelForUrl(url));
        dispatch({ type: "open", url, tab });
      },
    }),
    [],
  );

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!state.visible) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === "Escape") {
        dispatch({ type: "hide" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.visible]);

  useEffect(() => {
    if (!state.visible) {
      return undefined;
    }
    const current = stateRef.current;
    const tab = current.tabs.find((item) => item.id === current.activeId);
    if (!tab || !isGoogleHome(tab.entryUrl)) {
      return undefined;
    }
    const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [state.visible]);

  const hide = () => {
    dispatch({ type: "hide" });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const newTab = () => {
    if (stateRef.current.tabs.length >= MAX_BROWSER_TABS) {
      dispatch({ type: "new", tab: null });
      return;
    }
    dispatch({ type: "new", tab: createBrowserTab(GOOGLE_HOME, "Google") });
  };

  const submit = (event) => {
    event.preventDefault();
    if (!active) {
      return;
    }
    const next = resolveBrowserInput(fieldValue);
    if (!next) {
      return;
    }
    dispatch({ type: "visit", id: active.id, url: next, reload: next === active.entryUrl });
    inputRef.current?.blur();
  };

  if (!state.tabs.length) {
    return null;
  }

  return (
    <div className={`inapp-shell${state.visible ? "" : " is-parked"}`} inert={state.visible ? undefined : true}>
      <header className="inapp-top">
        <button type="button" className="inapp-back" onClick={hide}>
          <span className="inapp-chevron" aria-hidden="true" />
          Chat
        </button>
        <h2 className="inapp-heading">{active?.title || "Search"}</h2>
        <button type="button" className="inapp-new" onClick={newTab} aria-label="New tab">
          +
        </button>
      </header>

      <div className="inapp-tabs" role="tablist" aria-label="Open pages">
        {state.tabs.map((tab) => {
          const selected = tab.id === state.activeId;
          return (
            <div key={tab.id} className={`inapp-tab${selected ? " is-active" : ""}`}>
              <button
                type="button"
                className="inapp-tab-main"
                role="tab"
                aria-selected={selected}
                onClick={() => dispatch({ type: "select", id: tab.id })}
                title={tab.title}
              >
                <span className="inapp-mark" aria-hidden="true">
                  {(tab.title || "G").slice(0, 1).toUpperCase()}
                </span>
                <span className="inapp-tab-title">{tab.title}</span>
              </button>
              <button
                type="button"
                className="inapp-tab-close"
                aria-label={`Close ${tab.title}`}
                onClick={() => dispatch({ type: "close", id: tab.id })}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <form className="inapp-omnibox" onSubmit={submit}>
        <span className="inapp-glyph" aria-hidden="true">
          <span className="inapp-glyph-ring" />
          <span className="inapp-glyph-handle" />
        </span>
        <input
          ref={inputRef}
          className="inapp-input"
          value={fieldValue}
          onChange={(event) => {
            setDraftKey(tabKey);
            setDraft(event.target.value);
          }}
          onFocus={(event) => event.target.select()}
          placeholder="Search Google or type a URL"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Search Google or type a URL"
        />
        {fieldValue ? (
          <button
            type="button"
            className="inapp-clear"
            aria-label="Clear search"
            onClick={() => {
              setDraftKey(tabKey);
              setDraft("");
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
        <button className="inapp-go" type="submit">
          Search
        </button>
      </form>

      {state.notice ? (
        <p className="inapp-notice" role="status">
          {state.notice}
        </p>
      ) : null}

      <div className="inapp-tools">
        <button
          type="button"
          className="inapp-tool"
          onClick={() => active && dispatch({ type: "travel", id: active.id, delta: -1 })}
          disabled={!active || active.index <= 0}
          aria-label="Back"
        >
          ←
        </button>
        <button
          type="button"
          className="inapp-tool"
          onClick={() => active && dispatch({ type: "travel", id: active.id, delta: 1 })}
          disabled={!active || active.index >= active.history.length - 1}
          aria-label="Forward"
        >
          →
        </button>
        <button
          type="button"
          className="inapp-tool inapp-tool-end"
          onClick={() => active && dispatch({ type: "reload", id: active.id })}
          aria-label="Reload"
        >
          ↻
        </button>
      </div>

      <div className="inapp-progress" aria-hidden="true">
        {active?.loading ? <span /> : null}
      </div>

      {/* Frames stay mounted at full size. The active tab is stacked on top,
          so switching does not unload the others. */}
      <div className="inapp-pages">
        {state.tabs.map((tab) => (
          <iframe
            key={`${tab.id}:${tab.reloadKey || 0}`}
            className={`inapp-frame${tab.id === state.activeId ? " is-active" : ""}`}
            src={embedUrl(tab.entryUrl)}
            title={tab.title}
            loading="eager"
            referrerPolicy="origin"
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
            onLoad={() => dispatch({ type: "loaded", id: tab.id })}
          />
        ))}
      </div>
    </div>
  );
});

function isGoogleHome(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "google.com" && parsed.pathname === "/";
  } catch {
    return false;
  }
}

export default InAppBrowser;
