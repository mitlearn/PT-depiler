import type { AxiosRequestConfig, AxiosResponse } from "axios";

import PrivateSite from "./AbstractPrivateSite";
import {
  ETorrentStatus,
  type ISiteMetadata,
  type IUserInfo,
  type ITorrent,
  type ITorrentTag,
  type ISearchInput
} from "../types"; 
import { sendMessage } from "@/messages.ts"; // ??getValidToken
import type { IMetadataPiniaStorageSchema } from "@/shared/types/storages/metadata.ts";

export interface AvzTAuthResponse {
  token?: string;
  expiry?: number;
}

export interface IAvzTRawTorrent {
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
  schema: "AvistazTracker",
  type: "private",
  timezoneOffset: "+0100", // ?ο?Jackett??ʱ???+0100

  search: {
    keywordPath: "params.search",
    requestConfig: {
      url: "/api/v1/jackett/torrents",
      responseType: "json",
      params: { in: 1, limit: 50 }, // ????50????????
    },
	advanceKeywordParams: {
    imdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          if (config?.params?.search) {
            config.params.imdb = config.params.search;
            delete config!.params.search;
          }
          return config!;
        }
      },
    tvdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          if (config?.params?.search) {
            config.params.tvdb = config.params.search;
            delete config!.params.search;
          }
          return config!;
        }
      },
    tmdb: {
        requestConfigTransformer: ({ requestConfig: config }) => {
          if (config?.params?.search) {
            config.params.tmdb = config.params.search;
            delete config!.params.search;
          }
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
        selector: "created_at", filters: [{ name: "parseTime" }]
        // filters: [(value: any) => parseTimeWithZone(value, this.metadata.timezoneOffset) ?? "Unknown"],
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
    Ԥ??serinfo?????????
    > User information will never be available in any form or API, as we respect the privacy and confidentiality of user information.
    @refs: https://github.com/pt-plugins/PT-Plugin-Plus/issues/996#issuecomment-1057856310
  */
  /*
  userInfo: {
    pickLast: ["name"], // ????ame????ں????ҳ???
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
        assertion: { name: "url" }
        selectors: {
          joinTime: { selector: ["table.table-striped tr:contains('Joined') td:last-child"], filters: [{ name: "parseTime", args: ["dd MMMM yyyy hh:mm a"] }] },  // "20 May 1900 05:20 pm (X years ago)"
          uploads: { selector: [".tag-green:contains('Uploads:')"], filters: [{ name: "parseNumber" }] },
          snatches: { selector: [".tag-green:contains('Downloads:')"], filters: [{ name: "parseNumber" }] },
          hnrUnsatisfied: { selector: [".tag-green:contains('Hit & Run:')"], filters: [{ name: "parseNumber" }] },
        },
      },
    ],
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
	/*{
	  name: "confirm",
      label: "Confirm",
	  hint: "Only Member Rank and above can use search and must enable RSS for search" +
		"If u confirm above, please enter confirm",
	  required: true,
	}*/
  ],
};

export default class AvistazTracker extends PrivateSite {
  public site: string;

  protected site: string = ""; // 子类中赋值

  // 获取有效 token
  protected async getValidToken(
    username: string,
    password: string,
    pid: string
  ): Promise<{ token: string; expiryAt: number }> {
    const now = Math.floor(Date.now() / 1000);

    const response = await axios.request<{
      token: string;
      expiry: number;
    }>({
      url: "/api/v1/jackett/auth",
      method: "GET",
      headers: { username, password, pid },
      validateStatus: (status) => status === 200
    });

    const { token, expiry } = response.data;
    const expiryAt = now + expiry;

    return { token, expiryAt };
  }

  // 请求搜索结果
  protected async fetchSearchResult(token: string): Promise<ISearchResult> {
    const response = await axios.request<ISearchResult>({
      url: "/api/v1/search",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  }
}

  protected override loggedCheck(raw: AxiosResponse): boolean {
	 return raw.status >= 200 && raw.status < 300;
  }

  protected override parseTorrentRowForTags(
    torrent: Partial<ITorrent>,
    row: IAvzTRawTorrent,
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
