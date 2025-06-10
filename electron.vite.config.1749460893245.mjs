// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import viteCompression from "vite-plugin-compression";
import wasm from "vite-plugin-wasm";
var __electron_vite_injected_dirname = "C:\\Users\\admin\\Desktop\\tea";
var electron_vite_config_default = defineConfig(({ command, mode }) => {
  const getEnv = (name) => {
    return loadEnv(mode, process.cwd())[name];
  };
  console.log(command);
  const webPort = Number(getEnv("VITE_WEB_PORT") || 14558);
  const servePort = Number(getEnv("VITE_SERVER_PORT") || 25884);
  return {
    // 主进程
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        publicDir: resolve(__electron_vite_injected_dirname, "public"),
        rollupOptions: {
          input: {
            index: resolve(__electron_vite_injected_dirname, "electron/main/index.ts"),
            lyric: resolve(__electron_vite_injected_dirname, "web/lyric.html"),
            loading: resolve(__electron_vite_injected_dirname, "web/loading.html")
          }
        }
      }
    },
    // 预加载
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__electron_vite_injected_dirname, "electron/preload/index.ts")
          }
        }
      }
    },
    // 渲染进程
    renderer: {
      root: ".",
      plugins: [
        vue(),
        AutoImport({
          imports: [
            "vue",
            "vue-router",
            "@vueuse/core",
            {
              "naive-ui": ["useDialog", "useMessage", "useNotification", "useLoadingBar"]
            }
          ],
          eslintrc: {
            enabled: true,
            filepath: "./auto-eslint.mjs"
          }
        }),
        Components({
          resolvers: [NaiveUiResolver()]
        }),
        viteCompression(),
        wasm()
      ],
      resolve: {
        alias: {
          "@": resolve(__electron_vite_injected_dirname, "src/")
        }
      },
      css: {
        preprocessorOptions: {
          scss: {
            silenceDeprecations: ["legacy-js-api"]
          }
        }
      },
      server: {
        port: webPort,
        // 代理
        proxy: {
          "/api": {
            target: `http://127.0.0.1:${servePort}`,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, "/api/")
          }
        }
      },
      preview: {
        port: webPort
      },
      build: {
        minify: "terser",
        publicDir: resolve(__electron_vite_injected_dirname, "public"),
        rollupOptions: {
          input: {
            index: resolve(__electron_vite_injected_dirname, "index.html")
          },
          output: {
            manualChunks: {
              stores: ["src/stores/data.ts", "src/stores/index.ts"]
            }
          }
        },
        terserOptions: {
          compress: {
            // 移除pure_funcs配置，避免构建错误
            drop_console: true,
            drop_debugger: true
          },
          format: {
            comments: false
          }
        },
        sourcemap: false
      }
    }
  };
});
export {
  electron_vite_config_default as default
};
