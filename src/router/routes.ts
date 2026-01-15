import { type RouteRecordRaw } from "vue-router";
import AppLayout from "@/layout/AppLayout.vue";
// import AppLayout from "@/layout/AppLayout.vue"; // 未使用，注释掉

const appRoutes: Array<RouteRecordRaw> = [
  // 首页 (现在是活动列表)
  {
    path: "/",
    name: "home",
    component: () => import("@/views/Home/index.vue"), // 修改为 Activities/index.vue
  },
  //  活动列表
  {
    path: "/activities",
    name: "activities",
    component: () => import("@/views/Activities/index.vue"),
    meta: {
      title: "活动列表",
      keepAlive: true,
      transition: "slide",
    },
  },
  // 搜索
  {
    path: "/search",
    name: "search",
    component: () => import("@/views/Search/layout.vue"),
    beforeEnter: (to, _, next) => {
      if (!to.query.keyword) next({ path: "/403" });
      else next();
    },
    redirect: "/search/songs",
    children: [
      {
        path: "songs",
        name: "search-songs",
        component: () => import("@/views/Search/songs.vue"),
      },
      {
        path: "playlists",
        name: "search-playlists",
        component: () => import("@/views/Search/playlists.vue"),
      },
      {
        path: "artists",
        name: "search-artists",
        component: () => import("@/views/Search/artists.vue"),
      },
      {
        path: "albums",
        name: "search-albums",
        component: () => import("@/views/Search/albums.vue"),
      },
      {
        path: "videos",
        name: "search-videos",
        component: () => import("@/views/Search/videos.vue"),
      },
    ],
  },
  // 发现
  {
    path: "/discover",
    name: "discover",
    component: () => import("@/views/Discover/layout.vue"),
    redirect: "/discover/playlists",
    children: [
      {
        path: "playlists",
        name: "discover-playlists",
        component: () => import("@/views/Discover/playlists.vue"),
      },
      {
        path: "toplists",
        name: "discover-toplists",
        component: () => import("@/views/Discover/toplists.vue"),
      },
      {
        path: "artists",
        name: "discover-artists",
        component: () => import("@/views/Discover/artists.vue"),
      },
      {
        path: "new",
        name: "discover-new",
        component: () => import("@/views/Discover/new.vue"),
      },
    ],
  },
  // 歌手
  {
    path: "/artist",
    name: "artist",
    beforeEnter: (to, _, next) => {
      if (!to.query.id) next({ path: "/403" });
      else next();
    },
    component: () => import("@/views/Artist/layout.vue"),
    redirect: "/artist/songs",
    children: [
      {
        path: "songs",
        name: "artist-songs",
        component: () => import("@/views/Artist/songs.vue"),
      },
      {
        path: "albums",
        name: "artist-albums",
        component: () => import("@/views/Artist/albums.vue"),
      },
      {
        path: "videos",
        name: "artist-videos",
        component: () => import("@/views/Artist/videos.vue"),
      },
    ],
  },
  // 歌单
  {
    path: "/video",
    name: "video",
    beforeEnter: (to, _, next) => {
      if (!to.query.id) next({ path: "/403" });
      else next();
    },
    component: () => import("@/views/Video.vue"),
  },
  // 专辑
  {
    path: "/album",
    name: "album",
    beforeEnter: (to, _, next) => {
      if (!to.query.id) next({ path: "/403" });
      else next();
    },
    component: () => import("@/views/List/album.vue"),
  },
  // 歌单
  {
    path: "/playlist",
    name: "playlist",
    beforeEnter: (to, _, next) => {
      if (!to.query.id) next({ path: "/403" });
      else next();
    },
    component: () => import("@/views/List/playlist.vue"),
  },

  // 我喜欢的音乐
  {
    path: "/like-songs",
    name: "like-songs",
    meta: { needLogin: true },
    component: () => import("@/views/List/liked.vue"),
  },
  // 我的云盘
  {
    path: "/cloud",
    name: "cloud",
    meta: { needLogin: true },
    component: () => import("@/views/Cloud.vue"),
  },
  // 每日推荐
  {
    path: "/daily-songs",
    name: "daily-songs",
    meta: { needLogin: true },
    component: () => import("@/views/DailySongs.vue"),
  },
  // 收藏
  {
    path: "/like",
    name: "like",
    meta: { needLogin: true },
    component: () => import("@/views/Like/layout.vue"),
    redirect: "/like/playlists",
    children: [
      {
        path: "playlists",
        name: "like-playlists",
        component: () => import("@/views/Like/playlists.vue"),
      },
      {
        path: "albums",
        name: "like-albums",
        component: () => import("@/views/Like/albums.vue"),
      },
      {
        path: "artists",
        name: "like-artists",
        component: () => import("@/views/Like/artists.vue"),
      },
      {
        path: "videos",
        name: "like-videos",
        component: () => import("@/views/Like/videos.vue"),
      },
    ],
  },
  // 下载管理
  {
    path: "/download",
    name: "download",
    meta: { needApp: true },
    component: () => import("@/views/Download/layout.vue"),
    redirect: "/download/downloaded",
    children: [
      {
        path: "downloaded",
        name: "download-downloaded",
        component: () => import("@/views/Download/downloaded.vue"),
      },
      {
        path: "downloading",
        name: "download-downloading",
        component: () => import("@/views/Download/downloading.vue"),
      },
    ],
  },
  // 下载管理
  {
    path: "/download",
    name: "download",
    meta: { needApp: true },
    component: () => import("@/views/Download/layout.vue"),
    redirect: "/download/downloaded",
    children: [
      {
        path: "downloaded",
        name: "download-downloaded",
        component: () => import("@/views/Download/downloaded.vue"),
      },
      {
        path: "downloading",
        name: "download-downloading",
        component: () => import("@/views/Download/downloading.vue"),
      },
    ],
  },
  // 本地歌曲
  {
    path: "/local",
    name: "local",
    meta: { needApp: true },
    component: () => import("@/views/Local/layout.vue"),
    redirect: "/local/songs",
    children: [
      {
        path: "songs",
        name: "local-songs",
        component: () => import("@/views/Local/song.vue"),
      },
      {
        path: "artists",
        name: "local-artists",
        component: () => import("@/views/Local/artists.vue"),
      },
      {
        path: "albums",
        name: "local-albums",
        component: () => import("@/views/Local/albums.vue"),
      },
      {
        path: "folders",
        name: "local-folders",
        component: () => import("@/views/Local/folders.vue"),
      },
    ],
  },
  // 最近播放
  {
    path: "/history",
    name: "history",
    component: () => import("@/views/History.vue"),
  },

  // 分类管理
  {
    path: "/category-management",
    name: "category-management",
    component: () => import("@/views/CategoryManagement/index.vue"),
    meta: {
      title: "分类管理",
      keepAlive: true,
      transition: "slide",
    },
  },
  // 用户管理
  {
    path: '/user-management',
    name: 'UserManagement',
    component: () => import('@/views/UserManagement/index.vue'),
    meta: {
      title: '用户管理',
      keepAlive: true,
      transition: 'slide-left',
    }
  },
  // 状态
  {
    path: "/403",
    name: "403",
    component: () => import("@/views/Status/403.vue"),
  },
  {
    path: "/404",
    name: "404",
    component: () => import("@/views/Status/404.vue"),
  },
  {
    path: "/500",
    name: "500",
    component: () => import("@/views/Status/500.vue"),
  },
];
const routes: Array<RouteRecordRaw> = [
  // 应用路由
  {
    path: "/",
    component: AppLayout,
    children: [...appRoutes],
  },
  // 桌面歌词
  {
    path: "/desktop-lyric",
    name: "desktop-lyric",
    component: () => import("@/views/DesktopLyric/index.vue"),
  },
  // 404
  {
    path: "/:pathMatch(.*)*",
    redirect: "/404",
  },
];
export default routes;
