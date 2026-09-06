/**
 * Catalogo de mensajes del portal clinico: lo compartido del paquete + lo
 * propio de esta app (apps/clinical/messages). Ver packages/i18n/src/merge.ts.
 */
import { mergeMessages, type Messages } from '@precision-medical/i18n';
import sharedEs from '@precision-medical/i18n/messages/es';
import sharedEn from '@precision-medical/i18n/messages/en';
import ownEs from '@/messages/es.json';
import ownEn from '@/messages/en.json';

export const messages = {
  es: mergeMessages(sharedEs as Messages, ownEs as Messages),
  en: mergeMessages(sharedEn as Messages, ownEn as Messages),
} as const;
