import type { AxiosRequestConfig, AxiosResponse } from "axios";
import urlJoin from "url-join";
import Sizzle from "sizzle";
import { set } from "es-toolkit/compat";

import PrivateSite from "./AbstractPrivateSite";
import {
  EResultParseStatus,
  ETorrentStatus,
  type ISiteMetadata,
  type IUserInfo,
  type ITorrent,
  type ITorrentTag,
  type ISearchInput
} from "../types"; 
import {
  parseTimeWithZone,
  parseSizeString
} from "../utils";

export interface AvzNetAuthResp {
  token?: string;
  expiry?: number;
}

export interface AvzNetSearchResp {
  current_page: number;
  data: (IAvzNetRawTorrent)[];
  first_page_url: string;
  from: number;
  last_page: number;
  last_page_url: string;
  next_page_url: string;
  path: string;
  per_page: number;
  prev_page_url: null;
  to: number;
  total: number;
}

export interface IAvzNetRawTorrent {
  id: number;
  file_name: string;
  file_size: number;
  file_count: number;
  info_hash: string;
  url: string;
  download: string;
  category?: {
    [key: string]: string;
  };
  type?: string;
  video_quality?: string;
  created_at: string;
  seed: number;
  leech: number;
  completed: number;
  downloaded: number;
  download_multiply: number;
  upload_multiply: number;
  audio?: Array<{
    language: string;
  }>;
  subtitle?: Array<{
    language: string;
  }>;
  movie_tv?: {
    imdb: string;
    tmdb: string;
    tvdb: string;
  };
  images: string[];
  description: string;
  [key: string]: any;
}

export const SchemaMetadata: Pick<
  ISiteMetadata,
  "version" | "schema" | "type" | "timezoneOffset" | "search" | "userInfo" | "userInputSettingMeta"
> = {

  version: 0,
  schema: "AvistazNetwork",
  type: "private",
  // @refs: https://github.com/Jackett/Jackett/blob/ebf518a51d161b014be2718860d128363819e8b7/src/Jackett.Common/Indexers/Definitions/Abstract/AvistazTracker.cs#L28C9-L28C122
  timezoneOffset: "-0400", 

  search: {
    keywordPath: "data.search",
    requestConfig: {
      url: "/api/v1/jackett/torrents",
      responseType: "json",
      data: { in: 1, limit: 50 }, // 最大50个结果
    },
    advanceKeywordParams: {
      imdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "data.imdb", config!.data.search.replace("tt", ""));
          delete config!.params.search;
          return config!;
        }
      },
      tvdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "data.tvdb", config!.data.search);
          delete config!.data.search;
          return config!;
        }
      },
      tmdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "data.tmdb", config!.data.search);
          delete config!.data.search;
          return config!;
        }
      },
    },
    selectors: {
      rows: { selector: "data" },
      id: { selector: "id" },
      title: { selector: "file_name" },
      subTitle: { text: "" }, // Avz不提供subTitle
      url: { selector: "url" },
      link: { selector: "download" },
      category: { 
        selector: "category",
        filters: [(category: Record<string, string> | undefined) => {
          if (!category) return '';
          const values = Object.values(category);
          return values.length > 0 ? values[0] : '';
        }]
      },
      // time: { selector: "created_at", filters: [{ name: "parseTime" }] },
      // size: { selector: "file_size", filters: [{ name: "parseSize" }] },
      author: { text: "" },
      seeders: { selector: "seed" },
      leechers: { selector: "leech" },
      completed: { selector: "completed" },
      // tags 交由 parseTorrentRowForTags 处理
      // Avz不提供progress, status
      // progress: { text: 0 },
      // status: { text: ETorrentStatus.unknown },

      ext_imdb: { selector: "movie_tv.imdb", filters: [{ name: "extImdbId" }] },
    },
  },

  /*
    预留获取用户信息
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  userInfo: {
    pickLast: ["name"],
    selectors: {
      name: { selector: ["span.user-group.group-member"] },
      levelName: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(2)"] },
      uploaded: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(3)"], filters: [{ name: "parseSize" }] },
      downloaded: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(4)"], filters: [{ name: "parseSize" }] },
      ratio: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(5)"], filters: [{ name: "parseNumber" }] },
      bonus: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(9)"], filters: [{ name: "parseNumber" }] },
      joinTime: {
        selector: ["table.table-striped tr:contains('Joined') td:last-child"],
        filters: [
          { "name": "parseTime", "args": ["dd MMMM yyyy hh:mm a"] }
        ]
      },
      uploads: { selector: [".card .tag-green"], filters: [{ name: "parseNumber" }] },
      snatches: { selector: [".card .tag-yellow"], filters: [{ name: "parseNumber" }] },
      seeding: { selector: [".card .tag-indigo"], filters: [{ name: "parseNumber" }] },
      hnrUnsatisfied: { selector: [".card .tag-red"], filters: [{ name: "parseNumber" }] },
      // uploads: { selector: ["#content-area > div.card > div.card-body > div.card.mb-2.p-2 > ul > li:nth-child(1) > a"], filters: [{ name: "parseNumber" }] },
      // snatches: { selector: ["#content-area > div.card > div.card-body > div.card.mb-2.p-2 > ul > li:nth-child(2) > a"], filters: [{ name: "parseNumber" }] },
      // seeding: { selector: ["#content-area > div.card > div.card-body > div.card.mb-2.p-2 > ul > li:nth-child(3) > a"], filters: [{ name: "parseNumber" }] },
      // hnrUnsatisfied: { selector: ["#content-area > div.card > div.card-body > div.card.mb-2.p-2 > ul > li:nth-child(6) > a"], filters: [{ name: "parseNumber" }] },
    },
    // TODO：为减少token获取次数，预留存储位
    /*
      authToken: { selector: ["token"] },
      authExpiry: { selector: ["expiry"] },
    */
  },
 
  userInputSettingMeta: [
    {
      name: "username",
      label: "Username",
      hint: "Fill with your username", 
      required: true,
    },
    {
      name: "password",
      label: "Password",
      hint: "Fill with your password", 
      required: true,
    },
    {
      name: "pid",
      label: "PID",
      hint: "Find in Profile Site, reset in Account Setting Site if you want to reset" +
      "PID is like your password, you must keep it safe!",
      required: true,
    },
  ],
};

