/**
 * Catalogo de mensajes del back-office: lo compartido del paquete + lo propio
 * de esta app (apps/back-office/messages). Ver packages/i18n/src/merge.ts para
 * el porque del corte. Las claves nuevas de phoenix.* van en ./messages/*.json
 * de ESTA app, no en el paquete.
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
