import type { AxiosRequestConfig, AxiosResponse } from "axios"; // 用于request方法

import PrivateSite from "./AbstractPrivateSite";
import { parseTimeWithZone } from "../utils"; // 仅保留使用的parseTimeWithZone
import { ETorrentStatus, type ISiteMetadata, type ITorrent, type ISearchInput, type ITorrentTag } from "../types"; // 删除未使用的EResultParseStatus和IUserInfo
import { sendMessage } from "@/messages.ts"; // 用于getValidToken
import type { IMetadataPiniaStorageSchema } from "@/shared/types/storages/metadata.ts"; // 用于getValidToken

export interface AvzTRawResponse {
  status: "success" | "failure" | "error";
  response: any;
  error?: string;
}

export interface IAvzTRawTorrent {
  current_page: number;
  data: {
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
  }[];

  first_page_url?: string;
  from: number | null;
  last_page: number;
  last_page_url?: string;
  next_page_url: string | null;
  path: string;
  per_page: number | string; // API可能返回字符串或数字
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

export const SchemaMetadata: Pick<
  ISiteMetadata,
  "version" | "schema" | "type" | "timezoneOffset" | "search" | "userInfo" | "userInputSettingMeta"
> = {

  version: 0,
  schema: "AvistazTracker",
  type: "private",
  timezoneOffset: "+0100", // 参考Jackett，时区设置+0100

  search: {
    keywordPath: "params.search",
    requestConfig: {
      url: "/api/v1/jackett/torrents",
      responseType: "json",
      params: { in: 1, limit: 50 }, //最大值50，更改无效
    },
  advanceKeywordParams: {
      imdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          if (config?.data?.search) {
            config.data.imdb_id = config.data.search;
            delete config!.data.search;
          }
          return config!;
        }
      },
      tmdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          if (config?.data?.search) {
            config.data.tmdb_id = config.data.search;
            delete config!.data.search;
          }
          return config!;
        }
      },
    },
    selectors: {
      rows: { selector: "data" },
      id: { selector: "id" },
      title: { selector: "file_name" },
      subTitle: { text: "" }, // Avz未提供subTitle
      url: { selector: "url" },
      link: { selector: "download" },
      category: { 
        selector: "category",
        filters: [(value: any) => Object.values(value).join(" / ")],
      },
      time: { 
        selector: "created_at",
        filters: [(value: any) => parseTimeWithZone(value, this.metadata.timezoneOffset)],
      },
      size: { selector: "file_size" },
      author: { text: "" },
      seeders: { selector: "seed" },
      leechers: { selector: "leech" },
      completed: { selector: "completed" },
      //  Avz未提供progress, status
      progress: { text: 0 },
      status: { text: ETorrentStatus.unknown },
    },
  },

  /*
    预留userinfo获取，不启用
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  /*
  // 【新增1】参考zhuque.ts，添加userInfo配置
  userInfo: {
    pickLast: ["name"], // 保留name字段用于后续详情页获取
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
        requestConfig: { url: "/profile/${params.name}", responseType: "document" },
        selectors: {
          joinTime: { selector: ["table.table-striped tr:contains('Joined') td:last-child"], filters: [{ name: "parseTime", args: ["dd MMMM yyyy hh:mm a"] }] },
          uploads: { selector: [".tag-green:contains('Uploads:')"], filters: [{ name: "parseNumber" }] },
          snatches: { selector: [".tag-green:contains('Downloads:')"], filters: [{ name: "parseNumber" }] },
          hnrUnsatisfied: { selector: [".tag-green:contains('Hit & Run:')"], filters: [{ name: "parseNumber" }] },
        },
      },
    ],
  },
  */

  /*
    预留userinfo获取，不启用
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  /*
  userInfo: {
    process: [
      {
        requestConfig: { url: "/", responseType: "document" },
        fields: [
          "name",
          "uploaded",
          "downloaded",
          "ratio",
          "levelName",
          "bonus",
        ],
      },
      {
        requestConfig: {
          url: "/profile/${flushUserInfo.name}",
          // url: "/profile/${params.name}",
          responseType: "document",
        },
        fields: [
          "uploads",
          "snatches"
          "joinTime",
          "hnrUnsatisfied",
        ],
      },
    ],
    selectors: {
      // "page": "/",
      name: {
        selector: [".ratio-bar .user-group.group-member"],
      },
      uploaded: {
        selector: [".ratio-bar [data-original-title='Upload']"],
        filters: [{ name: "parseSize" }]
      },
      downloaded: {
        selector: [".ratio-bar [data-original-title='Download']"],
        filters: [{ name: "parseSize" }]
      },
      ratio: {
        selector: [".ratio-bar [data-original-title='Ratio']"],
        filters: [{ name: "parseNumber" }]
      },
      levelName: {
        selector: [".ratio-bar .fa-users + .user-group.group-member"],
      },
      bonus: {
        selector: [".ratio-bar .fa-star + a[title='My Bonus Points'] + text()"],
        filters: [{ name: "parseNumber" }]
      },

      // "page": "/profile/$user.name$",
      joinTime: {
        selector: ["table.table-striped tr:contains('Joined') td:last-child"],
        filters:  [{ name: "parseTime", args: [ "dd MMMM yyyy hh:mm a" ] }] // "20 May 1900 05:20 pm (X years ago)"
      },
      uploads: {
        selector: [".tag-green:contains('Uploads:')"],
        filters: [{ name: "parseNumber" }]
      },
      snatches: {
        selector: [".tag-green:contains('Downloads:')"],
        filters: [{ name: "parseNumber" }]
      },
      hnrUnsatisfied: {
        selector: [".tag-green:contains('Hit & Run:')"],
        filters: [{ name: "parseNumber" }]
      },
    },
  },
*/

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

