import type { StringKey } from './strings'

/** Maps the raw domain string from the question bank to a translatable string key.
 *  Source data uses single-word domains: Deployment / Development / Security / Troubleshooting. */
export const TOPIC_KEYS: Record<string, StringKey> = {
  Deployment: 'topicDeployment',
  Development: 'topicDevelopment',
  Security: 'topicSecurity',
  Troubleshooting: 'topicTroubleshooting',
}
