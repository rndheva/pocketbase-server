// Versi web: WebView tidak tersedia di browser, jadi peta Leaflet ditaruh di <iframe>.
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { buildMapHtml, parseMapMessage, type LeafletMapProps, type MapCommand } from './map-html';

export function LeafletMap(props: LeafletMapProps) {
  const { routes, selectedRouteId, buses, myLocation, centerKey, onStopPress, topInset, bottomInset } =
    props;
  const frame = useRef<HTMLIFrameElement>(null);
  const lastCenterKey = useRef(0);
  const html = useMemo(
    () => buildMapHtml(routes, { topInset, bottomInset }),
    [routes, topInset, bottomInset],
  );

  const send = useCallback((cmd: MapCommand) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify(cmd), '*');
  }, []);

  // Mendengar pesan "halte diketuk" dari iframe.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return;
      const msg = parseMapMessage(e.data);
      if (msg) onStopPress(msg.id);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onStopPress]);

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
    <iframe
      ref={frame}
      title="Peta bis.in"
      srcDoc={html}
      style={{ border: 0, width: '100%', height: '100%', flex: 1 }}
      onLoad={() => {
        if (selectedRouteId) send({ type: 'select', routeId: selectedRouteId });
        send({ type: 'buses', buses });
        if (myLocation) send({ type: 'me', position: myLocation, center: false });
      }}
    />
  );
}