export default class AvistazTracker extends PrivateSite {
  protected site: string;

  constructor() {
    super();
    // 从子类的静态属性 siteMetadata 读取 name
    const ctor = this.constructor as typeof AvistazTracker & { siteMetadata?: { name: string } };
    this.site = ctor.siteMetadata?.name ?? "AvistazTracker";
  }

  /*
  // 【新增2】重写getUserInfoResult方法，统一处理token获取和用户信息
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
      // 确保有有效的token并存储在userInfo中
      const token = await this.getValidToken();
      
      // 获取基础用户信息
      const baseInfo = await this.getUserBaseInfoFromSite();
      flushUserInfo = { ...flushUserInfo, ...baseInfo };

      // 获取用户名用于详情页查询
      const username = this.userConfig.inputSetting?.username ?? "";
      if (username) {
        const extendInfo = await this.getUserExtendInfoFromProfile(username);
        flushUserInfo = { ...flushUserInfo, ...extendInfo };
      }

      // 设置用户id和name
      flushUserInfo.id = username;
      flushUserInfo.name = baseInfo.name || username;

      // 【新增5】将authToken信息存储在userInfo的自定义字段中
      // 这样可以通过IUserInfo的[key: string]: any 来存储
      (flushUserInfo as any).authToken = {
        token,
        expiresAt: this.getTokenExpiresAt(),
      };

      if (this.metadata.levelRequirements && flushUserInfo.levelName && typeof flushUserInfo.levelId === "undefined") {
        flushUserInfo.levelId = this.guessUserLevelId(flushUserInfo as IUserInfo);
      }
      
      flushUserInfo.status = EResultParseStatus.success;
    } catch (error) {
      flushUserInfo.status = EResultParseStatus.parseError;
    }

    return flushUserInfo;
  }

  // 【新增6】获取当前token的过期时间
  private getTokenExpiresAt(): number {
    // 从存储中获取当前token的过期时间
    return this._tokenExpiresAt || 0;
  }

  private _tokenExpiresAt: number = 0; // 【新增7】临时存储token过期时间

  // 【新增3】获取首页基础用户信息
  protected async getUserBaseInfoFromSite(): Promise<Partial<IUserInfo>> {
    const { data: dataDocument } = await this.request<Document>({
      url: "/",
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.process?.[0]?.selectors!,
      ["name", "uploaded", "downloaded", "ratio", "levelName", "bonus"]
    ) as Partial<IUserInfo>;
  }

  // 【新增4】从用户详情页获取扩展信息
  protected async getUserExtendInfoFromProfile(username: string): Promise<Partial<IUserInfo>> {
    const { data: dataDocument } = await this.request<Document>({
      url: `/profile/${username}`,
      responseType: "document",
    });

    return this.getFieldsData(
      dataDocument,
      this.metadata.userInfo?.process?.[1]?.selectors!,
      ["joinTime", "uploads", "snatches", "hnrUnsatisfied"]
    ) as Partial<IUserInfo>;
  }
  */

