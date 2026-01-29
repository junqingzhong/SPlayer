<template>
  <div class="song-wiki">
      <!-- 头部信息 -->
      <div v-if="songInfo" class="header">
        <div class="cover">
          <n-image
            :src="songInfo.cover"
            class="cover-img"
            :img-props="{ style: { width: '100%', height: '100%', borderRadius: '8px' } }"
          />
          <!-- 封面背板 (Songlist Style) -->
          <n-image
            class="cover-shadow"
            preview-disabled
            :src="songInfo.cover"
          />
        </div>
        <div class="info">
          <n-h1>{{ songInfo.name }}</n-h1>
          <div class="meta">
            <n-text depth="3">歌手：</n-text>
            <template v-if="Array.isArray(songInfo.artists)">
                <span v-for="(ar, index) in songInfo.artists" :key="ar.id">
                  <n-text>{{ ar.name }}</n-text>
                  <span v-if="Number(index) < songInfo.artists.length - 1"> / </span>
                </span>
            </template>
            <n-text v-else>{{ songInfo.artists }}</n-text>
          </div>
          <div class="meta" v-if="songInfo.album">
            <n-text depth="3">专辑：</n-text>
            <n-text>{{ typeof songInfo.album === 'string' ? songInfo.album : songInfo.album.name }}</n-text>
          </div>
          <div class="actions">
            <n-flex>
                <n-button type="primary" strong secondary round :focusable="false" @click="handlePlay">
                    <template #icon>
                        <SvgIcon name="Play" />
                    </template>
                    播放
                </n-button>
            </n-flex>
          </div>
        </div>
      </div>

      <n-divider />

      <!-- 数据展示区域 -->
      <div v-if="wikiData || userRecord" class="wiki-content">
        

        <!-- 遍历 Blocks -->
        <template v-for="(block, index) in wikiData.blocks" :key="index">
          <!-- 音乐百科 (Tags, Language, CPM, etc) -->
          <div v-if="block.code === 'SONG_PLAY_ABOUT_SONG_BASIC'" class="section">
            <n-h2 prefix="bar">
              {{ block.uiElement?.mainTitle?.title || "音乐百科" }}
            </n-h2>

            <!-- 音乐故事 (Merged) -->
            <div v-if="userRecord" class="record-section" style="margin-bottom: 24px;">
                 <div class="group-header">
                    <n-text strong>音乐故事</n-text>
                 </div>
                 <div class="record-grid">
                     <!-- 第一次听 -->
                     <div v-if="userRecord.firstListen" class="record-item">
                         <div class="content" style="padding-left: 0;">
                             <div class="title">初次相遇</div>
                             <div class="desc">{{ userRecord.firstListen.season }} {{ userRecord.firstListen.period }} · {{ userRecord.firstListen.date }}</div>
                             <div class="sub-desc" v-if="userRecord.firstListen.meetDurationDesc">{{ userRecord.firstListen.meetDurationDesc }}</div>
                         </div>
                     </div>

                     <!-- 累计播放 -->
                     <div v-if="userRecord.totalPlay" class="record-item">
                         <div class="content" style="padding-left: 0;">
                             <div class="title">播放计数</div>
                             <div class="desc">累计播放 {{ userRecord.totalPlay.playCount }} 次</div>
                             <div class="sub-desc">{{ userRecord.totalPlay.text }}</div>
                         </div>
                     </div>

                     <!-- 红心收藏 -->
                     <div v-if="userRecord.likeSong && userRecord.likeSong.like" class="record-item">
                         <div class="content" style="padding-left: 0;">
                             <div class="title">红心收藏</div>
                             <div class="desc">{{ userRecord.likeSong.text }}</div>
                             <div class="sub-desc" v-if="userRecord.likeSong.redDesc">{{ userRecord.likeSong.redDesc }}</div>
                         </div>
                     </div>
                 </div>
            </div>

            <div class="group-header" style="margin-bottom: 12px;">
                <n-text strong>音乐简介</n-text>
            </div>
            <div class="basic-grid">
              <template v-for="(creative, cIndex) in block.creatives" :key="cIndex">
                <!-- 标签类 (曲风/推荐标签) -->
                <div
                  v-if="['songTag', 'songBizTag'].includes(creative.creativeType)"
                  class="info-item"
                >
                  <n-text depth="3" class="label">{{ creative.uiElement?.mainTitle?.title }}</n-text>
                  <div class="tags-wrapper">
                    <n-tag
                      v-for="(res, rIndex) in creative.resources"
                      :key="rIndex"
                      :bordered="false"
                      round
                      size="small"
                      class="custom-tag"
                    >
                      {{ res.uiElement?.mainTitle?.title }}
                    </n-tag>
                  </div>
                </div>

                <!-- 简单文本 (语种/BPM) -->
                <div v-else-if="['language', 'bpm'].includes(creative.creativeType)" class="info-item">
                  <n-text depth="3" class="label">{{ creative.uiElement?.mainTitle?.title }}</n-text>
                  <n-text class="value">
                    {{ creative.uiElement?.textLinks?.[0]?.text || "-" }}
                  </n-text>
                </div>
                
                <!-- 乐谱 (单独展示，优先使用 /sheet/list 的数据) -->
                <div v-else-if="creative.creativeType === 'sheet' && (sheetList.length > 0 || (creative.resources && creative.resources.length > 0))" class="sheet-section">
                    <n-h2 class="section-title">
                      {{ creative.uiElement?.mainTitle?.title || "乐谱" }}
                    </n-h2>
                    <div class="sheet-grid" v-if="sheetList.length">
                      <div
                        v-for="(sheet, rIndex) in sheetList"
                        :key="sheet.id || rIndex"
                        class="sheet-item"
                        @click="openSheetPreview(sheet)"
                      >
                        <div class="image-wrapper">
                          <n-image
                            v-if="sheet.coverImageUrl"
                            :src="sheet.coverImageUrl"
                            class="sheet-img"
                            width="120"
                            height="120"
                            lazy
                            object-fit="contain"
                            :preview-disabled="true"
                          />
                        </div>
                        <n-text class="sheet-title" size="small">
                          {{ sheet.name || `乐谱 ${rIndex + 1}` }}
                        </n-text>
                      </div>
                    </div>
                    <!-- 如果 /sheet/list 没有返回数据，则回退到原来的百科乐谱展示 -->
                    <div class="sheet-grid" v-else>
                         <div
                            v-for="(res, rIndex) in creative.resources"
                            :key="rIndex"
                            class="sheet-item"
                         >
                            <div class="image-wrapper">
                                <n-image
                                    v-if="res.uiElement?.images?.[0]?.imageUrl"
                                    :src="res.uiElement.images[0].imageUrl"
                                    class="sheet-img"
                                    width="120"
                                    height="120"
                                    lazy
                                    object-fit="contain"
                                    :render-toolbar="(props: any) => renderSheetToolbar(props.nodes, res.uiElement.images[0].imageUrl, res.uiElement?.mainTitle?.title)"
                                />
                            </div>
                            <n-text v-if="res.uiElement?.mainTitle?.title" class="sheet-title" size="small">
                                {{ res.uiElement.mainTitle.title }}
                            </n-text>
                         </div>
                    </div>
                </div>

                <!-- 列表类 (获奖成就/影视节目) -->
                <div
                  v-else-if="['songAward', 'entertainment'].includes(creative.creativeType)"
                  class="info-item"
                >
                  <n-text depth="3" class="label">{{ creative.uiElement?.mainTitle?.title }}</n-text>
                  
                  <div class="resources-list">
                    <div
                      v-for="(res, rIndex) in creative.resources"
                      :key="rIndex"
                      class="resource-item"
                    >
                          <n-image
                            v-if="res.uiElement?.images?.[0]?.imageUrl"
                            :src="res.uiElement.images[0].imageUrl"
                            class="res-img"
                            width="48"
                            height="48"
                            lazy
                            :preview-disabled="true"
                            object-fit="cover"
                            style="border-radius: 6px"
                          />
                          <div class="res-info">
                            <n-text class="res-title text-hidden" :title="res.uiElement?.mainTitle?.title">
                              {{ res.uiElement?.mainTitle?.title || "未知" }}
                            </n-text>
                            <n-text
                              v-if="res.uiElement?.subTitles?.[0]?.title"
                              depth="3"
                              size="small"
                              class="text-hidden"
                            >
                              {{ res.uiElement.subTitles.map((s: any) => s.title).join(" / ") }}
                            </n-text>
                            <n-text
                               v-if="res.uiElement?.images?.[0]?.title"
                               depth="3"
                               size="small"
                             >
                               {{ res.uiElement.images[0].title }}
                            </n-text>
                          </div>
                        </div>
                      </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 相似歌曲 -->
          <div
            v-if="block.code === 'SONG_PLAY_ABOUT_SIMILAR_SONG' && similarSongs.length > 0"
            class="section"
          >
            <n-h2 prefix="bar">{{ block.uiElement?.mainTitle?.title || "相似歌曲" }}</n-h2>
            <SongList :data="similarSongs" height="auto" :hidden-album="true" />
          </div>
        </template>

      </div>
      <div v-else>
        <n-empty description="暂无百科信息" />
      </div>

      <!-- 乐谱预览弹窗（点击乐谱卡片后，通过 /sheet/preview 获取完整内容展示） -->
      <n-modal
        v-model:show="sheetPreviewVisible"
        preset="card"
        :title="currentSheetTitle || '乐谱预览'"
        class="sheet-preview-modal"
        :style="{ maxWidth: '900px' }"
      >
        <div v-if="sheetPreviewImages.length" class="sheet-preview-body">
          <div
            v-for="(img, index) in sheetPreviewImages"
            :key="index"
            class="sheet-preview-page"
          >
            <n-image
              :src="img"
              width="100%"
              :preview-disabled="true"
              object-fit="contain"
              class="sheet-preview-image"
              @click="downloadPreviewPage(img, index)"
            />
            <n-text depth="1" size="medium" class="page-tip">
              第 {{ index + 1 }} 页 / 共 {{ sheetPreviewImages.length }} 页
            </n-text>
          </div>
        </div>
        <n-empty v-else description="暂无乐谱预览数据" />
      </n-modal>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { songDetail, songWikiSummary, songSheetList, songSheetPreview, songFirstListenInfo } from '@/api/song';
