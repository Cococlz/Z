/// <reference types="vite/client" />

import type { ZhiYueApi } from '../electron/preload'

declare global {
  interface Window {
    zhiyue?: ZhiYueApi
  }
}
