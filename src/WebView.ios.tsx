import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  View,
  NativeModules,
} from 'react-native';
import invariant from 'invariant';

// @ts-expect-error react-native doesn't have this type
import codegenNativeCommandsUntyped from 'react-native/Libraries/Utilities/codegenNativeCommands';
import RNCWebView from "./WebViewNativeComponent.ios";
import {
  defaultOriginWhitelist,
  defaultRenderError,
  defaultRenderLoading,
  useWebWiewLogic,
} from './WebViewShared';
import {
  IOSWebViewProps,
  DecelerationRateConstant,
  NativeWebViewIOS,
  ViewManager,
} from './WebViewTypes';

import styles from './WebView.styles';


const codegenNativeCommands = codegenNativeCommandsUntyped as <T extends {}>(options: { supportedCommands: (keyof T)[] }) => T;

const Commands = codegenNativeCommands({
  supportedCommands: ['goBack', 'goForward', 'reload', 'stopLoading', /* 'injectJavaScript', */ 'requestFocus', 'postMessage', 'loadUrl'],
});

const processDecelerationRate = (
  decelerationRate: DecelerationRateConstant | number | undefined,
) => {
  let newDecelerationRate = decelerationRate;
  if (newDecelerationRate === 'normal') {
    newDecelerationRate = 0.998;
  } else if (newDecelerationRate === 'fast') {
    newDecelerationRate = 0.99;
  }
  return newDecelerationRate;
};

const RNCWebViewManager = NativeModules.RNCWebViewManager as ViewManager;

const useWarnIfChanges = <T extends unknown>(value: T, name: string) => {
  const ref = useRef(value);
  if (ref.current !== value) {
    console.warn(`Changes to property ${name} do nothing after the initial render.`);
    ref.current = value;
  }
}

/**
 * Harcoded defaults for security.
 */
const mediaPlaybackRequiresUserAction = true;
// iOS only configs
const allowsInlineMediaPlayback = true;
const useSharedProcessPool = false;
const sharedCookiesEnabled = false;
const enableApplePay = false;
const onFileDownload = () => console.error('tried to download file')
const dataDetectorTypes = 'none';

const WebViewComponent = forwardRef<{}, IOSWebViewProps>(({
  javaScriptEnabled = true,
  cacheEnabled = true,
  originWhitelist = defaultOriginWhitelist,
  textInteractionEnabled= true,
  injectedJavaScript,
  injectedJavaScriptBeforeContentLoaded,
  startInLoadingState,
  onLoadStart,
  onError,
  onLoad,
  onLoadEnd,
  onHttpError: onHttpErrorProp,
  onMessage: onMessageProp,
  renderLoading,
  renderError,
  style,
  containerStyle,
  source,
  incognito,
  validateMeta,
  validateData,
  decelerationRate: decelerationRateProp,
  onShouldStartLoadWithRequest: onShouldStartLoadWithRequestProp,
  ...otherProps
}, ref) => {
  const webViewRef = useRef<NativeWebViewIOS | null>(null);

  const onShouldStartLoadWithRequestCallback = useCallback((
    shouldStart: boolean,
    _url: string,
    lockIdentifier = 0,
  ) => {
    const viewManager = RNCWebViewManager;

    viewManager.startLoadWithResult(!!shouldStart, lockIdentifier);
  }, []);

  const { onLoadingStart, onShouldStartLoadWithRequest, onMessage, viewState, setViewState, lastErrorEvent, onHttpError, onLoadingError, onLoadingFinish, onLoadingProgress } = useWebWiewLogic({
    onLoad,
    onError,
    onHttpErrorProp,
    onLoadEnd,
    onLoadStart,
    onMessageProp,
    startInLoadingState,
    originWhitelist,
    onShouldStartLoadWithRequestProp,
    onShouldStartLoadWithRequestCallback,
    validateMeta,
    validateData,
  });

  useImperativeHandle(ref, () => ({
    goForward: () => Commands.goForward(webViewRef.current),
    goBack: () => Commands.goBack(webViewRef.current),
    reload: () => {
      setViewState(
        'LOADING',
      ); Commands.reload(webViewRef.current)
    },
    stopLoading: () => Commands.stopLoading(webViewRef.current),
    postMessage: (data: string) => Commands.postMessage(webViewRef.current, data),
    // injectJavaScript: (data: string) => Commands.injectJavaScript(webViewRef.current, data),
    requestFocus: () => Commands.requestFocus(webViewRef.current),
  }), [setViewState, webViewRef]);


  useWarnIfChanges(allowsInlineMediaPlayback, 'allowsInlineMediaPlayback');
  useWarnIfChanges(incognito, 'incognito');
  useWarnIfChanges(mediaPlaybackRequiresUserAction, 'mediaPlaybackRequiresUserAction');
  useWarnIfChanges(dataDetectorTypes, 'dataDetectorTypes');

  let otherView = null;
  if (viewState === 'LOADING') {
    otherView = (renderLoading || defaultRenderLoading)();
  } else if (viewState === 'ERROR') {
    invariant(lastErrorEvent != null, 'lastErrorEvent expected to be non-null');
    otherView = (renderError || defaultRenderError)(
      lastErrorEvent.domain,
      lastErrorEvent.code,
      lastErrorEvent.description,
    );
  } else if (viewState !== 'IDLE') {
    console.error(`RNCWebView invalid state encountered: ${viewState}`);
  }

  const webViewStyles = [styles.container, styles.webView, style];
  const webViewContainerStyle = [styles.container, containerStyle];

  const decelerationRate = processDecelerationRate(decelerationRateProp);

  const NativeWebView = RNCWebView;

  const webView = (
    <NativeWebView
      key="webViewKey"
      {...otherProps}
      enableApplePay={enableApplePay}
      javaScriptEnabled={javaScriptEnabled}
      cacheEnabled={cacheEnabled}
      dataDetectorTypes={dataDetectorTypes}
      useSharedProcessPool={useSharedProcessPool}
      textInteractionEnabled={textInteractionEnabled}
      decelerationRate={decelerationRate}
      messagingEnabled={typeof onMessageProp === 'function'}
      onLoadingError={onLoadingError}
      onLoadingFinish={onLoadingFinish}
      onLoadingProgress={onLoadingProgress}
      onFileDownload={onFileDownload}
      onLoadingStart={onLoadingStart}
      onHttpError={onHttpError}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      injectedJavaScript={injectedJavaScript}
      injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
      allowsInlineMediaPlayback={allowsInlineMediaPlayback}
      incognito={incognito}
      mediaPlaybackRequiresUserAction={mediaPlaybackRequiresUserAction}
      ref={webViewRef}
      sharedCookiesEnabled={sharedCookiesEnabled}
      // TODO: find a better way to type this.
      source={source}
      style={webViewStyles}
    />
  );

  return (
    <View style={webViewContainerStyle}>
      {webView}
      {otherView}
    </View>
  );})

// no native implementation for iOS, depends only on permissions
const isFileUploadSupported: () => Promise<boolean>
  = async () => true;

const WebView = Object.assign(WebViewComponent, {isFileUploadSupported});

export default WebView;