import { NImage, NH1, NH2, NText, NDivider, NTag, NEmpty, NModal, NButton, NFlex } from 'naive-ui';
import SongList from "@/components/List/SongList.vue";
import { SongType } from '@/types/main';

import { formatSongsList } from '@/utils/format';
import { isElectron } from '@/utils/env';
import { ref, onMounted, watch, h, resolveComponent } from 'vue';
import { usePlayerController } from "@/core/player/PlayerController";
import dayjs from 'dayjs';

const route = useRoute();

const loading = ref(false);
const songInfo = ref<any>(null);
const wikiData = ref<any>(null);
const userRecord = ref<any>(null);
const similarSongs = ref<SongType[]>([]);
const sheetList = ref<any[]>([]);
// 当前预览的乐谱
const sheetPreviewVisible = ref(false);
const sheetPreviewImages = ref<string[]>([]);
const currentSheetTitle = ref<string>('');
// 回忆坐标信息列表
const firstListenList = ref<any[]>([]);

const player = usePlayerController();

const handlePlay = () => {
  if (songInfo.value) {
    player.updatePlayList([songInfo.value], songInfo.value);
  }
};

const renderSheetToolbar = (nodes: any, url: string, title?: string) => {
    const customDownload = h('div', {
        class: 'n-image-preview-toolbar-action',
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '26px', // Match typical toolbar icon size
            color: 'inherit'
        },
        onClick: (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            handleDownloadSheet(url, title);
        }
    }, [
        h(resolveComponent('SvgIcon'), { name: 'Download', size: '22' })
    ]);

    return [
       nodes.rotateCounterclockwise,
       nodes.rotateClockwise,
       nodes.resizeToOriginalSize,
       nodes.zoomOut,
       nodes.zoomIn,
       customDownload,
       nodes.close
    ];
};

