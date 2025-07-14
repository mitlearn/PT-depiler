import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios";
import urlJoin from "url-join";
import Sizzle from "sizzle";
import { set } from "es-toolkit/compat";

import PrivateSite from "./AbstractPrivateSite";
import { retrieveStore } from "@ptd/site/utils/adapter.ts";

import {
  EResultParseStatus,
  ETorrentStatus,
  TSchemaMetadataListSelectors,
  type ISiteMetadata,
  type IUserInfo,
  type ITorrent,
  type ITorrentTag,
  type ISearchInput,
} from "../types";
import { parseTimeWithZone, parseSizeString } from "../utils";

const commonListSelectors: TSchemaMetadataListSelectors = {
  id: {
    selector: "a[href*='/torrent/']",
    attr: "href",
    elementProcess: (href: string) => {
      const match = href.match(/(\d+)(.+)/);
      return match ? parseInt(match[1]) : 0;
      }
  },
  title: { selector: "a[href*='/torrent/']", attr: "title" },
  url: { selector: "a[href*='/torrent/']", attr: "href" },
  link: { selector: "a[href*='/download/torrent/']", attr: "href" },
  comments: { text: "N/A" },
  category: { selector: "td:nth-last-child(2) i", attr: "data-original-title" },
};

interface AuthSuccessResp {
  token: string;
  expiry: number;
}

interface AuthFailResp {
  message: string;
}

type AvzNetAuthResp = AuthSuccessResp | AuthFailResp;

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
  resolution: {
    [key: string]: string;
  };
  created_at: string;
  seed: number;
  leech: number;
  completed: number;
  downloaded: number;
  upload_multiply: number;
  download_multiply: number;
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
  "version" | "schema" | "type" | "timezoneOffset" | "search" | "userInfo" | "userInputSettingMeta" | "list" | "detail"