export default class AvistazNetwork extends PrivateSite {

  public override async getUserInfoResult(lastUserInfo: Partial<IUserInfo> = {}): Promise<IUserInfo> {
    let flushUserInfo: IUserInfo = {
      status: EResultParseStatus.unknownError,
      updateAt: +new Date(),
      site: this.metadata.id,
    };

    if (!this.allowQueryUserInfo) {
      flushUserInfo.status = EResultParseStatus.passParse;
      return flushUserInfo;
    }

    try {
      flushUserInfo = { ...flushUserInfo, ...(await this.getBaseInfoFromSite()) };
      if (flushUserInfo.name) {
        flushUserInfo = {
          ...flushUserInfo,
          ...(await this.getExtendInfoFromProfile(flushUserInfo.name as string)),
          ...(await this.getUserSeedingTorrents(flushUserInfo.name as string)),
        };
      }
      else {
        flushUserInfo.name = this.userConfig.inputSetting?.username;
        flushUserInfo = {
          ...flushUserInfo,
          ...(await this.getExtendInfoFromProfile(flushUserInfo.name as string)),
          ...(await this.getUserSeedingTorrents(flushUserInfo.name as string)),
        };
      }

      if (this.metadata.levelRequirements && flushUserInfo.levelName && typeof flushUserInfo.levelId === "undefined") {
        flushUserInfo.levelId = this.guessUserLevelId(flushUserInfo as IUserInfo);
      }
    
      flushUserInfo.status = EResultParseStatus.success;
    } catch (error) {
      flushUserInfo.status = EResultParseStatus.parseError;
    }

    return flushUserInfo;
  }

  protected async getBaseInfoFromSite(): Promise<Partial<IUserInfo>> {
    const { data: pageDocument } = await this.request<Document>({
      url: "/",
      responseType: "document",
    });

    return this.getFieldsData(
      pageDocument,
      this.metadata.userInfo?.selectors!,
      ["name", "levelName", "uploaded", "downloaded", "ratio", "bonus"]
    ) as Partial<IUserInfo>;
  }

