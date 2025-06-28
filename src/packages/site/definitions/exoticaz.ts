import { 
  ISiteMetadata,
  ISearchInput,
  IAdvancedSearchRequestConfig,
  ITorrent,
  ITorrentTag,
} from "../types";
// import AvistazNetwork, { SchemaMetadata, IAvzNetRawTorrent } from "../schemas/AvistazNetwork.ts";
import AvistazNetwork, { SchemaMetadata } from "../schemas/AvistazNetwork.ts";

import { sendMessage } from "@/messages.ts";
import type { IMetadataPiniaStorageSchema } from "@/shared/types/storages/metadata.ts";

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
  aka: ["Exo", "YourExotic"],
  description: "ExoticaZ (YourExotic) is a Private Torrent Tracker of AvistaZ Network for porn",
  tags: ["成人"],
  timezoneOffset: "+0100",

  type: "private",
  schema: "AvistazNetwork",

  urls: ["uggcf://rkbgvpnm.gb/"],
  formerHosts: ["https://torrents.yourexotic.com/"],

  collaborator: [""],

  category: [
    // {
    //   name: "搜索入口",
    //   key: "in",
    //   notes: "请选中成人以开启搜索",
    //   options: [{ name: "成人", value: "1" }],
    //   cross: false,
    //   generateRequestConfig: (selectedCategories) => {
    //     return { params: {} } as IAdvancedSearchRequestConfig;
    //   },
    // },
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
      tvdb: { enabled: false },
      tmdb: { enabled: false },
    },
    selectors: {
      rows: { selector: "data" },
      id: { selector: "id" },
      title: { selector: "file_hash" },
      subTitle: { text: "" }, // AvzNet不提供subTitle
      url: { selector: "url" },
      link: { selector: "download" },
      time: { selector: "created_at", filters: [{ name: "parseTime" }] },
      size: { selector: "file_size", filters: [{ name: "parseSize" }] },
      author: { text: "" },
      seeders: { selector: "seed" },
      leechers: { selector: "leech" },
      completed: { selector: "completed" },
      // tags 交由 parseTorrentRowForTags 处理
      // AvzNet不提供progress, status
      progress: { text: 0 },
    }
  },

  // searchEntry: {
  //   area_all: { name: "成人", enabled: false },
  // },

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

  userInputSettingMeta: [
    ...SchemaMetadata.userInputSettingMeta!,
    /*{
    name: "confirm",
    label: "If u confirm hint below, please enter CONFIRM",
    hint: "Only Member Rank and above can use search and must enable RSS for search",
    required: true,
  }*/
  ],
};

// export interface IExoRawTorrent extends IAvzNetRawTorrent {
//   asian: boolean;
//   softcore: boolean;
//   censored: boolean;
//   gay: boolean;
//   transexual: boolean;
//   studios: string[];
//   performers: {
//     [key: string]: string;
//   };
//   tags: string[];
// }

export default class Exoticaz extends AvistazNetwork {

  // protected override parseTorrentRowForTags(
  //   torrent: Partial<ITorrent>,
  //   row: IExoRawTorrent,
  //   searchConfig: ISearchInput,
  // ): Partial<ITorrent> {
  //   const extendTorrent = super.parseTorrentRowForTags(torrent, row, searchConfig);

  //   // 处理副标题相关逻辑
  //   const performersArray = Array.isArray(row.performers) ? row.performers : [];
  //   const performersNames = performersArray.map((a: any) => a.name).filter(Boolean);
  //   const performersStr = performersNames.join(" / ");
  //   extendTorrent.subTitle = performersStr

  //   const tags: ITorrentTag[] = [];
  //   const statusTags: Record<string, { name: string }> = {
  //     asian: { name: "亚洲" },
  //     softcore: { name: "擦边" },
  //     censored: { name: "有码" },
  //     gay: { name: "gay" },
  //     transexual: { name: "trans" },
  //   };
  //   for (const key of Object.keys(statusTags)) {
  //     if (key in row && (row as Record<string, any>)[key] === true) {
  //       tags.push(statusTags[key as keyof typeof statusTags]);
  //     }
  //   }
  //   extendTorrent.tags = tags;
    
  //   return extendTorrent;
  // }

}
