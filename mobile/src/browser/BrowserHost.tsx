import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerBrowserLock } from '../appLock';
import {
  allowInAppNavigation,
  BROWSER_USER_AGENT,
  BrowserTab,
  createBrowserTab,
  GOOGLE_HOME,
  labelForUrl,
  friendlyOmnibox,
  isBareGoogle,
  isGooglePage,
  MAX_BROWSER_TABS,
  niceTitle,
  pageKey,
  resolveBrowserInput,
} from './url';
import { shouldBlockYoutubeAd, YOUTUBE_AD_SCRIPT } from './youtubeAds';

type BrowserApi = {
  show: () => void;
  openUrl: (url: string, title?: string) => void;
};

type Session = {
  visible: boolean;
  tabs: BrowserTab[];
  activeId: string | null;
};

const BrowserApiContext = createContext<React.MutableRefObject<BrowserApi> | null>(null);

const EMPTY_SESSION: Session = { visible: false, tabs: [], activeId: null };

let browserOpen = false;

export function isBrowserOpen() {
  return browserOpen;
}

export function useBrowserApi() {
  const apiRef = useContext(BrowserApiContext);
  if (!apiRef) {
    throw new Error('Search is only available inside the app shell');
  }
  return apiRef;
}

export function BrowserProvider({ children }: { children: React.ReactNode }) {
  const apiRef = useRef<BrowserApi>({
    show: () => {},
    openUrl: () => {},
  });

  return (
    <BrowserApiContext.Provider value={apiRef}>
      <View style={styles.host}>
        <View style={styles.host}>{children}</View>
        <InAppBrowser apiRef={apiRef} />
      </View>
    </BrowserApiContext.Provider>
  );
}

function SearchGlyph() {
  return (
    <View style={styles.glyph}>
      <View style={styles.glyphRing} />
      <View style={styles.glyphHandle} />
    </View>
  );
}