> = {
  version: 0,
  schema: "AvistazNetwork",
  type: "private",
  // tzOffset@refs: https://github.com/Jackett/Jackett/blob/master/src/Jackett.Common/Indexers/Definitions/Abstract/AvistazTracker.cs#L28C9-L28C122
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
        },
      },
      tvdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "params.tvdb", config!.params.search);
          delete config!.params.search;
          return config!;
        },
      },
      tmdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          set(config!, "params.tmdb", config!.params.search);
          delete config!.params.search;
          return config!;
        },
      },
    },
    selectors: {
      rows: { selector: "data" },
      id: { selector: "id" },
      title: { selector: "file_name" },
      subTitle: { text: "" }, // AvzNet不提供subTitle
      url: { selector: "url" },
      link: { selector: "download" },
      category: {
        selector: "category",
        filters: [
          (category: Record<string, string> | undefined) => {
            if (!category) return "";
            const values = Object.values(category);
            return values.length > 0 ? values[0] : "";
          },
        ],
      },
      time: { selector: "created_at", filters: [{ name: "parseTime" }] },
      size: { selector: "file_size" },
      author: { text: "" },
      seeders: { selector: "seed" },
      leechers: { selector: "leech" },
      completed: { selector: "completed" },
      comments: { text: "N/A" },
      // tags 交由 parseTorrentRowForTags 处理
      // AvzNet不提供progress, status
      progress: { text: 0 },
      status: { text: ETorrentStatus.unknown },

      ext_imdb: { selector: "movie_tv.imdb", filters: [{ name: "extImdbId" }] },
    },
  },

  list: [
    // 种子列表页
    {
      urlPattern: ["/torrents"],
      mergeSearchSelectors: false,
      selectors: {
        ...commonListSelectors,
        rows: { selector: "table.table table-sm table-bordered table-hover > tbody > tr" },

        time: {
          selector: "tr:nth-child(4)",
          elementProcess: (el: HTMLInputElement) => {
            return el.getAttribute("title") || el.textContent;
          },
          filters: [{ name: "parseTime" }],
        },
        size: { selector: "tr:nth-child(5)", filters: [{ name: "parseSize" }] },

        seeders: { selector: "tr:nth-child(6)" },
        leechers: { selector: "tr:nth-child(7)" },
        completed: { selector: "tr:nth-child(8)" },

        // ext_imdb: {
        //   selector: "a[href^='/mdb/title'][href*='imdb=']",
        //   filters: [{ name: "querystring", args: ["imdb"] }, { name: "extImdbId" }],
        // },
      },
    },
    // 下载历史页和HR页
    {
      urlPattern: ["/profile/(.+)/history"],
      mergeSearchSelectors: false,
      selectors: {
        ...commonListSelectors,
        rows: { selector: "table table-sm table-bordered table-striped > tbody > tr" },

        size: { "selector": ".text-yellow", "filters": [{ "name": "parseSize" }] },

        seeders: { "selector": ".text-green.mr-2" },
        leechers: { "selector": ".text-red.mr-2" },
        completed: { "selector": ".text-blue.mr-2" },
      },
    },
  ],

  detail: {
    urlPattern: ["/torrent/\\d+"],
    selectors: {
      id: {
        selector: ":self", // 表示对整个文档（Document）进行操作
        elementProcess: (element: Document) => {
          // 尝试从页面 URL 中获取 ID，例如 /torrent/158672
          const url = element.URL;
          const urlIdMatch = url.match(/\/torrent\/(\d+)/);
          if (urlIdMatch && urlIdMatch[1]) {
            return urlIdMatch[1];
          }

          // 如果 URL 中没有 ID，则尝试从下载链接中获取 ID，例如 https://avz.net/download/torrent/158672.abcdefghijklmn.torrent
          const torrentLink = element.querySelector("a[href*='/download/torrent/']");
          if (torrentLink) {
            const href = torrentLink.getAttribute("href");
            const hrefIdMatch = href?.match(/\/torrent\/(\d+)\./);
            if (hrefIdMatch && hrefIdMatch[1]) {
              return hrefIdMatch[1];
            }
          }

          // 如果两种方式都找不到 ID，则返回 undefined
          return undefined;
        },
      },
      title: {
        selector: [
          "tr:has(td:first-child:contains('Title')) > td:last-child",
        ],
        switchFilters: {
          "tr:has(td:first-child:contains('Title')) > td:last-child": [
            (element: string) => {
              if (!element) {
                return undefined;
              }
              
              return element;
            }
          ],
        },
      },
      link: {
        selector: ["a[href*='/download/torrent/']"],
        attr: "href",
      },
    },
  },

  userInfo: {
    pickLast: ["name"],
    selectors: {
      name: { selector: ["span.user-group.group-member"] },
      levelName: { selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(2)"] },
      uploaded: {
        selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(3)"],
        filters: [{ name: "parseSize" }],
      },
      downloaded: {
        selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(4)"],
        filters: [{ name: "parseSize" }],
      },
      ratio: {
        selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(5)"],
        filters: [{ name: "parseNumber" }],
      },
      bonus: {
        selector: ["body > header > div.ratio-bar.mb-1.pt-2.pl-2.pb-1 > div > div:nth-child(9)"],
        filters: [{ name: "parseNumber" }],
      },
      joinTime: {
        selector: ["table.table-striped tr:contains('Joined') td:last-child"],
        filters: [{ name: "parseTime", args: ["dd MMMM yyyy hh:mm a"] }],
      },
      uploads: { selector: [".card .tag-green"], filters: [{ name: "parseNumber" }] },
      snatches: { selector: [".card .tag-yellow"], filters: [{ name: "parseNumber" }] },
      seeding: { selector: [".card .tag-indigo"], filters: [{ name: "parseNumber" }] },
      hnrUnsatisfied: { selector: [".card .tag-red"], filters: [{ name: "parseNumber" }] },

    // TODO：为减少token获取次数，预留存储位
      authToken: { text: "" },
      authExpiry: { text: "" },
    },
  },

  userInputSettingMeta: [
    {
      name: "username",
      label: "Username",
      hint: "Fill with your username." + "Please Make Sure your RANK >= Member",
      required: true,
    },
    {
      name: "password",
      label: "Password",
      hint: "Fill with your password" + "Please confirm enable ‘Enable RSS Feed’ in account settings",
      required: true,
    },
    {
      name: "pid",
      label: "PID",
      hint:
        "Find in Profile Site, reset in Account Setting Site if you want to reset." +
        "PID is like your password, you must keep it safe!",
      required: true,
    },
  ],
};

