import escapeStringRegexp from 'escape-string-regexp';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, View, ActivityIndicator, Text, Platform } from 'react-native';
import {
  OnShouldStartLoadWithRequest,
  ShouldStartLoadRequestEvent,
  WebViewError,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewMessage,
  WebViewNavigation,
  WebViewNavigationEvent,
  WebViewProgressEvent,
  WebViewRenderProcessGoneEvent,
  WebViewTerminatedEvent,
  WebViewNativeEvent,
} from './WebViewTypes';
import styles from './WebView.styles';

const defaultOriginWhitelist = ['https://*'] as const;

const extractOrigin = (url: string): string => {
  const result = /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url);
  return result === null ? '' : result[0];
};

const originWhitelistToRegex = (originWhitelist: string): string =>
  `^${escapeStringRegexp(originWhitelist).replace(/\\\*/g, '.*')}$`;

const _passesWhitelist = (
  compiledWhitelist: readonly string[],
  url: string,
) => {
  const origin = extractOrigin(url);
  if (!origin) return false;
  if (origin !== new URL(url).origin) return null;
  return compiledWhitelist.some(x => new RegExp(x).test(origin));
};

const compileWhitelist = (
  originWhitelist: readonly string[],
): readonly string[] =>
  ['about:blank', ...(originWhitelist || [])].map(originWhitelistToRegex);

const createOnShouldStartLoadWithRequest = (
  loadRequest: (
    shouldStart: boolean,
    url: string,
    lockIdentifier: number,
  ) => void,
  originWhitelist: readonly string[],
  onShouldStartLoadWithRequest?: OnShouldStartLoadWithRequest,
) => {
  return ({ nativeEvent }: ShouldStartLoadRequestEvent) => {
    let shouldStart = true;
    const { url, lockIdentifier } = nativeEvent;

    if (!_passesWhitelist(compileWhitelist(originWhitelist), url)) {
      Linking.canOpenURL(url).then((supported) => {
        if (supported && /^https:\/\//.test(url)) {
          return Linking.openURL(url);
        }
        console.warn(`Can't open url: ${url}`);
        return undefined;
      }).catch(e => {
        console.warn('Error opening URL: ', e);
      });
      shouldStart = false;
    } else if (onShouldStartLoadWithRequest) {
      shouldStart = onShouldStartLoadWithRequest(nativeEvent);
    }

    loadRequest(shouldStart, url, lockIdentifier);
  };
};

const defaultRenderLoading = () => (
  <View style={styles.loadingOrErrorView}>
    <ActivityIndicator />
  </View>
);
const defaultRenderError = (
  errorDomain: string | undefined,
  errorCode: number,
  errorDesc: string,
) => (
  <View style={styles.loadingOrErrorView}>
    <Text style={styles.errorTextTitle}>Error loading page</Text>
    <Text style={styles.errorText}>{`Domain: ${errorDomain}`}</Text>
    <Text style={styles.errorText}>{`Error Code: ${errorCode}`}</Text>
    <Text style={styles.errorText}>{`Description: ${errorDesc}`}</Text>
  </View>
);

export {
  defaultOriginWhitelist,
  createOnShouldStartLoadWithRequest,
  defaultRenderLoading,
  defaultRenderError,
};


