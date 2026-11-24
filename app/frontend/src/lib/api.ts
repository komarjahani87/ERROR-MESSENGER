import { createClient } from '@metagptx/web-sdk';
import { getAPIBaseURL } from './config';

export const client = createClient({
  baseURL: `${getAPIBaseURL()}/`,
});