export default class AvistazNetwork extends PrivateSite {
  /*
    应站点要求，不启用用户数据获取
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  public override async getUserInfoResult(lastUserInfo: Partial<IUserInfo> = {}): Promise<IUserInfo> {
    let flushUserInfo: IUserInfo = {
      status: EResultParseStatus.unknownError,
      updateAt: +new Date(),
      site: this.metadata.id,
    };

    flushUserInfo = {
      ...flushUserInfo,
      status: EResultParseStatus.passParse,
      name: this.userConfig.inputSetting?.username,
      levelName: "应站点要求，不启用用户数据获取",
    };

    /* 预留获取用户信息
    if (!this.allowQueryUserInfo) {
      flushUserInfo.status = EResultParseStatus.passParse;
      return flushUserInfo;
    }

      // 对 AvistazNetwork，如果定义了 process，则按照 AbstractPrivateSite 的方式处理
      if (Array.isArray(this.metadata.userInfo?.process)) {
        return await super.getUserInfoResult(lastUserInfo);
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
    */
    return flushUserInfo;
  }

  protected async getBaseInfoFromSite(): Promise<Partial<IUserInfo>> {
    const { data: pageDocument } = await this.request<Document>({
      url: "/",
      responseType: "document",
    });

    return this.getFieldsData(pageDocument, this.metadata.userInfo?.selectors!, [
      "name",
      "levelName",
      "uploaded",
      "downloaded",
      "ratio",
      "bonus",
    ]) as Partial<IUserInfo>;
  }

  protected async getExtendInfoFromProfile(userName: string): Promise<Partial<IUserInfo>> {
    const { data: pageDocument } = await this.request<Document>({
      url: urlJoin("/profile", userName),
      responseType: "document",
    });

    return this.getFieldsData(pageDocument, this.metadata.userInfo?.selectors!, [
      "joinTime",
      "uploads",
      "snatches",
      "seeding",
      "hnrUnsatisfied",
    ]) as Partial<IUserInfo>;
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
    checkLogin: boolean = true,
  ): Promise<AxiosResponse<T>> {
    if (axiosConfig.url === "/api/v1/jackett/auth") {
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
    }
    if (axiosConfig.url?.startsWith("/api/v1/jackett/torrents")) {
      axiosConfig.method = "GET";
      const token = await this.getAuthToken();
			axiosConfig.headers = {
				...(axiosConfig.headers ?? {}),
				Authorization: `Bearer ${token}`,
			};
    }

    return super.request<T>(axiosConfig, checkLogin);
  }

  // 使用 retrieveRuntimeSettings 作为中间存储，存储 `token` 以及 `expiry` 降低授权频率
  public async getAuthToken(lastUserInfo: Partial<IUserInfo> = {}): Promise<string> {
    const currentTime = Math.floor(Date.now() / 1000); // 当前时间戳，单位为秒

    // 1. 判断 runtimeSettings 获取存储的 token 和 expiry
    const storedAuthToken = await this.retrieveRuntimeSettings<string>("authToken");
    const storedAuthExpiry = await this.retrieveRuntimeSettings<number>("authExpiry");

    if (storedAuthToken && storedAuthExpiry && storedAuthExpiry > currentTime) {
      console.log("Found valid token in runtimeSettings. Returning existing token.");
      return storedAuthToken;
    }

    // 2. 如果过期或不存在，发起新的授权请求
    console.log("Token expired or not found. Requesting new token...");
    try {
      const { data: apiAuth } = await this.request<AvzNetAuthResp>({
        url: "/api/v1/jackett/auth",
        responseType: "json",
      });

      // 使用类型守卫判断响应类型
      if ("token" in apiAuth  && typeof apiAuth.token === 'string') { // 检查 token 属性是否存在且为字符串

        // 3. 计算新的过期时间并存储
        const newAuthExpiry = currentTime + apiAuth.expiry; // expiry 已经是 number 类型，直接相加
        await this.storeRuntimeSettings("authToken", apiAuth.token);
        await this.storeRuntimeSettings("authExpiry", newAuthExpiry);

        console.log("Successfully obtained and stored new token.");
        return apiAuth.token;
      } else if ("message" in apiAuth && typeof apiAuth.message === 'string') { // 检查 message 属性是否存在且为字符串
        console.error(`Failed to get new token: ${apiAuth.message}`);
      } else {
        console.error("Failed to get new token: Unexpected response format or missing required properties.");
      }
    } catch (error) {
      throw new Error(`Error during authorization request`);
    }

    // 如果所有尝试都失败，则返回空字符串
    return "";
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
    switch (download_multiply) {
      case 0:
        tags.push({ name: "Free", color: "blue" });
        break;
      case 0.5:
        tags.push({ name: "50%", color: "deep-orange-darken-1" });
        break;
    }

    torrent.tags = tags;
    return torrent;
  }
}