function InAppBrowser({ apiRef }: { apiRef: React.MutableRefObject<BrowserApi> }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [session, setSession] = useState<Session>(EMPTY_SESSION);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [tabsOpen, setTabsOpen] = useState(false);
  const webRefs = useRef<Record<string, { goBack: () => void; goForward: () => void; reload: () => void } | null>>({});
  const stripRef = useRef<ScrollView>(null);
  const tabX = useRef<Record<string, number>>({});
  const sessionRef = useRef(session);
  sessionRef.current = session;
  browserOpen = session.visible;
  const fieldRef = useRef<TextInput>(null);
  const wantSearchFocus = useRef(false);
  const concealedVisible = useRef(false);

  const active = session.tabs.find(tab => tab.id === session.activeId) ?? null;

  const show = useCallback(() => {
    setEditing(false);
    setDraft('');
    setTabsOpen(false);
    wantSearchFocus.current = true;
    setSession(current => {
      const blank = current.tabs.find(tab => !tab.entryUrl);
      if (blank) {
        return { ...current, visible: true, activeId: blank.id };
      }
      if (current.tabs.length >= MAX_BROWSER_TABS) {
        return { ...current, visible: true };
      }
      const tab = createBrowserTab('', 'Search');
      return { visible: true, tabs: [...current.tabs, tab], activeId: tab.id };
    });
  }, []);

  const conceal = useCallback(() => {
    concealedVisible.current = sessionRef.current.visible;
    if (!sessionRef.current.visible) {
      return;
    }
    Keyboard.dismiss();
    setEditing(false);
    setSession(current => ({ ...current, visible: false }));
  }, []);

  const restore = useCallback(() => {
    if (!concealedVisible.current) {
      return;
    }
    concealedVisible.current = false;
    setSession(current => (current.tabs.length ? { ...current, visible: true } : current));
  }, []);

  const openUrl = useCallback((raw: string, title?: string) => {
    const url = resolveBrowserInput(raw);
    if (!url) {
      return;
    }
    const key = pageKey(url);
    const google = key === pageKey(GOOGLE_HOME);
    const matches = (entryUrl: string) => (google ? isGooglePage(entryUrl) : pageKey(entryUrl) === key);
    const alreadyOpen = sessionRef.current.tabs.some(tab => matches(tab.entryUrl));
    if (!alreadyOpen && sessionRef.current.tabs.length >= MAX_BROWSER_TABS) {
      Alert.alert('Too many tabs', 'Close a tab before opening another. Open tabs stay running.');
      setSession(current => ({ ...current, visible: true }));
      return;
    }
    const tab = alreadyOpen ? null : createBrowserTab(url, title || labelForUrl(url));
    setEditing(false);
    setSession(current => {
      const existing = current.tabs.find(item => matches(item.entryUrl));
      if (existing) {
        return { ...current, visible: true, activeId: existing.id };
      }
      if (!tab || current.tabs.length >= MAX_BROWSER_TABS) {
        return { ...current, visible: true };
      }
      return { visible: true, activeId: tab.id, tabs: [...current.tabs, tab] };
    });
  }, []);

  useEffect(() => {
    apiRef.current.show = show;
    apiRef.current.openUrl = openUrl;
    registerBrowserLock(conceal, restore);
  }, [apiRef, show, openUrl, conceal, restore]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = sessionRef.current;
      if (!current.visible) {
        return false;
      }
      const tab = current.tabs.find(item => item.id === current.activeId);
      if (tab?.canGoBack) {
        webRefs.current[tab.id]?.goBack();
        return true;
      }
      setSession(prev => ({ ...prev, visible: false }));
      return true;
    });
    return () => sub.remove();
  }, []);

  const resting = friendlyOmnibox(active?.currentUrl || active?.entryUrl || '');
  const fieldValue = editing ? draft : resting;

  useEffect(() => {
    if (!session.visible || !wantSearchFocus.current) {
      return;
    }
    wantSearchFocus.current = false;
    const tab = session.tabs.find(item => item.id === session.activeId);
    if (tab?.entryUrl) {
      return;
    }
    const handle = setTimeout(() => fieldRef.current?.focus(), 80);
    return () => clearTimeout(handle);
  }, [session.visible, session.activeId, session.tabs]);

  useEffect(() => {
    if (!session.activeId) {
      return;
    }
    const x = tabX.current[session.activeId];
    if (x == null) {
      return;
    }
    stripRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [session.activeId, session.tabs.length]);

  const hide = useCallback(() => {
    Keyboard.dismiss();
    setEditing(false);
    setSession(current => ({ ...current, visible: false }));
  }, []);

  const selectTab = useCallback((id: string) => {
    Keyboard.dismiss();
    setEditing(false);
    setSession(current => ({ ...current, activeId: id }));
  }, []);

  const closeTab = useCallback((id: string) => {
    delete webRefs.current[id];
    setSession(current => {
      const index = current.tabs.findIndex(tab => tab.id === id);
      if (index < 0) {
        return current;
      }
      const tabs = current.tabs.filter(tab => tab.id !== id);
      let activeId = current.activeId;
      if (activeId === id) {
        activeId = (tabs[index] || tabs[index - 1] || null)?.id ?? null;
      }
      return {
        ...current,
        tabs,
        activeId,
        visible: tabs.length > 0 && current.visible,
      };
    });
  }, []);

  const newTab = useCallback(() => {
    if (sessionRef.current.tabs.length >= MAX_BROWSER_TABS) {
      Alert.alert('Too many tabs', 'Close a tab before opening another. Open tabs stay running.');
      return;
    }
    const tab = createBrowserTab('', 'Search');
    setEditing(false);
    setDraft('');
    wantSearchFocus.current = true;
    setSession(current => {
      if (current.tabs.length >= MAX_BROWSER_TABS) {
        return current;
      }
      return { ...current, visible: true, activeId: tab.id, tabs: [...current.tabs, tab] };
    });
  }, []);

  const navigateTab = useCallback((id: string, url: string) => {
    setSession(current => ({
      ...current,
      tabs: current.tabs.map(tab => {
        if (tab.id !== id) {
          return tab;
        }
        const same = tab.entryUrl === url;
        return {
          ...tab,
          entryUrl: url,
          currentUrl: url,
          title: labelForUrl(url),
          loading: true,
          failed: false,
          progress: 0.08,
          loadId: same ? tab.loadId + 1 : tab.loadId,
        };
      }),
    }));
  }, []);

  const patchTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setSession(current => {
      let changed = false;
      const tabs = current.tabs.map(tab => {
        if (tab.id !== id) {
          return tab;
        }
        const next: BrowserTab = {
          ...tab,
          ...patch,
          entryUrl: tab.entryUrl,
          loadId: tab.loadId,
        };
        if (
          next.currentUrl === tab.currentUrl &&
          next.title === tab.title &&
          next.canGoBack === tab.canGoBack &&
          next.canGoForward === tab.canGoForward &&
          next.loading === tab.loading &&
          next.progress === tab.progress &&
          next.failed === tab.failed
        ) {
          return tab;
        }
        changed = true;
        return next;
      });
      return changed ? { ...current, tabs } : current;
    });
  }, []);

  const submit = useCallback(() => {
    if (!active) {
      return;
    }
    const next = resolveBrowserInput(fieldValue);
    if (!next) {
      return;
    }
    setEditing(false);
    Keyboard.dismiss();
    if (next === active.currentUrl || next === active.entryUrl) {
      webRefs.current[active.id]?.reload();
      return;
    }
    navigateTab(active.id, next);
  }, [active, fieldValue, navigateTab]);

  if (!session.tabs.length) {
    return null;
  }

  return (
    <View
      pointerEvents={session.visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!session.visible}
      importantForAccessibility={session.visible ? 'yes' : 'no-hide-descendants'}
      style={[
        styles.shell,
        {
          width: windowWidth,
          paddingTop: insets.top + 8,
          left: session.visible ? 0 : windowWidth + 48,
        },
      ]}
    >
      <View style={styles.bar}>
        <Pressable style={styles.iconBtn} onPress={hide} accessibilityLabel="Back to chat">
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <View style={[styles.omnibox, editing && styles.omniboxFocused]}>
          <SearchGlyph />
          <TextInput
            ref={fieldRef}
            style={styles.omniboxInput}
            value={fieldValue}
            onChangeText={value => {
              setEditing(true);
              setDraft(value);
            }}
            onFocus={() => {
              const url = active?.currentUrl || '';
              setDraft(isBareGoogle(url) ? '' : url);
              setEditing(true);
            }}
            onBlur={() => setEditing(false)}
            onSubmitEditing={submit}
            placeholder="Search"
            placeholderTextColor="#8a94a6"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            selectTextOnFocus
            keyboardType="web-search"
            returnKeyType="search"
            inputMode="search"
          />
        </View>
        <Pressable
          style={styles.iconBtn}
          onPress={() => active && webRefs.current[active.id]?.reload()}
          accessibilityLabel="Reload"
        >
          <Text style={styles.navText}>↻</Text>
        </Pressable>
        <Pressable
          style={[styles.tabsBtn, tabsOpen && styles.tabsBtnOn]}
          onPress={() => setTabsOpen(open => !open)}
          accessibilityLabel={tabsOpen ? 'Hide tabs' : 'Show tabs'}
        >
          <View style={styles.tabsGlyph}>
            <View style={[styles.tabsGlyphBack, tabsOpen && styles.tabsGlyphOn]} />
            <View style={[styles.tabsGlyphFront, tabsOpen && styles.tabsGlyphOn]} />
          </View>
        </Pressable>
      </View>
      {tabsOpen ? (
        <View style={styles.tabRow}>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.tabScroll}
            contentContainerStyle={styles.tabStrip}
          >
            {session.tabs.map(tab => {
              const selected = tab.id === session.activeId;
              return (
                <View
                  key={tab.id}
                  style={[styles.tab, selected && styles.tabActive]}
                  onLayout={event => {
                    tabX.current[tab.id] = event.nativeEvent.layout.x;
                  }}
                >
                  <Pressable
                    style={styles.tabMain}
                    onPress={() => selectTab(tab.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={tab.title}
                  >
                    <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                      {tab.title}
                    </Text>
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    onPress={() => closeTab(tab.id)}
                    accessibilityLabel={`Close ${tab.title}`}
                  >
                    <Text style={styles.tabCloseText}>×</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <Pressable style={styles.addBtn} onPress={newTab} accessibilityLabel="New tab">
            <Text style={styles.plusText}>+</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.progressTrack}>
        {active?.loading ? (
          <View style={[styles.progressBar, { width: `${Math.max(12, Math.round((active.progress || 0.08) * 100))}%` }]} />
        ) : null}
      </View>

      {active?.failed ? (
        <View style={styles.failBar}>
          <Text style={styles.failText}>This page didn't load. Check the connection and try again.</Text>
          <Pressable
            onPress={() => active && webRefs.current[active.id]?.reload()}
            accessibilityLabel="Try again"
          >
            <Text style={styles.failAction}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Every tab stays mounted at full size and stacked. Inactive tabs are
          covered, not unmounted or set to display:none, so video, forms, and
          scroll position keep running while you switch. */}
      <View style={styles.stage} removeClippedSubviews={false}>
        {session.tabs.map(tab => {
          const selected = tab.id === session.activeId;
          return (
            <View
              key={tab.id}
              collapsable={false}
              pointerEvents={selected ? 'auto' : 'none'}
              style={[
                styles.page,
                {
                  width: windowWidth,
                  zIndex: selected ? 2 : 0,
                  elevation: selected ? 3 : 0,
                },
              ]}
            >
              {tab.entryUrl ? (
              <WebView
                key={`${tab.id}:${tab.loadId}`}
                ref={node => {
                  if (node) {
                    webRefs.current[tab.id] = node;
                  }
                }}
                source={{ uri: tab.entryUrl }}
                style={styles.webview}
                userAgent={BROWSER_USER_AGENT}
                originWhitelist={['http://*', 'https://*']}
                injectedJavaScriptBeforeContentLoaded={YOUTUBE_AD_SCRIPT}
                onShouldStartLoadWithRequest={request => {
                  if (shouldBlockYoutubeAd(request.url, tab.currentUrl || tab.entryUrl)) {
                    return false;
                  }
                  if (request.isTopFrame === false) {
                    return true;
                  }
                  return allowInAppNavigation(request.url);
                }}
                javaScriptEnabled
                domStorageEnabled
                thirdPartyCookiesEnabled
                sharedCookiesEnabled
                cacheEnabled
                cacheMode="LOAD_DEFAULT"
                javaScriptCanOpenWindowsAutomatically
                setSupportMultipleWindows
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                onOpenWindow={event => {
                  const target = event.nativeEvent.targetUrl;
                  if (target && allowInAppNavigation(target)) {
                    openUrl(target);
                  }
                }}
                onLoadStart={() => {
                  patchTab(tab.id, { loading: true, failed: false, progress: 0.08 });
                }}
                onLoadProgress={event => {
                  const progress = event.nativeEvent.progress;
                  patchTab(tab.id, {
                    progress,
                    loading: progress < 1,
                  });
                }}
                onLoad={event => {
                  const nav = event.nativeEvent;
                  patchTab(tab.id, {
                    loading: false,
                    failed: false,
                    progress: 1,
                    currentUrl: nav.url || tab.currentUrl,
                    title: niceTitle(nav.title, nav.url || tab.currentUrl),
                  });
                }}
                onNavigationStateChange={nav => {
                  if (!nav.url || nav.url.startsWith('about:blank')) {
                    return;
                  }
                  patchTab(tab.id, {
                    currentUrl: nav.url,
                    title: niceTitle(nav.title, nav.url),
                    canGoBack: nav.canGoBack,
                    canGoForward: nav.canGoForward,
                    loading: nav.loading,
                  });
                }}
                onError={() => patchTab(tab.id, { failed: true, loading: false })}
              />
              ) : (
                <View style={styles.emptySearch}>
                  <Text style={styles.emptyTitle}>Search</Text>
                  <Text style={styles.emptyHint}>Type a search or a website address, then open it here.</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  shell: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#0b1220',
    zIndex: 30,
    elevation: 30,
  },
  glyph: { width: 16, height: 16 },
  glyphRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#8fb4ff',
  },
  glyphHandle: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#8fb4ff',
    right: 0,
    bottom: 1,
    transform: [{ rotate: '45deg' }],
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
    borderRadius: 24,
    backgroundColor: '#1c2534',
    gap: 2,
  },
  iconBtn: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#f5f7fa',
    fontSize: 26,
    lineHeight: 28,
    includeFontPadding: false,
  },
  navText: {
    color: '#f5f7fa',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    includeFontPadding: false,
  },
  navTextDisabled: { color: '#4d596c' },
  tabsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsBtnOn: { backgroundColor: '#3b82f6' },
  tabsGlyph: { width: 16, height: 16 },
  tabsGlyphBack: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#f5f7fa',
  },
  tabsGlyphFront: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#f5f7fa',
    backgroundColor: '#1c2534',
  },
  tabsGlyphOn: { borderColor: '#ffffff' },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginBottom: 8,
    height: 44,
    gap: 8,
  },
  tabScroll: { flex: 1 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 20,
    backgroundColor: '#1c2534',
  },
  chatChevron: {
    color: '#f5f7fa',
    fontSize: 28,
    lineHeight: 30,
    includeFontPadding: false,
    marginTop: -2,
  },
  chatButtonText: { color: '#f5f7fa', fontSize: 15, fontWeight: '600' },
  newTab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: 'center',
  },
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#121826',
    gap: 8,
  },
  tabStrip: {
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    maxWidth: 160,
    height: 36,
    borderRadius: 18,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c2534',
  },
  tabActive: {
    backgroundColor: '#243044',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  tabMain: {
    flexShrink: 1,
    height: 32,
    justifyContent: 'center',
    paddingLeft: 10,
    paddingRight: 2,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#243044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markActive: { backgroundColor: '#3b82f6' },
  markText: {
    color: '#f5f7fa',
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  tabText: { flexShrink: 1, color: '#8a94a6', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#f5f7fa' },
  tabClose: {
    width: 28,
    height: 28,
    marginRight: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCloseText: {
    color: '#8a94a6',
    fontSize: 16,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
  },
  omnibox: {
    flex: 1,
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 8,
    gap: 4,
  },
  omniboxFocused: { borderColor: '#3b82f6' },
  omniboxInput: {
    flex: 1,
    minWidth: 0,
    color: '#f5f7fa',
    fontSize: 15,
    paddingVertical: 8,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a3242',
  },
  clearText: {
    color: '#8a94a6',
    fontSize: 16,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
  },
  go: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goDisabled: { opacity: 0.4 },
  goText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 4,
  },
  toolButton: {
    width: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: {
    color: '#f5f7fa',
    fontSize: 32,
    lineHeight: 34,
    includeFontPadding: false,
    textAlign: 'center',
  },
  toolTextDisabled: { color: '#3d4758' },
  reloadText: {
    color: '#f5f7fa',
    fontSize: 22,
    lineHeight: 26,
    includeFontPadding: false,
    textAlign: 'center',
  },
  toolSpacer: { flex: 1 },
  progressTrack: { height: 2, backgroundColor: 'transparent' },
  progressBar: { height: 2, backgroundColor: '#3b82f6', borderRadius: 1 },
  failBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1c2534',
  },
  failText: { flex: 1, color: '#f5f7fa', fontSize: 13 },
  failAction: { color: '#8fb4ff', fontSize: 13, fontWeight: '700' },
  stage: { flex: 1, overflow: 'hidden' },
  emptySearch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: '#0b1220',
  },
  emptyTitle: {
    color: '#f5f7fa',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyHint: {
    color: '#8a94a6',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  page: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  webview: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
});
