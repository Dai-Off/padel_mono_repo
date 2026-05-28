"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = exports.OPENWEATHER_API_KEY = exports.MATCHMAKING_DEFAULT_CLUB_ID = exports.API_URL = exports.STRIPE_PUBLISHABLE_KEY = void 0;
const expo_constants_1 = __importDefault(require("expo-constants"));
const react_native_1 = require("react-native");
exports.STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
// Producción / EAS: definir EXPO_PUBLIC_API_URL en el build (Expo Dashboard → Variables o eas env).
// Desarrollo: Metro (hostUri); emulador Android 10.0.2.2; simulador iOS localhost.
function getApiUrl() {
    var _a, _b;
    const fromEnv = (_a = process.env.EXPO_PUBLIC_API_URL) === null || _a === void 0 ? void 0 : _a.trim();
    if (fromEnv) {
        return fromEnv.replace(/\/+$/, '');
    }
    const hostUri = (_b = expo_constants_1.default.expoConfig) === null || _b === void 0 ? void 0 : _b.hostUri;
    if (hostUri) {
        const host = hostUri.split(':')[0];
        return `http://${host}:3000`;
    }
    return react_native_1.Platform.OS === 'android'
        ? 'http://10.0.2.2:3000'
        : 'http://localhost:3000';
}
exports.API_URL = getApiUrl();
/** Club por defecto para búsqueda de matchmaking (integración / pruebas). */
exports.MATCHMAKING_DEFAULT_CLUB_ID = ((_a = process.env.EXPO_PUBLIC_MATCHMAKING_CLUB_ID) === null || _a === void 0 ? void 0 : _a.trim()) ||
    '5768474f-b079-41f5-b1c8-1bc45c96b2c3';
exports.OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || 'ce6363aacdfb1e34753f831d3a9cd0b2';
exports.SUPABASE_URL = (_c = (_b = process.env.EXPO_PUBLIC_SUPABASE_URL) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
exports.SUPABASE_ANON_KEY = (_e = (_d = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _e !== void 0 ? _e : '';
