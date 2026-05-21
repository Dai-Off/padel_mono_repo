import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  DEFAULT_COORDS,
  getCurrentMapCoords,
  placeLabelFromCoords,
  type MapCoords,
} from '../../lib/getCurrentPlaceLabel';

const ACCENT = '#F18F34';
const BG = '#0F0F0F';

function buildMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #1a1a1a; }
    .leaflet-control-attribution { font-size: 9px; opacity: 0.7; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    var marker = null;
    function post(coords) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(coords));
      }
    }
    function setMarker(lat, lng, fromUser) {
      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function(e) {
        var p = e.target.getLatLng();
        post({ latitude: p.lat, longitude: p.lng });
      });
      if (fromUser) post({ latitude: lat, longitude: lng });
    }
    map.on('click', function(e) {
      setMarker(e.latlng.lat, e.latlng.lng, true);
    });
    window.centerMap = function(lat, lng, placeMarker) {
      map.setView([lat, lng], 15);
      if (placeMarker) setMarker(lat, lng, true);
    };
    setMarker(${lat}, ${lng}, false);
  </script>
</body>
</html>`;
}

type PlayLocationPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (label: string) => void;
};

export function PlayLocationPickerModal({
  visible,
  onClose,
  onConfirm,
}: PlayLocationPickerModalProps) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [pin, setPin] = useState<MapCoords>(DEFAULT_COORDS);
  const [mapHtml, setMapHtml] = useState(() => buildMapHtml(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude));
  const [booting, setBooting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [centeringGps, setCenteringGps] = useState(false);

  const initMap = useCallback(async () => {
    setBooting(true);
    const gps = await getCurrentMapCoords();
    const coords = gps.ok ? gps.coords : DEFAULT_COORDS;
    setPin(coords);
    setMapHtml(buildMapHtml(coords.latitude, coords.longitude));
    setBooting(false);
  }, []);

  useEffect(() => {
    if (visible) void initMap();
  }, [visible, initMap]);

  const onMapMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as MapCoords;
      if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        setPin({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch {
      /* ignore */
    }
  };

  const centerOnGps = async () => {
    setCenteringGps(true);
    const gps = await getCurrentMapCoords();
    setCenteringGps(false);
    if (!gps.ok) {
      Alert.alert('Ubicación', gps.error);
      return;
    }
    setPin(gps.coords);
    webRef.current?.injectJavaScript(
      `window.centerMap(${gps.coords.latitude}, ${gps.coords.longitude}, true); true;`,
    );
  };

  const handleConfirm = async () => {
    setConfirming(true);
    const result = await placeLabelFromCoords(pin.latitude, pin.longitude);
    setConfirming(false);
    if (!result.ok) {
      Alert.alert('Ubicación', result.error);
      return;
    }
    onConfirm(result.label);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={onClose} accessibilityLabel="Cerrar mapa">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>¿Dónde juegas?</Text>
          <View style={styles.headerBtn} />
        </View>

        <Text style={styles.hint}>Toca el mapa o arrastra el pin. También puedes usar tu ubicación actual.</Text>

        <View style={styles.mapWrap}>
          {booting ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={ACCENT} />
            </View>
          ) : (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html: mapHtml }}
              style={styles.webview}
              onMessage={onMapMessage}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
            />
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            onPress={() => void centerOnGps()}
            disabled={centeringGps || booting}
          >
            {centeringGps ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <>
                <Ionicons name="navigate" size={18} color={ACCENT} />
                <Text style={styles.secondaryBtnText}>Mi ubicación</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, confirming && styles.disabled]}
            onPress={() => void handleConfirm()}
            disabled={confirming || booting}
          >
            {confirming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Usar este lugar</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  webview: { flex: 1, backgroundColor: '#1a1a1a' },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,143,52,0.35)',
    backgroundColor: 'rgba(241,143,52,0.08)',
  },
  secondaryBtnText: {
    color: ACCENT,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },
});
