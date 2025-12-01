import { songDetail } from "@/api/song";
import { formatSongsList } from "@/utils/format";
import { usePlayer } from "@/utils/player";

class OrpheusData {
  constructor(type: string, id: number, cmd: string) {
    this.type = type;
    this.id = id;
    this.cmd = cmd;
  }

  type: string;
  id: number;
  cmd: string;
}

export const handleProtocolUrl = (url: string) => {
  switch (true) {
    case url.startsWith("orpheus://"):
      handleOpenOrpheus(url);
      break;
    default:
      break;
  }
}



export const handleOpenOrpheus = async (url: string) => {
  const data = parseOrpheus(url);
  if (!data) return;
  console.log("🚀 Open Orpheus:", data);

  if (data.cmd === "play" && data.type === "song") {
    const player = usePlayer();
    const result = await songDetail(data.id);
    const song = formatSongsList(result.songs)[0];
    player.addNextSong(song, true);
  } else {
    console.log("❌ Unsupported Command or Type:", data);
  }
};

const parseOrpheus = (url: string): OrpheusData | undefined => {
  // 这里的协议是从网页端打开官方客户端的协议
  // 形如 `orpheus://eyJ0eXBlIjoic29uZyIsImlkIjoiMTgyNjM2MTcxMiIsImNtZCI6InBsYXkifQ==`
  // URI 的 Path 部分是 Base64 编码过的，解码后得到 Json
  // 形如 `{"type":"song","id":"1826361712","cmd":"play"}`

  if (!url.startsWith("orpheus://")) return;
  const path = url.replace("orpheus://", "");
  const jsonString = atob(path);
  let data: OrpheusData;
  try {
    const json = JSON.parse(jsonString);
    data = new OrpheusData(json.type, json.id, json.cmd);
  } catch (e) {
    console.error("❌ Invalid Data:", e);
    return;
  }
  return data;
}