const fetchData = async () => {
  const id = Number(route.query.id);
  if (!id) return;
  
  loading.value = true;
  wikiData.value = null;
  songInfo.value = null;
  userRecord.value = null;
  similarSongs.value = [];
  sheetList.value = [];
  firstListenList.value = [];

  try {
    const detailRes = await songDetail(id);
    if (detailRes.songs && detailRes.songs.length > 0) {
      songInfo.value = formatSongsList(detailRes.songs)[0];
    }
    const wikiRes = await songWikiSummary(id);
    // 处理 API 返回的数据结构
    const data = wikiRes.data || wikiRes; 
    wikiData.value = data; 
    const fallbackPayload: any = data?.data ?? data;
    const fallbackRecord: any = {};
    if (fallbackPayload?.musicFirstListenDto) fallbackRecord.firstListen = fallbackPayload.musicFirstListenDto;
    if (fallbackPayload?.musicTotalPlayDto) fallbackRecord.totalPlay = fallbackPayload.musicTotalPlayDto;
    if (fallbackPayload?.musicLikeSongDto) fallbackRecord.likeSong = fallbackPayload.musicLikeSongDto;
    if (Object.keys(fallbackRecord).length > 0 && !userRecord.value) {
      userRecord.value = fallbackRecord;
    }
    // 回忆坐标信息
    try {
      const firstInfoRes: any = await songFirstListenInfo(id);
      const raw = firstInfoRes?.data ?? firstInfoRes;
      const payload = raw?.data ?? raw;

      const record: any = {};
      if (payload?.musicFirstListenDto) record.firstListen = payload.musicFirstListenDto;
      if (payload?.musicTotalPlayDto) record.totalPlay = payload.musicTotalPlayDto;
      if (payload?.musicLikeSongDto) record.likeSong = payload.musicLikeSongDto;
      if (Object.keys(record).length > 0) {
        userRecord.value = record;
      }

      const listCandidate =
        (Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.list)
          ? payload.list
          : Array.isArray(payload?.firstListenList)
          ? payload.firstListenList
          : Array.isArray(payload?.memoryList)
          ? payload.memoryList
          : payload?.musicFirstListenDto
          ? [payload.musicFirstListenDto]
          : payload?.firstListen
          ? [payload.firstListen]
          : payload
          ? [payload]
          : []) || [];

      firstListenList.value = listCandidate.map((item: any, index: number) => {
        const base = item || {};
        const sceneText = base.sceneText || [base.season, base.period].filter(Boolean).join(' ');
        const timeText =
          base.timeText ||
          base.listenTimeText ||
          (typeof base.listenTime === 'number'
            ? dayjs(base.listenTime).format('YYYY-MM-DD HH:mm')
            : base.listenTime) ||
          base.date;
        const title =
          base.title ||
          base.mainTitle ||
          base.sceneText ||
          (index === 0 ? '初次相遇' : undefined);
        return {
          ...base,
          title,
          sceneText,
          timeText,
        };
      });
    } catch (e) {
      console.error('Failed to fetch first listen info', e);
    }

    // 乐谱列表（通过 /sheet/list 获取，防止百科里的乐谱不完整）
    try {
      const sheetRes: any = await songSheetList(id);
      // 接口结构：{ code, data: { musicSheetSimpleInfoVOS: [...] } }
      const list = sheetRes?.data?.musicSheetSimpleInfoVOS;
      if (Array.isArray(list)) {
        sheetList.value = list;
      }
    } catch (e) {
      console.error("Failed to fetch song sheet list", e);
    }
    
    // Process Similar Songs
    if (data.blocks) {
        const similarBlock = data.blocks.find((b:any) => b.code === 'SONG_PLAY_ABOUT_SIMILAR_SONG');
        if(similarBlock && similarBlock.creatives?.length > 0) {
            const creative = similarBlock.creatives[0];
            if(creative.resources) {
                const songIds = creative.resources.map((res:any) => res.resourceId).filter(Boolean);
                if(songIds.length > 0) {
                   const songsRes = await songDetail(songIds);
                   if(songsRes.songs) {
                       similarSongs.value = formatSongsList(songsRes.songs);
                   }
                }
            }
          }
    }

  } catch (error) {
    console.error("Failed to fetch song wiki data", error);
  } finally {
    loading.value = false;
  }
};