export const useWebWiewLogic = ({
  startInLoadingState,
  onNavigationStateChange,
  onLoadStart,
  onLoad,
  onLoadProgress,
  onLoadEnd,
  onError,
  onHttpErrorProp,
  onMessageProp,
  onRenderProcessGoneProp,
  onContentProcessDidTerminateProp,
  originWhitelist,
  onShouldStartLoadWithRequestProp,
  onShouldStartLoadWithRequestCallback,
  validateMeta,
  validateData,
}: {
  startInLoadingState?: boolean
  onNavigationStateChange?: (event: WebViewNavigation) => void;
  onLoadStart?: (event: WebViewNavigationEvent) => void;
  onLoad?: (event: WebViewNavigationEvent) => void;
  onLoadProgress?: (event: WebViewProgressEvent) => void;
  onLoadEnd?: (event: WebViewNavigationEvent | WebViewErrorEvent) => void;
  onError?: (event: WebViewErrorEvent) => void;
  onHttpErrorProp?: (event: WebViewHttpErrorEvent) => void;
  onMessageProp?: (event: WebViewMessage) => void;
  onRenderProcessGoneProp?: (event: WebViewRenderProcessGoneEvent) => void;
  onContentProcessDidTerminateProp?: (event: WebViewTerminatedEvent) => void;
  originWhitelist: readonly string[];
  onShouldStartLoadWithRequestProp?: OnShouldStartLoadWithRequest;
  onShouldStartLoadWithRequestCallback: (shouldStart: boolean, url: string, lockIdentifier?: number | undefined) => void;
  validateMeta: (event: WebViewNativeEvent) => WebViewNativeEvent;
  validateData: (data: object) => object;
}) => {

  const [viewState, setViewState] = useState<'IDLE' | 'LOADING' | 'ERROR'>(startInLoadingState ? "LOADING" : "IDLE");
  const [lastErrorEvent, setLastErrorEvent] = useState<WebViewError | null>(null);
  const startUrl = useRef<string | null>(null)

  const passesWhitelist = (url: string) => {
    return _passesWhitelist(compileWhitelist(originWhitelist), url);
  }

  const passesWhitelistUse = useCallback(passesWhitelist, [originWhitelist])

  const updateNavigationState = useCallback((event: WebViewNavigationEvent) => {
    onNavigationStateChange?.(event.nativeEvent);
  }, [onNavigationStateChange]);

  const onLoadingStart = useCallback((event: WebViewNavigationEvent) => {
    // Needed for android
    startUrl.current = event.nativeEvent.url;
    // !Needed for android

    onLoadStart?.(event);
    updateNavigationState(event);
  }, [onLoadStart, updateNavigationState]);

  const onLoadingError = useCallback((event: WebViewErrorEvent) => {
    event.persist();
    if (onError) {
      onError(event);
    } else {
      console.warn('Encountered an error loading page', event.nativeEvent);
    }
    onLoadEnd?.(event);
    if (event.isDefaultPrevented()) { return };
    setViewState('ERROR');
    setLastErrorEvent(event.nativeEvent);
  }, [onError, onLoadEnd]);

  const onHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    onHttpErrorProp?.(event);
  }, [onHttpErrorProp]);

  // Android Only
  const onRenderProcessGone = useCallback((event: WebViewRenderProcessGoneEvent) => {
    onRenderProcessGoneProp?.(event);
  }, [onRenderProcessGoneProp]);
  // !Android Only

  // iOS Only
  const onContentProcessDidTerminate = useCallback((event: WebViewTerminatedEvent) => {
      onContentProcessDidTerminateProp?.(event);
  }, [onContentProcessDidTerminateProp]);
  // !iOS Only

  const onLoadingFinish = useCallback((event: WebViewNavigationEvent) => {
    onLoad?.(event);
    onLoadEnd?.(event);
    const { nativeEvent: { url } } = event;

    if (!passesWhitelistUse(url)) return;

    // on Android, only if url === startUrl
    if (Platform.OS !== "android" || url === startUrl.current) {
      setViewState('IDLE');
    }
    // !on Android, only if url === startUrl
    updateNavigationState(event);
  }, [onLoad, onLoadEnd, updateNavigationState, passesWhitelistUse]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const { nativeEvent } = event;
    if (!passesWhitelistUse(nativeEvent.url)) return;

    // TODO: can/should we perform any other validation?

    const data = JSON.stringify(validateData(JSON.parse(nativeEvent.data)));
    const meta = validateMeta({
      url: String(nativeEvent.url),
      loading: Boolean(nativeEvent.loading),
      title: String(nativeEvent.title),
      canGoBack: Boolean(nativeEvent.canGoBack),
      canGoForward: Boolean(nativeEvent.canGoForward),
      lockIdentifier: Number(nativeEvent.lockIdentifier),
    });

    onMessageProp?.({ ...meta, data });
  }, [onMessageProp, passesWhitelistUse, validateData, validateMeta]);

  const onLoadingProgress = useCallback((event: WebViewProgressEvent) => {
    const { nativeEvent: { progress } } = event;
    // patch for Android only
    if (Platform.OS === "android" && progress === 1) {
      setViewState(prevViewState => prevViewState === 'LOADING' ? 'IDLE' : prevViewState);
    }
    // !patch for Android only
    onLoadProgress?.(event);
  }, [onLoadProgress]);

  const onShouldStartLoadWithRequest = useMemo(() =>  createOnShouldStartLoadWithRequest(
      onShouldStartLoadWithRequestCallback,
      originWhitelist,
      onShouldStartLoadWithRequestProp,
    )
  , [originWhitelist, onShouldStartLoadWithRequestProp, onShouldStartLoadWithRequestCallback])

  return {
    onShouldStartLoadWithRequest,
    onLoadingStart,
    onLoadingProgress,
    onLoadingError,
    onLoadingFinish,
    onHttpError,
    onRenderProcessGone,
    onContentProcessDidTerminate,
    onMessage,
    passesWhitelist,
    viewState,
    setViewState,
    lastErrorEvent,
  }
};
