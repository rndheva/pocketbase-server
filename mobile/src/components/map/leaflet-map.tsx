// Versi HP (Android/iOS): peta Leaflet di dalam WebView.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildMapHtml, parseMapMessage, type LeafletMapProps, type MapCommand } from './map-html';

export function LeafletMap(props: LeafletMapProps) {
  const { routes, selectedRouteId, buses, myLocation, centerKey, onStopPress, topInset, bottomInset } =
    props;
  // WebView<object>: tipe bawaan library (P = undefined) membuat props jadi "never"
  // di TypeScript versi baru, jadi tipe generiknya diisi manual.
  const ref = useRef<WebView<object>>(null);
  const loaded = useRef(false);
  const lastCenterKey = useRef(0);

  // HTML hanya dibuat ulang kalau data rute berubah (bukan tiap posisi bus berubah).
  const html = useMemo(
    () => buildMapHtml(routes, { topInset, bottomInset }),
    [routes, topInset, bottomInset],
  );

  const send = useCallback((cmd: MapCommand) => {
    if (!loaded.current) return;
    ref.current?.injectJavaScript(`window.__cmd && window.__cmd(${JSON.stringify(cmd)}); true;`);
  }, []);

  useEffect(() => {
    send({ type: 'select', routeId: selectedRouteId });
  }, [selectedRouteId, send]);

  useEffect(() => {
    send({ type: 'buses', buses });
  }, [buses, send]);

  useEffect(() => {
    if (!myLocation) return;
    const center = centerKey !== lastCenterKey.current;
    lastCenterKey.current = centerKey;
    send({ type: 'me', position: myLocation, center });
  }, [myLocation, centerKey, send]);

  return (
    <WebView<object>
      ref={ref}
      style={styles.map}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost' }}
      onLoadStart={() => {
        loaded.current = false;
      }}
      onLoadEnd={() => {
        // Halaman baru siap: kirim ulang semua keadaan terakhir.
        loaded.current = true;
        if (selectedRouteId) send({ type: 'select', routeId: selectedRouteId });
        send({ type: 'buses', buses });
        if (myLocation) send({ type: 'me', position: myLocation, center: false });
      }}
      onMessage={(e: WebViewMessageEvent) => {
        const msg = parseMapMessage(e.nativeEvent.data);
        if (msg) onStopPress(msg.id);
      }}
    />
  );
}

const styles = StyleSheet.create({ map: { flex: 1 } });