/**
 * 打开乐谱预览
 * 点击乐谱卡片时，通过 /sheet/preview 获取完整乐谱内容并展示
 */
const openSheetPreview = async (sheet: any) => {
  if (!sheet?.id) return;
  try {
    currentSheetTitle.value = sheet.name || '乐谱';
    sheetPreviewImages.value = [];
    const res: any = await songSheetPreview(sheet.id);
    const data = res?.data ?? res;

    // /sheet/preview 返回格式：{ code, data: [ { url, pageNumber, ... } ] }
    // 如果 data 本身就是数组，就直接用它；否则尝试从其他字段中兜底提取
    const candidates =
      (Array.isArray(data)
        ? data
        : data?.pageList ||
          data?.pages ||
          data?.sheetPageImageUrls ||
          data?.imageUrls ||
          data?.images ||
          data?.urls) || [];

    const list = Array.isArray(candidates) ? candidates : [];

    const imgs = list
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        return (
          item.pageImageUrl ||
          item.imageUrl ||
          item.url ||
          item.src ||
          item.picUrl ||
          null
        );
      })
      .filter((x: string | null): x is string => !!x);

    if (!imgs.length) {
      window.$message?.warning?.('暂无乐谱预览数据');
      return;
    }

    sheetPreviewImages.value = imgs;
    sheetPreviewVisible.value = true;
  } catch (e) {
    console.error('Failed to fetch sheet preview', e);
    window.$message?.error?.('获取乐谱预览失败');
  }
};

