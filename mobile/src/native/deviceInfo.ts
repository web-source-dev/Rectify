import { Platform } from 'react-native';
import { APP_VERSION } from '../config';

export type DeviceInfo = {
  brand?: string;
  model?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
};

// Basic phone identity (brand + model) with no extra native module or
// permission — React Native already exposes these in Platform.constants on
// Android. Used only to tell devices apart in the dashboard's open log.
export function getDeviceInfo(): DeviceInfo {
  const c = (Platform.constants ?? {}) as {
    Brand?: string;
    Model?: string;
    Manufacturer?: string;
  };
  const brand = c.Brand || c.Manufacturer || undefined;
  const model = c.Model || undefined;
  const deviceName =
    [c.Manufacturer, c.Model].filter(Boolean).join(' ') ||
    model ||
    brand ||
    'Unknown device';
  return {
    brand,
    model,
    deviceName,
    platform: `${Platform.OS} ${Platform.Version}`,
    appVersion: APP_VERSION,
  };
}