  public override async request<T>(
    axiosConfig: AxiosRequestConfig,
    checkLogin: boolean = true,
  ): Promise<AxiosResponse<T>> {
    const url = axiosConfig.url ?? "";

    if (url.includes("/api/v1/jackett/auth")) {
      const { username, password, pid } = this.userConfig.inputSetting!; // 【修改9】修正字段名username而非user
      axiosConfig.method = "POST"
      axiosConfig.headers = {
        ...(axiosConfig.headers ?? {}),
        username, // 【修改10】对应修正
        password,
        pid,
      };
    } else if (url.includes("/api/v1/jackett/torrent")) {
      const token = await this.getValidToken();
      axiosConfig.method = "GET"
      axiosConfig.headers = {
        ...(axiosConfig.headers ?? {}),
        Authorization: `Bearer ${token}`,
      };
    }

    return super.request<T>(axiosConfig, checkLogin);
  }

  private async getValidToken(): Promise<string> {
    const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
    const userList = metadataStore?.lastUserInfo ?? [];
    const now = Math.floor(Date.now() / 1000);

    // 使用站点id来查找用户信息，添加类型注解
    const userIndex = userList.findIndex((u: any) => u.site === this.metadata.id);
    const userInfo = userIndex !== -1 ? userList[userIndex] : undefined;
    
    // authToken应该直接作为userInfo的属性，而不是嵌套对象
    const authToken = userInfo?.authToken;
    const expiresAt = userInfo?.authTokenExpiresAt;

    if (
      authToken &&
      expiresAt &&
      now < expiresAt
    ) {
      return authToken;
    }

    const response = await this.request<{ token?: string; expiry?: number; message?: string }>(
      {
        url: "/api/v1/jackett/auth",
      },
      false, // 添加缺失的第二个参数
    );

    const { token, expiry, message } = response.data;

    if (!token || !expiry) {
      throw new Error(message || `请求 ${this.metadata.name} 失败`);
    }

    const newExpiresAt = now + expiry;

    // 将token和过期时间作为userInfo的直接属性存储
    const updatedUser = {
      ...(userInfo ?? {}),
      site: this.metadata.id,
      authToken: token,
      authTokenExpiresAt: newExpiresAt,
      updateAt: +new Date(),
    };

    if (userIndex !== -1) {
      userList[userIndex] = updatedUser;
    } else {
      userList.push(updatedUser);
    }

    const newMetadata = {
      ...metadataStore,
      lastUserInfo: userList,
    };

    await sendMessage("setExtStorage", { metadata: newMetadata });

    return token;
  }

  protected override parseTorrentRowForTags(
    torrent: Partial<ITorrent>,
    row: IAvzTRawTorrent,
    searchConfig: ISearchInput,
  ): Partial<ITorrent> {
    const tags: ITorrentTag[] = [];

    // 处理基本的促销情况
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
