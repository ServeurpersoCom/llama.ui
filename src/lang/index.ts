import en from './en.json';
import fr from './fr.json';

const languages = {
  en,
  fr,
} as const;

type SupportedLanguage = keyof typeof languages;

const fallbackLanguage: SupportedLanguage = 'en';

const availableLanguageKeys = Object.keys(languages) as SupportedLanguage[];

const buildTimeLanguage =
  typeof __APP_LANG__ === 'string' &&
  availableLanguageKeys.includes(__APP_LANG__ as SupportedLanguage)
    ? (__APP_LANG__ as SupportedLanguage)
    : fallbackLanguage;

export const currentLanguage: SupportedLanguage = buildTimeLanguage;

const resolvedLanguage = languages[buildTimeLanguage];

export default resolvedLanguage;
