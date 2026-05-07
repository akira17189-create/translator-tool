import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          // 多个渲染进程页面
          popup: resolve(__dirname, 'src/renderer/popup/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html'),
          wordbook: resolve(__dirname, 'src/renderer/wordbook/index.html'),
          glossary: resolve(__dirname, 'src/renderer/glossary/index.html')
        }
      }
    }
  }
})
