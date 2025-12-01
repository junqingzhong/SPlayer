class OrpheusData {
  constructor(type: string, id: string, cmd: string) {
    this.type = type;
    this.id = id;
    this.cmd = cmd;
  }

  type: string = "";
  id: string = "";
  cmd: string = "";
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



export const handleOpenOrpheus = (url: string) => {
  const data = parseOrpheus(url);
  if (!data) return;
  console.log("🚀 Open Orpheus:", data);

  // TODO 处理
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
