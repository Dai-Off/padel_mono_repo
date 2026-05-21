import * as Localization from 'expo-localization';
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

export type PhoneParts = {
  country: CountryCode;
  national: string;
};

export type PhoneValidation =
  | { ok: true; e164: string; national: string }
  | { ok: false; error: string };

const DEFAULT_COUNTRY: CountryCode = 'ES';

const PRIORITY_COUNTRIES: CountryCode[] = [
  'ES',
  'PT',
  'FR',
  'IT',
  'DE',
  'GB',
  'US',
  'MX',
  'AR',
  'CO',
  'CL',
  'UY',
  'PE',
  'VE',
];

export type PhoneCountryOption = {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
};

function countryFlag(code: string): string {
  const c = code.toUpperCase();
  if (c.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...[...c].map((ch) => 0x1f1e6 - 65 + ch.charCodeAt(0)),
  );
}

let countryOptionsCache: PhoneCountryOption[] | null = null;

export function getPhoneCountryOptions(): PhoneCountryOption[] {
  if (countryOptionsCache) return countryOptionsCache;
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(['es'], { type: 'region' });
  } catch {
    display = null;
  }

  const all = getCountries().map((code) => {
    const cc = code as CountryCode;
    return {
      code: cc,
      name: display?.of(code) ?? code,
      callingCode: `+${getCountryCallingCode(cc)}`,
      flag: countryFlag(code),
    };
  });

  const prioritySet = new Set(PRIORITY_COUNTRIES);
  const priority = PRIORITY_COUNTRIES.map((c) => all.find((x) => x.code === c)).filter(
    (x): x is PhoneCountryOption => x != null,
  );
  const rest = all
    .filter((x) => !prioritySet.has(x.code))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  countryOptionsCache = [...priority, ...rest];
  return countryOptionsCache;
}

export function getDefaultPhoneCountry(): CountryCode {
  const region = Localization.getLocales()?.[0]?.regionCode?.toUpperCase();
  if (region && getCountries().includes(region as CountryCode)) {
    return region as CountryCode;
  }
  return DEFAULT_COUNTRY;
}

export function parseStoredPhone(phone: string | null | undefined): PhoneParts {
  const raw = (phone ?? '').trim();
  if (!raw) {
    return { country: getDefaultPhoneCountry(), national: '' };
  }
  try {
    const parsed = parsePhoneNumberFromString(raw);
    if (parsed?.country) {
      return {
        country: parsed.country,
        national: parsed.nationalNumber,
      };
    }
  } catch {
    /* fall through */
  }
  const digits = raw.replace(/\D/g, '');
  return { country: getDefaultPhoneCountry(), national: digits };
}

export function formatNationalInput(country: CountryCode, raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return new AsYouType(country).input(digits);
}

export function validatePhoneParts(country: CountryCode, national: string): PhoneValidation {
  const digits = national.replace(/\D/g, '');
  if (!digits) {
    return { ok: false, error: 'Introduce tu número de teléfono.' };
  }
  try {
    const parsed = parsePhoneNumberFromString(digits, country);
    if (!parsed || !parsed.isValid()) {
      return {
        ok: false,
        error: 'Número no válido para el país seleccionado.',
      };
    }
    return {
      ok: true,
      e164: parsed.format('E.164'),
      national: parsed.nationalNumber,
    };
  } catch {
    return { ok: false, error: 'Número de teléfono no válido.' };
  }
}

export function phonePartsToComparable(country: CountryCode, national: string): string {
  const v = validatePhoneParts(country, national);
  return v.ok ? v.e164 : `${country}:${national.replace(/\D/g, '')}`;
}

export function isPhonePartsValid(country: CountryCode, national: string): boolean {
  const digits = national.replace(/\D/g, '');
  if (!digits) return false;
  return isValidPhoneNumber(digits, country);
}
