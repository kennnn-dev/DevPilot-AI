/**
 * Backward compatibility facade for Webhook configuration.
 * Forwards to the unified AI configuration service (src/renderer/services/aiConfig.ts).
 */

import type { ResolvedWebhookConfig } from '../../shared/types';
import {
  STORAGE_KEY_LEGACY_WEBHOOK_URL,
  STORAGE_KEY_LEGACY_WEBHOOK_TOKEN,
  STORAGE_KEY_WEBHOOK_URL as STORAGE_KEY_AI_WEBHOOK_URL,
  STORAGE_KEY_WEBHOOK_TOKEN as STORAGE_KEY_AI_WEBHOOK_TOKEN,
  getWebhookUrl as getAIWebhookUrl,
  setWebhookUrl as setAIWebhookUrl,
  clearWebhookUrl as clearAIWebhookUrl,
  getWebhookToken as getAIWebhookToken,
  setWebhookToken as setAIWebhookToken,
  clearWebhookToken as clearAIWebhookToken,
  clearWebhookConfig as clearAIWebhookConfig,
  resetWebhookConfig as resetAIWebhookConfig,
  validateWebhookUrl as validateAIWebhookUrl,
  resolveEffectiveWebhookConfig as resolveAIEffectiveWebhookConfig,
  resolveWebhookConfig as resolveAIWebhookConfig,
  getEffectiveWebhookConfig as getAIEffectiveWebhookConfig,
} from './aiConfig';

export const STORAGE_KEY_WEBHOOK_URL = STORAGE_KEY_LEGACY_WEBHOOK_URL;
export const STORAGE_KEY_WEBHOOK_TOKEN = STORAGE_KEY_LEGACY_WEBHOOK_TOKEN;
export const STORAGE_KEY_DEVPILOT_WEBHOOK_URL = STORAGE_KEY_AI_WEBHOOK_URL;
export const STORAGE_KEY_DEVPILOT_WEBHOOK_TOKEN = STORAGE_KEY_AI_WEBHOOK_TOKEN;

export const getWebhookUrl = getAIWebhookUrl;
export const setWebhookUrl = setAIWebhookUrl;
export const clearWebhookUrl = clearAIWebhookUrl;

export const getWebhookToken = getAIWebhookToken;
export const setWebhookToken = setAIWebhookToken;
export const clearWebhookToken = clearAIWebhookToken;

export const clearWebhookConfig = clearAIWebhookConfig;
export const resetWebhookConfig = resetAIWebhookConfig;
export const validateWebhookUrl = validateAIWebhookUrl;

export const resolveEffectiveWebhookConfig = resolveAIEffectiveWebhookConfig;
export const resolveWebhookConfig = resolveAIWebhookConfig;
export const getEffectiveWebhookConfig = getAIEffectiveWebhookConfig;

export type { ResolvedWebhookConfig };
