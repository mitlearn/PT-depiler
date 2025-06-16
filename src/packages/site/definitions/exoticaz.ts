import {
  type ISearchInput,
  type ISiteMetadata,
  type IUserInfo,
  type ITorrent,
  type ITorrentTag,
} from "../types";
import AvistazTracker, { SchemaMetadata, IAvzTRawTorrent} from "../schemas/AvistazTracker.ts";

const categoryMap: Record<number, string> = {
  1: "Video Clips",
  2: "Video Pack",
  3: "Siterip Pack",
  4: "Pornstar Pack",
  5: "DVD",
  6: "BluRay",
  7: "Photo Pack",
  8: "Books & Magazines",
};

const resolutionMap: Record<number, string> = {
  1: "240p",
  2: "360p",
  3: "480p",
  4: "720p",
  5: "1080p",
  6: "2160p",
  7: "4320p",
  8: "VR 180°",
  9: "VR 360°",
};

const discountMap: Record<number, string> = {
  1: "Free-Download",
  2: "Half-Download",
  3: "Double Upload",
}

export const siteMetadata: ISiteMetadata = {
  ...SchemaMetadata,

  version: 1,
  id: "exoticaz",
  name: "ExoticaZ",
  aka: ["Exo"],
  description: "A porn-conten tracker of AvistaZ Network",
  tags: ["成人"],
  timezoneOffset: "+0100",

  type: "private",
  schema: "AvistazTracker",

  urls: ["uggcf://rkbgvpnm.gb/"],
  formerHosts: ["https://torrents.yourexotic.com/"],

  collaborator: [""],

  category: [
  	{
      name: "分类",
      key: "category",
      keyPath: "params",
      options: Object.entries(categoryMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "分辨率",
      key: "res",
      keyPath: "params",
      options: Object.entries(resolutionMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "促销",
      key: "discount",
      keyPath: "params",
      options: Object.entries(discountMap).map(([value, name]) => ({ name, value: Number(value) })),
      cross: { mode: "appendQuote" },
    },
    {
      name: "类型",
      key: "type",
      keyPath: "params",
      options: [
        { name: "Popular", value: "popular" },
        { name: "Asian", value: "asian" },
        { name: "Non-asian", value: "non_asian" },
        { name: "Softcore", value: "softcore" },
        { name: "Uncensored", value: "uncensored" },
        { name: "Censored", value: "censored" },
        { name: "Transexual", value: "transexual" },
      ],
      cross: { mode: "append", key: "" },
    },
  ],
  search: {
    ...SchemaMetadata.search!,
    advanceKeywordParams: {
      imdb: { enabled: false },
      tmdb: { enabled: false },
    },
    selectors: {
      ...SchemaMetadata.search!.selectors!,
    },
  },

  searchEntry: {
    area_all: { name: "成人", enabled: false },
  },

  levelRequirements: [
    {
      id: 1,
      name: "Leech",
      privilege: "Can download 1 torrent a day. Limited to download torrents uploaded 1 week ago. Cannot upload.",
    },
    {
      id: 2,
      name: "Newbie",
      privilege: "Can download 5 torrents a day. Cannot upload. Cannot use RSS.",
    },
    {
      id: 3,
      name: "Member",
      alternative: [{ ratio: 1 }, { interval: "P1W" }],
      privilege: "Can download 100 torrents a day. Can upload. Can use RSS (must enable it in My Account settings).",
    },
    {
      id: 100,
      name: "V.I.P.",
      groupType: "vip",
      privilege: "Can download 200 torrents a day. Can upload.",
    },
    // Staff Classes
    {
      id: 200,
      name: "Uploader",
      groupType: "manager",
      privilege: "Can upload.",
    },
    {
      id: 201,
      name: "Editor",
      groupType: "manager",
      privilege: "Can upload.",
    },
    { id: 205, name: "Moderator", groupType: "manager" },
    { id: 205, name: "Admin", groupType: "manager" },
    { id: 205, name: "Super Admin", groupType: "manager" },
  ],
};

export interface IExoRawTorrent extends IAvzTRawTorrent {
    asian: boolean;
    softcore: boolean;
    censored: boolean;
    gay: boolean;
    transexual: boolean;
    studios: { id: number; name: string }[];
    performers: { id: number; name: string }[];
    tags?: Record<string, string>[];
}

export default class Exoticaz extends AvistazTracker {
  static siteMetadata = siteMetadata;
  
  protected override parseTorrentRowForTags(
    torrent: Partial<ITorrent>,
    row: IExoRawTorrent,
    searchConfig: ISearchInput,
  ): Partial<ITorrent> {
    // 先调用父类方法，获取基础的促销标签处理
    const baseTorrent = super.parseTorrentRowForTags(torrent, row, searchConfig);

    // 直接使用row，不需要类型转换
    const exoData = row;

    // 生成副标题（演员名与标签）
    const tagsArray = Array.isArray(exoData.tags) ? exoData.tags : [];
    const performersArray = Array.isArray(exoData.performers) ? exoData.performers : [];
    
    // 提取tags的值（忽略键）
    const tagNames = tagsArray.flatMap((tagObj: Record<string, string>) => Object.values(tagObj)).filter(Boolean);
    
    // 提取performers的值（忽略键）
    const performerNames = performersArray.flatMap((performerObj: Record<string, string>) => Object.values(performerObj)).filter(Boolean);
    
    const performersStr = performerNames.join(" / ");
    const tagStr = tagNames.join(", ");
    const subTitle = [performersStr, tagStr].filter(Boolean).join(" | ");

    // 设置副标题
    if (subTitle) {
      baseTorrent.subTitle = subTitle;
    }

    // 可以在这里添加ExoticaZ特有的标签逻辑
    const existingTags = baseTorrent.tags || [];
    const newTags: ITorrentTag[] = [...existingTags];

    // 添加内容类型标签
    if (exoData.asian) {
      newTags.push({ name: "Asian", color: "pink" });
    }
    if (exoData.softcore) {
      newTags.push({ name: "Softcore", color: "light-blue" });
    }
    if (exoData.censored) {
      newTags.push({ name: "Censored", color: "grey" });
    }
    if (exoData.gay) {
      newTags.push({ name: "Gay", color: "rainbow" });
    }
    if (exoData.transexual) {
      newTags.push({ name: "Trans", color: "purple" });
    }

    updatedTorrent.tags = newTags;

    return updatedTorrent;
  }
}
