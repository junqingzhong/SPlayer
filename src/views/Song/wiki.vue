<template>
  <div class="song-wiki">
    <n-spin :show="loading">
      <!-- 头部信息 -->
      <div v-if="songInfo" class="header">
        <div class="cover">
          <n-image
            :src="songInfo.al?.picUrl"
            class="cover-img"
            :img-props="{ style: { width: '100%', height: '100%', borderRadius: '8px' } }"
          />
        </div>
        <div class="info">
          <n-h1>{{ songInfo.name }}</n-h1>
          <div class="meta">
            <n-text depth="3">歌手：</n-text>
            <span v-for="(ar, index) in songInfo.ar" :key="ar.id">
              <n-text>{{ ar.name }}</n-text>
              <span v-if="Number(index) < songInfo.ar.length - 1"> / </span>
            </span>
          </div>
          <div class="meta">
            <n-text depth="3">专辑：</n-text>
            <n-text>{{ songInfo.al?.name }}</n-text>
          </div>
        </div>
      </div>

      <n-divider />

      <!-- 数据展示区域 -->
      <div v-if="wikiData" class="wiki-content">
        <!-- 遍历 Blocks -->
        <template v-for="(block, index) in wikiData.blocks" :key="index">
          <!-- 音乐百科 (Tags, Language, CPM, etc) -->
          <div v-if="block.code === 'SONG_PLAY_ABOUT_SONG_BASIC'" class="section">
            <n-h2 prefix="bar">
              {{ block.uiElement?.mainTitle?.title || "音乐百科" }}
            </n-h2>

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
                
                <!-- 乐谱 (单独展示) -->
                <div v-else-if="creative.creativeType === 'sheet'" class="sheet-section">
                    <n-h2 class="section-title">{{ creative.uiElement?.mainTitle?.title }}</n-h2>
                    <div class="sheet-grid">
                         <div
                            v-for="(res, rIndex) in creative.resources"
                            :key="rIndex"
                            class="sheet-item"
                            @click="handleDownloadSheet(res.uiElement?.images?.[0]?.imageUrl, res.uiElement?.mainTitle?.title)"
                         >
                            <n-image
                                v-if="res.uiElement?.images?.[0]?.imageUrl"
                                :src="res.uiElement.images[0].imageUrl"
                                class="sheet-img"
                                width="120"
                                height="120"
                                lazy
                                object-fit="contain"
                                preview-disabled
                            />
                            <n-text v-if="res.uiElement?.mainTitle?.title" class="sheet-title" size="small">
                                {{ res.uiElement.mainTitle.title }}
                            </n-text>
                         </div>
                    </div>
                </div>

                <!-- 列表类 (获奖成就/影视节目) -->
                <div
                  v-else-if="['songAward', 'entertainment'].includes(creative.creativeType)"
                  class="info-group"
                >
                  <div class="group-header">
                    <n-text strong>{{ creative.uiElement?.mainTitle?.title }}</n-text>
                  </div>
                  
                  <div class="info-card-content">
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
                </div>
              </template>
            </div>
          </div>

          <!-- 相似歌曲 -->
          <div v-if="block.code === 'SONG_PLAY_ABOUT_SIMILAR_SONG' && similarSongs.length > 0" class="section">
             <n-h2 prefix="bar">{{ block.uiElement?.mainTitle?.title || "相似歌曲" }}</n-h2>
             <SongList :data="similarSongs" height="auto" :hidden-album="true" />
          </div>
        </template>
      </div>
      <n-empty v-else-if="!loading" description="暂无百科信息" />
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { songDetail, songWikiSummary } from '@/api/song';
import { NSpin, NImage, NH1, NH2, NText, NDivider, NTag, NEmpty } from 'naive-ui';
import SongList from "@/components/List/SongList.vue";
import { SongType } from '@/types/main';


import { formatSongsList } from '@/utils/format';
import { isElectron } from '@/utils/env';
import { ref, onMounted, watch } from 'vue';

const route = useRoute();

const loading = ref(true);
const songInfo = ref<any>(null);
const wikiData = ref<any>(null);
const similarSongs = ref<SongType[]>([]);

const fetchData = async () => {
  const id = Number(route.query.id);
  if (!id) return;
  
  loading.value = true;
  wikiData.value = null;
  songInfo.value = null;
  similarSongs.value = [];

  try {
    const detailRes = await songDetail(id);
    if (detailRes.songs && detailRes.songs.length > 0) {
      songInfo.value = detailRes.songs[0];
    }
    const wikiRes = await songWikiSummary(id);
    // 处理 API 返回的数据结构
    const data = wikiRes.data || wikiRes; 
    wikiData.value = data; 
    
    // Process Similar Songs
    if(data.blocks) {
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
    align-items: flex-end;
    margin-bottom: 24px;
    @media (max-width: 600px) {
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .cover {
      width: 220px;
      height: 220px;
      flex-shrink: 0;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .info {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      padding-bottom: 12px;

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

    .basic-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 16px;

      .info-item {
         display: flex;
         flex-direction: column;
         gap: 12px;
         // Background similar to songlist (transparent or subtle)
         background-color: rgba(255, 255, 255, 0.02);
         padding: 20px;
         border-radius: 12px;
         // Remove border to match cleaner look
         // border: 1px solid var(--n-border-color);
         transition: background-color 0.2s;
         
         &:hover {
             background-color: rgba(255, 255, 255, 0.08);
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
      }
      
      .info-group {
          background-color: transparent;
          
          .group-header {
             margin-bottom: 12px;
             font-size: 16px;
             color: var(--n-text-color);
             opacity: 0.9;
          }
          
          .info-card-content {
              background-color: rgba(255, 255, 255, 0.02);
              padding: 20px;
              border-radius: 12px;
              transition: background-color 0.2s;
              
              &:hover {
                 background-color: rgba(255, 255, 255, 0.08);
              }

              .resources-list {
                  display: grid;
                  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                  gap: 16px;
                  
                  .resource-item {
                      display: flex;
                      align-items: center;
                      gap: 12px;
                      background-color: rgba(255, 255, 255, 0.05);
                      padding: 10px;
                      border-radius: 8px;
                      transition: background-color 0.2s;
                      
                      &:hover {
                          background-color: rgba(255, 255, 255, 0.1);
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
                              height: auto !important;
                          }
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
                cursor: pointer;
                transition: transform 0.2s;
                
                &:hover {
                    transform: translateY(-4px);
                }
                
                .sheet-img {
                    background-color: #fff;
                    border-radius: 8px;
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
  }
}
</style>