/**
 * 在乐谱预览弹窗中，点击大图直接保存当前页
 */
const downloadPreviewPage = (url: string, index: number) => {
  if (!url) return;
  const baseTitle = currentSheetTitle.value || '乐谱';
  const title = `${baseTitle}-第${index + 1}页`;
  handleDownloadSheet(url, title);
};

const handleDownloadSheet = async (url: string | undefined, title: string | undefined) => {
    if (!url) return;
    if (!isElectron) {
        window.$message.warning("仅支持客户端下载");
        return;
    }
    try {
        const path = await window.electron.ipcRenderer.invoke("choose-path", "选择保存位置");
        if (!path) return;

        const ext = url.split(".").pop()?.split("?")[0] || "jpg";
        const fileName = title || "乐谱";

        window.$message.loading("正在下载...");
        const res = await window.electron.ipcRenderer.invoke("download-file", url, {
            path,
            fileName,
            fileType: ext,
            skipIfExist: false
        });

        if (res.status === "success") {
            window.$message.success("下载成功");
        } else {
            window.$message.error("下载失败: " + res.message);
        }
    } catch (e) {
        console.error(e);
        window.$message.error("下载出错");
    }
};

onMounted(() => {
  fetchData();
});

watch(
  () => route.query.id,
  () => {
    fetchData();
  }
);

</script>