  protected async getExtendInfoFromProfile(userName: string): Promise<Partial<IUserInfo>> {
    const { data: pageDocument } = await this.request<Document>({
      url: urlJoin("/profile", userName),
      responseType: "document",
    });

    return this.getFieldsData(
      pageDocument,
      this.metadata.userInfo?.selectors!,
      ["joinTime", "uploads", "snatches", "hnrUnsatisfied"]
    ) as Partial<IUserInfo>;
  }

  protected async getUserSeedingTorrents(userName: string): Promise<Partial<IUserInfo>> {
    const userSeedingTorrent: Partial<IUserInfo> = { seedingSize: 0 };

    const { data: seedPage } = await this.request<Document>({
      url: urlJoin("/profile", userName) + "/active",
      responseType: "document",
    });
    const rows = Sizzle("table .text-yellow", seedPage);
    rows.forEach((element) => {
      userSeedingTorrent.seedingSize! += parseSizeString((element as HTMLElement).innerText.trim());
    });

    return userSeedingTorrent;
  }

  public override async request<T>(
    axiosConfig: AxiosRequestConfig, 
    checkLogin: boolean = true
  ): Promise<AxiosResponse<T>> {
    // 获取请求的 URL 用于判断处理逻辑
    const isApiRequest = axiosConfig.url?.startsWith("/api/v1/jackett/") ?? false;;
    
    // 为特定的 API 端点设置默认的 HTTP 方法
    if (axiosConfig.url === "/api/v1/jackett/auth" && !axiosConfig.method) {
      axiosConfig.method = "POST";
      axiosConfig.data = {
        ...axiosConfig.data,
        username: this.userConfig.inputSetting?.username ?? "",
        password: this.userConfig.inputSetting?.password ?? "",
        pid: this.userConfig.inputSetting?.pid ?? "",
      };
      axiosConfig.headers = {
        ...(axiosConfig.headers ?? {}),
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else if (axiosConfig.url === "/api/v1/jackett/torrents" && !axiosConfig.method) {
      axiosConfig.method = "GET";
      axiosConfig.headers = {
      ...(axiosConfig.headers ?? {}),
      "Authorization": `Bearer ${(await this.getAuthToken()) ?? ""}`,
      };
    }
    
    try {
      // 对于 API 请求，跳过登录检查
      return await super.request<T>(axiosConfig, isApiRequest ? false : checkLogin);
    } catch (error) {
      /*// 如果是 API 请求且是网络错误，重新抛出 API Error
      if (isApiRequest && error instanceof Error && error.message.startsWith('Network Error:')) {
        // 从原错误消息中提取状态码和状态文本
        const match = error.message.match(/Network Error: (\d+)\s*(.*)/);
        if (match) {
          const [, status, statusText] = match;
          throw new Error(`API Error ${status} ${statusText}`.trim());
        }
      }*/
      throw error;
    }
  }

  // TODO：为减少token获取次数，预留函数
  /*
  public async getAuthToken(): Promise<{ token: string; expiry: number }> {
    const { data: apiAuth } = await this.request<AvzNetAuthResp>(
      {
        url: "/api/v1/jackett/auth",
        responseType: "json",
      },
      true,
    );

    apiAuth.authExpiry 
    return this.getFieldData(
      apiAuth,
      this.metadata.userInfo?.selectors!,
      ["authToken", "authExpiry"]
      as Partial<IUserInfo>;
  }
  */
  public async getAuthToken(): Promise<string> {
    const { data: apiAuth } = await this.request<AvzNetAuthResp>(
      {
        url: "/api/v1/jackett/auth",
        responseType: "json",
      },
      true,
    );
    return apiAuth.token ?? "";
  }
  

  // protected override parseTorrentRowForTags(
  //   torrent: Partial<ITorrent>,
  //   row: IAvzNetRawTorrent,
  //   searchConfig: ISearchInput,
  // ): Partial<ITorrent> {
  //   const tags: ITorrentTag[] = [];

  //   const { upload_multiply, download_multiply } = row as { upload_multiply?: number; download_multiply?: number };
  //   if (upload_multiply === 2) {
  //     tags.push({ name: `${upload_multiply}xUp`, color: "lime" });
  //   }
  //   if (download_multiply === 0) {
  //     tags.push({ name: "Free", color: "blue" });
  //   }
  //   if (download_multiply === 0.5) {
  //     tags.push({ name: "50%", color: "deep-orange-darken-1" });
  //   }

  //   torrent.tags = tags;
  //   return torrent;
  // }
}
