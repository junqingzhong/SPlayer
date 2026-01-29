export interface CreativeResource {
  uiElement: {
    mainTitle?: { title?: string };
    subTitles?: { title?: string }[];
    textLinks?: { text?: string }[];
    images?: { imageUrl?: string; title?: string }[];
  };
  resources?: {
    uiElement: {
      mainTitle?: { title?: string };
      subTitles?: { title?: string }[];
      images?: { imageUrl?: string; title?: string }[];
    };
    resourceId?: number;
  }[];
  creativeType: string;
}

export interface WikiBlock {
  code: string;
  uiElement?: {
    mainTitle?: { title?: string };
  };
  creatives?: CreativeResource[];
}

export interface SongWikiData {
  blocks: WikiBlock[];
}

export interface UserRecord {
  firstListen?: {
    season?: string;
    period?: string;
    date?: string;
    meetDurationDesc?: string;
    sceneText?: string;
    timeText?: string;
  };
  totalPlay?: {
    playCount?: number;
    text?: string;
  };
  likeSong?: {
    like?: boolean;
    text?: string;
    redDesc?: string;
  };
}

export interface SheetInfo {
  id: number;
  name: string;
  type?: string;
  playVersion?: string;
  coverImageUrl: string;
  images?: string[]; // Added to support pre-fetching
}

export interface BasicInfoItem {
  label: string;
  value?: string;
  tags?: string[];
  type: "text" | "tags";
}

export interface ResourceInfoItem {
  image?: string;
  title: string;
  subTitle?: string;
}

export interface WikiViewModel {
  story?: UserRecord;
  basicInfo: BasicInfoItem[];
  sheets: SheetInfo[];
  awards: ResourceInfoItem[];
  credentials: ResourceInfoItem[];
  similarSongs: number[]; // IDs
}