<style scoped lang="scss">
.song-wiki {
  padding: 24px 32px;
  width: 100%;
  padding-bottom: 60px;

  .header {
    display: flex;
    gap: 32px;
    align-items: flex-start; // 标题和文字与封面顶部对齐，风格与歌单列表一致
    margin-bottom: 24px;
    @media (max-width: 600px) {
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .cover {
      position: relative; // Needed for absolute positioning of shadow
      width: 220px;
      height: 220px;
      flex-shrink: 0;
      border-radius: 8px;
      // box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); // Removed to use internal shadow style

      .cover-img {
          position: relative;
          z-index: 1;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      }

      .cover-shadow {
        position: absolute;
        top: 6px;
        left: 0; // Ensure it aligns
        height: 100%;
        width: 100%;
        filter: blur(12px) opacity(0.6);
        transform: scale(0.92, 0.96);
        z-index: 0;
        background-size: cover;
        border-radius: 8px;
        // aspect-ratio: 1/1; // Optional
        :deep(img) {
          opacity: 1;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      padding-bottom: 0;
      height: 220px;

      h1 {
          font-size: 32px;
          font-weight: 700;
          margin: 0;
          line-height: 1.2;
      }

      .meta {
        font-size: 14px;
        opacity: 0.8;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .actions {
        margin-top: auto;
        :deep(.n-button) {
            height: 40px;
            padding: 0 24px;
            font-size: 16px;
        }
      }
    }
  }

  .wiki-content {
    display: flex;
    flex-direction: column;
    gap: 32px;
    
    .section {
        h2 {
            margin-bottom: 16px;
            font-size: 20px;
            font-weight: 600;
        }
    }

    /* 通用分组标题样式 (音乐故事/音乐简介) */
    .group-header {
       margin-bottom: 12px;
       font-size: 16px;
       color: var(--n-text-color);
       opacity: 0.9;
    }
    
    .record-section {
        .record-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
            
            .record-item {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 16px;
                border-radius: 12px;
                border: 2px solid rgba(var(--primary), 0.12);
                background-color: var(--surface-container-hex);
                transition:
                  transform 0.1s,
                  background-color 0.3s var(--n-bezier),
                  border-color 0.3s var(--n-bezier);
                
                &:hover {
                    border-color: rgba(var(--primary), 0.58);
                }

                .content {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    flex: 1;
                    
                    .title {
                        font-size: 13px;
                        font-weight: 600;
                        opacity: 0.6;
                        margin-bottom: 0;
                    }
                    .desc {
                        font-size: 16px;
                        font-weight: 600;
                        opacity: 1;
                    }
                    .sub-desc {
                        font-size: 12px;
                        opacity: 0.6;
                        margin-top: -8px; /* Pull closer to desc */
                    }
                }
            }
        }
    }

    .basic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 16px;

      .info-item {
         display: flex;
         flex-direction: column;
         gap: 12px;
         background-color: var(--surface-container-hex);
         padding: 16px;
         border-radius: 12px;
         border: 2px solid rgba(var(--primary), 0.12);
         transition:
           transform 0.1s,
           background-color 0.3s var(--n-bezier),
           border-color 0.3s var(--n-bezier);
         
         &:hover {
             border-color: rgba(var(--primary), 0.58);
         }
         
         .label {
             font-size: 13px;
             font-weight: 600;
             opacity: 0.6;
         }
         .value {
             font-size: 16px;
             font-weight: 600;
         }
         .tags-wrapper {
             display: flex;
             flex-wrap: wrap;
             gap: 8px;
         }

         .resources-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
              
              .resource-item {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  background-color: transparent;
                  padding: 8px;
                  border-radius: 8px;
                  transition: background-color 0.2s;
                  
                  &:hover {
                      background-color: rgba(255, 255, 255, 0.08);
                  }
                  
                  .res-info {
                      display: flex;
                      flex-direction: column;
                      flex: 1;
                      overflow: hidden;
                      gap: 2px;
                      
                      .res-title, .text-hidden {
                          font-size: 14px;
                          font-weight: 600;
                          // Allow wrapping
                          white-space: normal !important;
                          overflow: visible !important;
                          display: block !important;
                          -webkit-line-clamp: unset !important;
                          line-clamp: unset !important;
                          height: auto !important;
                      }
                  }
              }
         }
      }
    }
    
    .sheet-section {
        grid-column: 1 / -1;
        
        .section-title {
            margin-bottom: 16px;
            font-size: 20px;
            font-weight: 600;
        }
        
        .sheet-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 20px;
            
            .sheet-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                transition: transform 0.2s;
                
                &:hover {
                    transform: translateY(-4px);
                }
                
                .image-wrapper {
                    position: relative;
                    border-radius: 8px;
                    overflow: hidden;
                    background-color: #fff;
                    padding: 4px;
                }
                
                .sheet-title {
                    text-align: center;
                    opacity: 0.8;
                    font-size: 13px;
                }
            }
        }
    }

  /* 回忆坐标 */
  .memory-section {
    .memory-list {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .memory-item {
      padding: 16px;
      border-radius: 12px;
      background-color: var(--surface-container-hex);
      border: 2px solid rgba(var(--primary), 0.12);
      transition:
        transform 0.1s,
        background-color 0.3s var(--n-bezier),
        border-color 0.3s var(--n-bezier);
      
      &:hover {
         border-color: rgba(var(--primary), 0.58);
      }
    }

    .memory-title {
      font-size: 14px;
      font-weight: 600;
    }

    .memory-meta {
      display: inline-block;
      margin-top: 4px;
      font-size: 12px;
    }
  }
  }

  /* 乐谱预览弹窗样式 */
  .sheet-preview-modal {
    .sheet-preview-body {
      max-height: 80vh;
      overflow-y: auto;
    }

    .sheet-preview-page {
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .sheet-preview-image {
      cursor: pointer;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      background-color: #fff;
    }

    .page-tip {
      font-weight: 700;
      font-size: 18px;
      opacity: 1;
      padding: 4px 10px;
      border-radius: 999px;
      background-color: rgba(0, 0, 0, 0.55);
      color: #fff;
    }
  }
}
</style>
