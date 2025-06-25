import type { AxiosRequestConfig, AxiosResponse } from "axios";
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
} from "../utils";

export interface AvzNetAuthResp {
  token?: string;
  expiry?: number;
}

export interface IAvzNetRawTorrent {
  id: number;
  file_name: string;
  file_size: number;
  file_count: number;
  info_hash: string;
  url: string;
  download: string;
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
      imdb?: string;
      tmdb?: string;
      tvdb?: string;
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
    keywordPath: "params.search",
    requestConfig: {
      url: "/api/v1/jackett/torrents",
      responseType: "json",
      params: { in: 1, limit: 50 }, // 最大50个结果
    },
    advanceKeywordParams: {
      imdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "params.imdb", config!.params.search.replace("tt", ""));
          delete config!.params.search;
          return config!;
        }
      },
      tvdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "params.tvdb", config!.params.search);
          delete config!.params.search;
          return config!;
        }
      },
      tmdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "params.tmdb", config!.params.search);
          delete config!.params.search;
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
        filters: [(value: any) => Object.values(value).join(" / ")],
      },
      time: { 
        selector: "created_at", 
        filters: [
          (value: string) => parseTimeWithZone(value, "-0400")
          // (value: string) => parseTimeWithZone(value, this.timezoneOffset ?? "+0000") ?? value
        ],
      },
      size: { selector: "file_size", filters: [{ name: "parseSize" }] },
      author: { text: "" },
      seeders: { selector: "seed" },
      leechers: { selector: "leech" },
      completed: { selector: "completed" },
      // Avz不提供progress, status
      progress: { text: 0 },
      status: { text: ETorrentStatus.unknown },
    },
  },

  /*
    预留获取用户信息
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  
  userInfo: {
    pickLast: ["name"],
    process: [
      {
        requestConfig: { url: "/", responseType: "document" },
        selectors: {
          name: { selector: [".ratio-bar .user-group.group-member"] },
          uploaded: { selector: [".ratio-bar [data-original-title='Upload']"], filters: [{ name: "parseSize" }] },
          downloaded: { selector: [".ratio-bar [data-original-title='Download']"], filters: [{ name: "parseSize" }] },
          ratio: { selector: [".ratio-bar [data-original-title='Ratio']"], filters: [{ name: "parseNumber" }] },
          levelName: { selector: [".ratio-bar .fa-users + .user-group.group-member"] },
          bonus: { selector: [".ratio-bar .fa-star + a[title='My Bonus Points'] + text()"], filters: [{ name: "parseNumber" }] },
        },
      },
      {
        requestConfig: { url: "/profile/$name$", responseType: "document" },
        assertion: { name: "url" },
        selectors: {
          joinTime: { selector: ["table.table-striped tr:contains('Joined') td:last-child"], filters: [{ name: "parseTime", args: ["dd MMMM yyyy hh:mm a"] }] },  // "20 May 1900 05:20 pm (X years ago)"
          uploads: { selector: [".tag-green:contains('Uploads:')"], filters: [{ name: "parseNumber" }] },
          snatches: { selector: [".tag-green:contains('Downloads:')"], filters: [{ name: "parseNumber" }] },
          hnrUnsatisfied: { selector: [".tag-green:contains('Hit & Run:')"], filters: [{ name: "parseNumber" }] },
        },
      },
    /*
      {
        requestConfig: { url: "/profile/$name$", responseType: "document" },
        selectors: {
          authToken: { selector: ["token"] },
          authExpiry: { selector: ["expiry"] },
      },
    */
    ],
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
      // 获取主页中的用户基础信息
      flushUserInfo = { ...flushUserInfo, ...(await this.getBaseInfoFromSite()) };

      if (flushUserInfo.username) {
        flushUserInfo = {
          ...flushUserInfo,
          ...(await this.getExtendInfoFromProfile(this.userConfig.inputSetting?.username as string)),
          // ...(await this.getExtendInfoFromProfile(flushUserInfo.username as string)),
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
    const { data: dataDocument } = await this.request<Document>({
      url: "/",
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.selectors!,
      ["name", "uploaded", "downloaded", "ratio", "levelName", "bonus"]
    ) as Partial<IUserInfo>;
  }

  protected async getExtendInfoFromProfile(username: string): Promise<Partial<IUserInfo>> {
    const { data: dataDocument } = await this.request<Document>({
      url: "/profile/${username}",
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.selectors!,
      ["joinTime", "uploads", "snatches", "hnrUnsatisfied"]
    ) as Partial<IUserInfo>;
  }
 
  public override async request<T>(
    axiosConfig: AxiosRequestConfig, 
    checkLogin: boolean = true
  ): Promise<AxiosResponse<T>> {
    // 获取请求的 URL 用于判断处理逻辑
    const requestUrl = axiosConfig.url || "/";
    const isApiRequest = requestUrl.startsWith("/api/v1/jackett/");
    
    // 为特定的 API 端点设置默认的 HTTP 方法
    if (requestUrl === "/api/v1/jackett/auth" && !axiosConfig.method) {
      axiosConfig.method = "POST";
      const formData = new URLSearchParams({
        username: this.userConfig.inputSetting?.username ?? "",
        password: this.userConfig.inputSetting?.password ?? "",
        pid: this.userConfig.inputSetting?.pid ?? "",
      });
      axiosConfig.data = formData;
      axiosConfig.headers = {
        ...(axiosConfig.headers ?? {}),
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else if (requestUrl === "/api/v1/jackett/torrents" && !axiosConfig.method) {
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
      // 如果是 API 请求且是网络错误，重新抛出 API Error
      if (isApiRequest && error instanceof Error && error.message.startsWith('Network Error:')) {
        // 从原错误消息中提取状态码和状态文本
        const match = error.message.match(/Network Error: (\d+)\s*(.*)/);
        if (match) {
          const [, status, statusText] = match;
          throw new Error(`API Error ${status} ${statusText}`.trim());
        }
      }
      // 其他错误直接重新抛出
      throw error;
    }
  }

  /*
  public async getAuthToken(): Promise<{ token: string; expiry: number }> {
    const { data: apiAuth } = await this.request<AvzNetAuthResp>(
      {
        url: "/api/v1/jackett/auth",
        responseType: "json",
      },
      true,
    );
    return this.getFieldData(
      apiAuth,
      this.metadata.userInfo?.selectors!, [
      "authToken",
      "authExpiry",
    ] as (keyof Partial<IUserInfo>)[]) as Partial<IUserInfo>;
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

  protected override parseTorrentRowForTags(
    torrent: Partial<ITorrent>,
    row: IAvzNetRawTorrent,
    searchConfig: ISearchInput,
  ): Partial<ITorrent> {
    const tags: ITorrentTag[] = [];

    const { upload_multiply, download_multiply } = row as { upload_multiply?: number; download_multiply?: number };
    if (upload_multiply === 2) {
      tags.push({ name: `${upload_multiply}xUp`, color: "lime" });
    }
    if (download_multiply === 0) {
      tags.push({ name: "Free", color: "blue" });
    }
    if (download_multiply === 0.5) {
      tags.push({ name: "50%", color: "deep-orange-darken-1" });
    }

    torrent.tags = tags;
    return torrent;
  }
}
