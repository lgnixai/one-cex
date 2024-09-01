import axios, { AxiosHeaders } from 'axios';
import retry, { isNetworkError } from 'axios-retry';
import createHash from 'create-hash';
import createHmac from 'create-hmac';
import qs from 'qs';

import type { ExchangeOptions } from '../../types';
import { virtualClock } from '../../utils/virtual-clock';

import { BASE_URL, PUBLIC_ENDPOINTS, RECV_WINDOW } from './gate.types';

export const createAPI = (options: ExchangeOptions) => {
  const BASE_API_URL = BASE_URL[options.testnet ? 'testnet' : 'livenet'];
  const baseURL = options.corsAnywhere
    ? `${options.corsAnywhere}/${BASE_API_URL}`
    : BASE_API_URL;

  const xhr = axios.create({ baseURL });
  retry(xhr, { retries: 3, retryCondition: isNetworkError });

  xhr.interceptors.request.use((config) => {
    // dont sign public endpoints and don't add timeout
    if (PUBLIC_ENDPOINTS.some((str) => config?.url?.startsWith(str))) {
      return config;
    }

    const nextConfig = { ...config };

    const url = `/api/v4${config.url ? config.url : ''}`;
    const method = config.method?.toUpperCase?.() || 'GET';
    const params = config.params
      ? decodeURIComponent(qs.stringify(config.params))
      : '';

    const data = createHash('sha512')
      .update(config.data ? JSON.stringify(config.data) : '')
      .digest('hex');

    const timestamp = virtualClock.getCurrentTime().unix();
    const toSign = [method, url, params, data, timestamp].join('\n');

    const signature = createHmac('sha512', options.secret)
      .update(toSign)
      .digest('hex');

    const headers = new AxiosHeaders({
      ...nextConfig.headers,
      KEY: options.key,
      SIGN: signature,
      Timestamp: timestamp,
    });

    return {
      ...nextConfig,
      headers,
      timeout: options?.extra?.recvWindow ?? RECV_WINDOW,
    };
  });

  return xhr;
};
