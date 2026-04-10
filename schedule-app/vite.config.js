import { defineConfig } from 'vite';
import pkg from './package.json' assert { type: 'json' };

export default defineConfig({
  define: {
    // package.json의 version 필드를 읽어서 전역 변수로 만듭니다.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
});